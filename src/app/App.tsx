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
  type AgentNodeData,
  type ConversationMessage
} from "@/lib/adapters";
import { AppShell } from "@/components/layout/app-shell";
import {
  SessionSidebar,
  SessionSidebarToggle
} from "@/components/layout/session-sidebar";
import { FlowGraph } from "@/components/graph/flow-graph";
import { ConversationPanel } from "@/components/conversation/conversation-panel";
import { AgentDrawer } from "@/components/graph/agent-drawer";
import { AddAgentButton } from "@/components/graph/add-agent-button";
import { getRoleById, HEAD_AGENT, type RoleDefinition } from "@/shared/contracts/types";
import { Plus, AlertTriangle, X as XIcon } from "lucide-react";

const SESSION_SIDEBAR_VISIBILITY_KEY = "signal-atlas:session-sidebar-visible";

export function App() {
  const runStore = useRunStore();
  const sessionStore = useSessionStore({ runMap: runStore.runMap });
  const [selectedAgentId, setSelectedAgentId] = useState<string | null>(null);
  const [runError, setRunError] = useState<{ key: string; summary: string; diagnostics: string[] } | null>(null);
  const [dismissedErrorKey, setDismissedErrorKey] = useState<string | null>(null);
  const [isSessionSidebarVisible, setIsSessionSidebarVisible] = useState(() => {
    if (typeof window === "undefined") return true;
    return window.localStorage.getItem(SESSION_SIDEBAR_VISIBILITY_KEY) !== "false";
  });

  useEffect(() => {
    window.localStorage.setItem(
      SESSION_SIDEBAR_VISIBILITY_KEY,
      String(isSessionSidebarVisible)
    );
  }, [isSessionSidebarVisible]);

  const activeSession = sessionStore.activeSession;
  const activeRunId = activeSession?.linkedRunIds.at(-1) ?? null;
  const allSessionRunIds = activeSession?.linkedRunIds ?? [];
  const activeEvents = runStore.getRunEvents(activeRunId);
  const projection = runStore.getProjection(activeRunId);

  const liveSession = sessionStore.sessions.find(
    (session) => session.sessionId === sessionStore.liveSessionId
  ) ?? null;
  const liveRunId = liveSession?.linkedRunIds.at(-1) ?? null;

  const { isLive, isStartingRun, planningTask, startError, debugEntries, handleStartRun, handleCancelRun, handleResolveApproval } = useLiveDrain({
    activeSessionId: sessionStore.activeSessionId,
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

  const isPreRun = (activeSession?.linkedRunIds.length ?? 0) === 0;
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

  const handleStartRunWithAgents = useCallback(async (task: string) => {
    if (!activeSession) return;
    await handleStartRun(task, canvas.roleIds);
  }, [activeSession, canvas.roleIds, handleStartRun]);

  useEffect(() => {
    if (startError) {
      const errorKey = `start:${startError}`;
      if (dismissedErrorKey !== errorKey && runError?.key !== errorKey) {
        setRunError({
          key: errorKey,
          summary: "Dispatch failed before the run could start.",
          diagnostics: [startError, ...debugEntries.flatMap((entry) => entry.details ?? [])].slice(0, 8)
        });
      }
      return;
    }

    if (!activeRunId || projection.phase !== "failed") {
      return;
    }

    const errorKey = `run:${activeRunId}:${projection.lastEventAt}`;
    if (dismissedErrorKey === errorKey || runError?.key === errorKey) {
      return;
    }

    setRunError({
      key: errorKey,
      summary: projection.latestSummary || projection.currentDecision || "Run failed.",
      diagnostics: projection.diagnostics
    });
  }, [
    activeRunId,
    debugEntries,
    dismissedErrorKey,
    projection.currentDecision,
    projection.diagnostics,
    projection.lastEventAt,
    projection.latestSummary,
    projection.phase,
    runError,
    startError
  ]);

  let drawerContent = null;
  if (selectedAgentId) {
    const isDraft = selectedAgentId.startsWith("draft-");
    if (isDraft) {
      const roleId = selectedAgentId.replace("draft-", "");
      const isHeadNode = roleId === HEAD_AGENT.id;
      const agent: RoleDefinition = isHeadNode
        ? { id: HEAD_AGENT.id, label: HEAD_AGENT.label, responsibility: HEAD_AGENT.responsibility, stepTemplate: "", hue: HEAD_AGENT.hue }
        : getRoleById(roleId);
      drawerContent = (
        <AgentDrawer
          agent={agent}
          history={[]}
          isLive={isLive}
          isDraft
          onClose={() => setSelectedAgentId(null)}
          onRemove={isHeadNode ? undefined : () => {
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

  const allSessionEvents = allSessionRunIds.flatMap((runId) => runStore.getRunEvents(runId));
  const messages = toMessages(projection, allSessionEvents);

  if (isStartingRun && planningTask && !activeRunId) {
    const now = new Date().toISOString();
    const planningMessages: ConversationMessage[] = [
      {
        id: "planning-task",
        timestamp: now,
        type: "system",
        agentId: "system",
        agentLabel: "Signal Atlas",
        agentHue: "#6366f1",
        content: `Task received: ${planningTask}`
      },
      {
        id: "planning-status",
        timestamp: now,
        type: "status_change",
        agentId: HEAD_AGENT.id,
        agentLabel: HEAD_AGENT.label,
        agentHue: HEAD_AGENT.hue,
        content: "Atlas is generating the head plan..."
      }
    ];
    messages.push(...planningMessages);
  }
  const canStartRun = Boolean(
    activeSession &&
    sessionStore.liveSessionId === null &&
    !isStartingRun &&
    canvas.roleIds.length > 0
  );

  const helperText = (() => {
    if (!activeSession) return "Create a session to begin.";

    if (sessionStore.liveSessionId && sessionStore.liveSessionId !== activeSession.sessionId) {
      return `${liveSession?.title ?? "Another session"} is live. Browsing is allowed, but starting a new run is blocked until it finishes.`;
    }

    if (startError) {
      return startError;
    }

    if (isStartingRun) {
      return "Atlas is generating the head plan before dispatch begins.";
    }

    if (sessionStore.liveSessionId === activeSession.sessionId) {
      return approvalPending
        ? "This live session is awaiting approval. Resolve it before continuing."
        : "This session is currently live. Starting another run is disabled.";
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

    if (isStartingRun) {
      return "Planning In Progress...";
    }

    if (sessionStore.liveSessionId === activeSession?.sessionId) {
      return approvalPending ? "Approval Required" : "Run In Progress...";
    }

    return undefined;
  })();

  return (
    <>
    <AppShell
      isSidebarVisible={isSessionSidebarVisible}
      sessionSidebar={isSessionSidebarVisible ? (
        <SessionSidebar
          sessions={sessionStore.sessions.map((session) => {
            const sessionProjection = runStore.getProjection(session.linkedRunIds.at(-1) ?? null);
            return {
              sessionId: session.sessionId,
              title: session.title,
              updatedAt: session.updatedAt,
              isActive: session.sessionId === sessionStore.activeSessionId,
              isLive: session.sessionId === sessionStore.liveSessionId,
              hasPendingApproval: sessionProjection.approval.status === "pending",
              isRunBacked: session.linkedRunIds.length > 0
            };
          })}
          onCreateSession={sessionStore.createSession}
          onSelectSession={sessionStore.setActiveSessionId}
          onRenameSession={sessionStore.renameSession}
          onDeleteSession={(sessionId) => {
              if (sessionId === sessionStore.liveSessionId) {
                handleCancelRun();
              }
              return sessionStore.deleteSession(sessionId, true);
            }}
          onCollapse={() => setIsSessionSidebarVisible(false)}
        />
      ) : null}
      sessionSidebarToggle={isSessionSidebarVisible ? null : (
        <SessionSidebarToggle onExpand={() => setIsSessionSidebarVisible(true)} />
      )}
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
          emptyState={isPreRun ? (
            <div className="flex flex-col items-center text-center pointer-events-none">
              <div className="w-12 h-12 rounded-xl bg-zinc-100 flex items-center justify-center mb-3">
                <Plus className="w-6 h-6 text-zinc-400" />
              </div>
              <h3 className="text-sm font-semibold text-zinc-700 mb-1">Add your first agent</h3>
              <p className="text-xs text-zinc-500 max-w-[220px]">
                Use the + button above to add agents to the canvas, then describe a task to start.
              </p>
            </div>
          ) : undefined}
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
          onCancelRun={handleCancelRun}
          isLive={isLive}
          isActiveSessionLive={
            sessionStore.liveSessionId === sessionStore.activeSessionId ||
            (isStartingRun && sessionStore.liveSessionId === null)
          }
          approvalPending={approvalPending}
          hasAgents={canvas.roleIds.length > 0}
          taskInputDisabled={!canStartRun}
          helperText={helperText}
          submitLabel={submitLabel}
        />
      )}
    />

      {runError && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40">
          <div className="bg-white rounded-xl shadow-xl max-w-md w-full mx-4 overflow-hidden">
            <div className="flex items-center gap-3 px-5 py-4 border-b border-zinc-100">
              <AlertTriangle className="w-5 h-5 text-red-500 shrink-0" />
              <h2 className="text-sm font-semibold text-zinc-900">Run Failed</h2>
              <button
                type="button"
                onClick={() => {
                  setDismissedErrorKey(runError.key);
                  setRunError(null);
                }}
                className="ml-auto p-1 rounded-md hover:bg-zinc-100 transition-colors"
              >
                <XIcon className="w-4 h-4 text-zinc-400" />
              </button>
            </div>
            <div className="px-5 py-4 space-y-3">
              <p className="text-sm text-zinc-700">{runError.summary}</p>
              {runError.diagnostics.length > 0 && (
                <ul className="space-y-1.5">
                  {runError.diagnostics.map((msg, i) => (
                    <li key={i} className="text-xs text-zinc-500 flex gap-2">
                      <span className="text-zinc-300 shrink-0">•</span>
                      <span>{msg}</span>
                    </li>
                  ))}
                </ul>
              )}
            </div>
            <div className="px-5 py-3 border-t border-zinc-100 flex justify-end">
              <button
                type="button"
                onClick={() => {
                  setDismissedErrorKey(runError.key);
                  setRunError(null);
                }}
                className="text-xs font-medium text-zinc-600 hover:text-zinc-900 px-3 py-1.5 rounded-md hover:bg-zinc-100 transition-colors"
              >
                Dismiss
              </button>
            </div>
          </div>
        </div>
      )}
    </>
  );
}
