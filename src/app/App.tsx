import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useNodesState, type Node } from "@xyflow/react";
import { useRunStore } from "@/hooks/use-run-store";
import { useLiveDrain } from "@/hooks/use-live-drain";
import { useCanvasAgents } from "@/hooks/use-canvas-agents";
import { toFlowNodes, toMessages, toPreRunNodes, toAgentHistory, type AgentNodeData } from "@/lib/adapters";
import { AppShell } from "@/components/layout/app-shell";
import { FlowGraph } from "@/components/graph/flow-graph";
import { ConversationPanel } from "@/components/conversation/conversation-panel";
import { AgentDrawer } from "@/components/graph/agent-drawer";
import { AddAgentButton } from "@/components/graph/add-agent-button";
import { getRoleById } from "@/shared/contracts/types";

export function App() {
  const store = useRunStore();
  const { isLive, handleStartRun, handleResolveApproval } = useLiveDrain({
    activeRunId: store.activeRunId,
    runMap: store.runMap,
    setActiveRunId: store.setActiveRunId,
    commitRunSnapshot: store.commitRunSnapshot,
    updateRunEvents: store.updateRunEvents
  });

  const canvas = useCanvasAgents();
  const [selectedAgentId, setSelectedAgentId] = useState<string | null>(null);

  const isPreRun = !isLive && store.projection.phase === "draft";
  const approvalPending = store.projection.approval.status === "pending";

  // Stable key to detect when source data actually changes
  const sourceKey = isPreRun
    ? `draft:${canvas.roleIds.join(",")}`
    : `live:${store.projection.runId}:${store.activeEvents.length}:${store.projection.activeAgentId}`;

  // Choose nodes: pre-run draft nodes or live projection nodes
  const source = useMemo(() => {
    return isPreRun
      ? toPreRunNodes(canvas.canvasAgents)
      : toFlowNodes(store.projection);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [sourceKey]);

  const [nodes, setNodes, onNodesChange] = useNodesState<Node<AgentNodeData>>(source.nodes);
  const edges = source.edges;

  // Sync nodes when source data changes
  const prevSourceKeyRef = useRef(sourceKey);
  useEffect(() => {
    if (prevSourceKeyRef.current !== sourceKey) {
      prevSourceKeyRef.current = sourceKey;
      setNodes(source.nodes);
    }
  }, [sourceKey, source.nodes, setNodes]);

  // Auto-dismiss drawer when approval is pending
  useEffect(() => {
    if (approvalPending) setSelectedAgentId(null);
  }, [approvalPending]);

  // Auto-dismiss drawer when run starts
  useEffect(() => {
    if (isLive) setSelectedAgentId(null);
  }, [isLive]);

  const handleNodeClick = useCallback((nodeId: string) => {
    setSelectedAgentId((prev) => (prev === nodeId ? null : nodeId));
  }, []);

  const { reset: resetCanvas, roleIds } = canvas;
  const handleStartRunWithAgents = useCallback(
    (task: string) => {
      handleStartRun(task, roleIds);
      resetCanvas();
    },
    [handleStartRun, roleIds, resetCanvas]
  );

  // Build drawer content
  let drawerContent = null;
  if (selectedAgentId) {
    const isDraft = selectedAgentId.startsWith("draft-");
    if (isDraft) {
      const roleId = selectedAgentId.replace("draft-", "");
      const role = getRoleById(roleId);
      drawerContent = (
        <AgentDrawer
          agent={role}
          history={[]}
          isLive={isLive}
          isDraft
          onClose={() => setSelectedAgentId(null)}
          onRemove={() => {
            canvas.removeAgent(roleId);
            setSelectedAgentId(null);
          }}
        />
      );
    } else {
      const agent = store.projection.agents.find((a) => a.id === selectedAgentId);
      const history = agent
        ? toAgentHistory(selectedAgentId, store.activeEvents, store.projection.agents)
        : [];
      drawerContent = (
        <AgentDrawer
          agent={agent ?? null}
          history={history}
          isLive={isLive}
          isDraft={false}
          onClose={() => setSelectedAgentId(null)}
        />
      );
    }
  }

  const messages = toMessages(store.projection, store.activeEvents);

  return (
    <AppShell
      projection={store.projection}
      isLive={isLive}
      drawerContent={drawerContent}
      graphPanel={
        <FlowGraph
          nodes={nodes}
          edges={edges}
          onNodesChange={onNodesChange}
          onNodeClick={handleNodeClick}
          extraControls={
            isPreRun ? (
              <AddAgentButton
                availableRoles={canvas.availableRoles}
                onAddAgent={canvas.addAgent}
              />
            ) : undefined
          }
        />
      }
      conversationPanel={
        <ConversationPanel
          messages={messages}
          onStartRun={handleStartRunWithAgents}
          onApprove={() => handleResolveApproval("approved")}
          onReject={() => handleResolveApproval("rejected")}
          isLive={isLive}
          approvalPending={approvalPending}
          hasAgents={canvas.roleIds.length > 0}
        />
      }
    />
  );
}
