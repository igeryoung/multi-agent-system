import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useNodesState, type Node } from "@xyflow/react";
import { useRunStore } from "@/hooks/use-run-store";
import { useSessionStore } from "@/hooks/use-session-store";
import { useLiveDrain } from "@/hooks/use-live-drain";
import { useCanvasAgents } from "@/hooks/use-canvas-agents";
import {
  toAgentHistory,
  toFlowNodes,
  toMessages,
  toPreRunNodes,
  type AgentNodeData
} from "@/lib/adapters";
import { AppShell } from "@/components/layout/app-shell";
import { SessionSidebar } from "@/components/layout/session-sidebar";
import { FlowGraph } from "@/components/graph/flow-graph";
import { ConversationPanel } from "@/components/conversation/conversation-panel";
import { AgentDrawer } from "@/components/graph/agent-drawer";
import { AddAgentButton } from "@/components/graph/add-agent-button";
import { getRoleById } from "@/shared/contracts/types";

export function App() {
  const runStore = useRunStore();
  const sessionStore = useSessionStore({ runMap: runStore.runMap });
  const [selectedAgentId, setSelectedAgentId] = useState<string | null>(null);

  const activeSession = sessionStore.activeSession;
  const activeRunId = activeSession?.linkedRunId ?? null;
  const activeEvents = runStore.getRunEvents(activeRunId);
  const projection = runStore.getProjection(activeRunId);

  const liveSession = sessionStore.sessions.find(
    (session) => session.sessionId === sessionStore.liveSessionId
  ) ?? null;
  const liveRunId = liveSession?.linkedRunId ?? null;

  const { isLive, handleStartRun, handleResolveApproval } = useLiveDrain({
    activeSessionId: sessionStore.activeSessionId,
    activeSessionHasLinkedRun: Boolean(activeSession?.linkedRunId),
    liveSessionId: sessionStore.liveSessionId,
    liveRunId,
    runMap: runStore.runMap,
    commitRunSnapshot: runStore.commitRunSnapshot,
    updateRunEvents: runStore.updateRunEvents,
    attachRunToSession: sessionStore.attachRunToSession,
    markLiveSession: sessionStore.markLiveSession,
    setActiveSessionId: sessionStore.setActiveSessionId
  });

  const canvas = useCanvasAgents({
    selectedRoleIds: activeSession?.draft.selectedRoleIds ?? [],
    onChangeRoleIds: (roleIds) => {
      if (!activeSession) return;
      sessionStore.updateSessionDraft(activeSession.sessionId, {
        selectedRoleIds: roleIds
      });
    }
  });

  const isPreRun = !activeSession?.linkedRunId;
  const approvalPending = projection.approval.status === "pending";
  const sourceKey = isPreRun
    ? `draft:${activeSession?.sessionId}:${canvas.roleIds.join(",")}`
    : `live:${activeRunId}:${activeEvents.length}:${projection.activeAgentId}`;

  const source = useMemo(() => (
    isPreRun
      ? toPreRunNodes(canvas.canvasAgents)
      : toFlowNodes(projection)
  ), [canvas.canvasAgents, isPreRun, projection, sourceKey]);

  const [nodes, setNodes, onNodesChange] = useNodesState<Node<AgentNodeData>>(source.nodes);
  const prevSourceKeyRef = useRef(sourceKey);

  useEffect(() => {
    if (prevSourceKeyRef.current !== sourceKey) {
      prevSourceKeyRef.current = sourceKey;
      setNodes(source.nodes);
    }
  }, [setNodes, source.nodes, sourceKey]);

  useEffect(() => {
    setSelectedAgentId(null);
  }, [activeSession?.sessionId, approvalPending]);

  const handleNodeClick = useCallback((nodeId: string) => {
    setSelectedAgentId((previous) => (previous === nodeId ? null : nodeId));
  }, []);

  const handleStartRunWithAgents = useCallback((task: string) => {
    if (!activeSession || activeSession.linkedRunId) return;
    handleStartRun(task, canvas.roleIds);
  }, [activeSession, canvas.roleIds, handleStartRun]);

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
      const agent = projection.agents.find((candidate) => candidate.id === selectedAgentId);
      const history = agent
        ? toAgentHistory(selectedAgentId, activeEvents, projection.agents)
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

  const messages = toMessages(projection, activeEvents);
  const canStartRun = Boolean(
    activeSession &&
    !activeSession.linkedRunId &&
    sessionStore.liveSessionId === null &&
    canvas.roleIds.length > 0
  );

  const helperText = (() => {
    if (!activeSession) return "Create a session to begin.";

    if (sessionStore.liveSessionId && sessionStore.liveSessionId !== activeSession.sessionId) {
      return `${liveSession?.title ?? "Another session"} is live. Browsing is allowed, but starting a new run is blocked until it finishes.`;
    }

    if (sessionStore.liveSessionId === activeSession.sessionId) {
      return approvalPending
        ? "This live session is awaiting approval. Resolve it before continuing."
        : "This session is currently live. Starting another run is disabled.";
    }

    if (activeSession.linkedRunId) {
      return "This session already owns a run. Create a new session for a new task.";
    }

    if (canvas.roleIds.length === 0) {
      return "Add agents on the canvas using the + button before starting.";
    }

    return null;
  })();

  const submitLabel = (() => {
    if (sessionStore.liveSessionId && sessionStore.liveSessionId !== activeSession?.sessionId) {
      return "Another Session Is Live";
    }

    if (sessionStore.liveSessionId === activeSession?.sessionId) {
      return approvalPending ? "Approval Required" : "Run In Progress...";
    }

    if (activeSession?.linkedRunId) {
      return "Session Locked To Run";
    }

    return undefined;
  })();

  return (
    <AppShell
      sessionSidebar={
        <SessionSidebar
          sessions={sessionStore.sessions.map((session) => {
            const sessionProjection = runStore.getProjection(session.linkedRunId);
            return {
              sessionId: session.sessionId,
              title: session.title,
              updatedAt: session.updatedAt,
              isActive: session.sessionId === sessionStore.activeSessionId,
              isLive: session.sessionId === sessionStore.liveSessionId,
              hasPendingApproval: sessionProjection.approval.status === "pending",
              isRunBacked: Boolean(session.linkedRunId)
            };
          })}
          onCreateSession={sessionStore.createSession}
          onSelectSession={sessionStore.setActiveSessionId}
          onRenameSession={sessionStore.renameSession}
          onDeleteSession={sessionStore.deleteSession}
        />
      }
      projection={projection}
      isLive={isLive}
      drawerContent={drawerContent}
      graphPanel={(
        <FlowGraph
          nodes={nodes}
          edges={source.edges}
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
      )}
      conversationPanel={(
        <ConversationPanel
          messages={messages}
          task={activeSession?.draft.taskInput ?? ""}
          onTaskChange={(task) => {
            if (!activeSession) return;
            sessionStore.updateSessionDraft(activeSession.sessionId, {
              taskInput: task
            });
          }}
          onStartRun={handleStartRunWithAgents}
          onApprove={() => handleResolveApproval("approved")}
          onReject={() => handleResolveApproval("rejected")}
          isLive={isLive}
          approvalPending={approvalPending}
          hasAgents={canvas.roleIds.length > 0}
          taskInputDisabled={!canStartRun}
          helperText={helperText}
          submitLabel={submitLabel}
        />
      )}
    />
  );
}
