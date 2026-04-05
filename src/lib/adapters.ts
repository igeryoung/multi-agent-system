import type { Node, Edge } from "@xyflow/react";
import type {
  AgentProjection,
  AgentStatus,
  RoleDefinition,
  RunEvent,
  RunProjection
} from "@/shared/contracts/types";
import { getRoleById, HEAD_AGENT, PREDEFINED_ROLES as AVAILABLE_ROLES } from "@/shared/contracts/types";

export interface AgentNodeData extends Record<string, unknown> {
  label: string;
  role: string;
  responsibility: string;
  status: AgentStatus;
  hue: string;
  currentTask: string;
  isActive: boolean;
  kind: "head" | "role";
}

export function toFlowNodes(projection: RunProjection): {
  nodes: Node<AgentNodeData>[];
  edges: Edge[];
} {
  const headAgent = projection.agents.find((a) => a.kind === "head");
  const roleAgents = projection.agents.filter((a) => a.kind === "role");
  const spacing = 220;
  const totalWidth = (roleAgents.length - 1) * spacing;
  const startX = -totalWidth / 2;

  const nodes: Node<AgentNodeData>[] = [];

  if (headAgent) {
    nodes.push(agentToNode(headAgent, 0, 0, projection.activeAgentId));
  }

  roleAgents.forEach((agent, index) => {
    nodes.push(
      agentToNode(agent, startX + index * spacing, 180, projection.activeAgentId)
    );
  });

  const isTerminal =
    projection.phase === "completed" ||
    projection.phase === "failed" ||
    projection.phase === "cancelled";
  const isLatestHandoff = (seq: number) =>
    seq === projection.handoffs[projection.handoffs.length - 1]?.sequence;

  const handoffEdges: Edge[] = projection.handoffs.map((handoff) => ({
    id: handoff.id,
    source: handoff.fromAgentId,
    target: handoff.toAgentId,
    animated: !isTerminal && isLatestHandoff(handoff.sequence),
    style: {
      stroke: isLatestHandoff(handoff.sequence) ? "#6366f1" : "#d4d4d8",
      strokeWidth: 2
    }
  }));

  const plannedEdges: Edge[] = projection.workflowEdges.map((edge) => ({
    id: edge.id,
    source: edge.fromAgentId,
    target: edge.toAgentId,
    animated: false,
    style: {
      stroke: edge.kind === "peer_handoff" ? "#c4b5fd" : "#94a3b8",
      strokeWidth: 1.5,
      strokeDasharray: edge.requiresIntermediateReturn ? "8 4" : "4 3"
    }
  }));

  const edges = handoffEdges.length > 0 ? handoffEdges : plannedEdges;

  if (edges.length === 0 && headAgent) {
    roleAgents.forEach((agent) => {
      edges.push({
        id: `fallback-${agent.id}`,
        source: headAgent.id,
        target: agent.id,
        animated: false,
        style: { stroke: "#e4e4e7", strokeWidth: 1.5, strokeDasharray: "6 3" }
      });
    });
  }

  return { nodes, edges };
}

function agentToNode(
  agent: AgentProjection,
  x: number,
  y: number,
  activeAgentId: string
): Node<AgentNodeData> {
  return {
    id: agent.id,
    type: "agentNode",
    position: { x, y },
    data: {
      label: agent.label,
      role: agent.kind === "head" ? "Head Agent" : agent.label,
      responsibility: agent.responsibility,
      status: agent.status,
      hue: agent.hue,
      currentTask: agent.currentTask,
      isActive: agent.id === activeAgentId,
      kind: agent.kind
    }
  };
}

export type MessageType =
  | "system"
  | "agent_output"
  | "agent_output_rich"
  | "handoff"
  | "approval_request"
  | "approval_response"
  | "status_change"
  | "plan"
  | "plan_detail";

export interface ConversationMessage {
  id: string;
  timestamp: string;
  type: MessageType;
  agentId: string;
  agentLabel: string;
  agentHue: string;
  content: string;
  metadata?: Record<string, unknown>;
}

export function toMessages(
  projection: RunProjection,
  events: RunEvent[]
): ConversationMessage[] {
  const messages: ConversationMessage[] = [];

  for (const event of events) {
    const agentId = event.actorId;
    const agentInfo = resolveAgent(agentId, projection.agents);

    switch (event.eventType) {
      case "run_created":
        messages.push({
          id: `${event.runId}-${event.sequence}`,
          timestamp: event.timestamp,
          type: "system",
          agentId: "system",
          agentLabel: "Signal Atlas",
          agentHue: "#6366f1",
          content: `Task received: ${String(event.payload.task ?? "")}`
        });
        break;

      case "roles_assigned":
        messages.push({
          id: `${event.runId}-${event.sequence}`,
          timestamp: event.timestamp,
          type: "system",
          agentId: "system",
          agentLabel: "Signal Atlas",
          agentHue: "#6366f1",
          content: `Roles assigned: ${String((event.payload.roleIds as string[] | undefined)?.length ?? 0)}`
        });
        break;

      case "planning_started":
        messages.push({
          id: `${event.runId}-${event.sequence}`,
          timestamp: event.timestamp,
          type: "status_change",
          agentId: HEAD_AGENT.id,
          agentLabel: HEAD_AGENT.label,
          agentHue: HEAD_AGENT.hue,
          content: String(event.payload.summary ?? "Atlas is preparing the head plan...")
        });
        break;

      case "plan_created": {
        const planPayload = event.payload;
        messages.push({
          id: `${event.runId}-${event.sequence}`,
          timestamp: event.timestamp,
          type: "plan_detail",
          agentId: HEAD_AGENT.id,
          agentLabel: HEAD_AGENT.label,
          agentHue: HEAD_AGENT.hue,
          content: String(planPayload.summary ?? "Plan created."),
          metadata: {
            summary: planPayload.summary,
            headSummary: planPayload.headSummary,
            workflowSummary: planPayload.workflowSummary,
            steps: planPayload.steps,
            taskPackets: planPayload.taskPackets,
            workflowEdges: planPayload.workflowEdges
          }
        });
        break;
      }

      case "handoff_requested":
        messages.push({
          id: `${event.runId}-${event.sequence}`,
          timestamp: event.timestamp,
          type: "handoff",
          agentId,
          agentLabel: agentInfo.label,
          agentHue: agentInfo.hue,
          content: String(event.payload.note ?? ""),
          metadata: {
            fromAgentId: event.payload.fromAgentId,
            toAgentId: event.payload.toAgentId
          }
        });
        break;

      case "agent_status_changed":
        messages.push({
          id: `${event.runId}-${event.sequence}`,
          timestamp: event.timestamp,
          type: "status_change",
          agentId,
          agentLabel: agentInfo.label,
          agentHue: agentInfo.hue,
          content: `${agentInfo.label} is now active on: ${String(event.payload.task ?? "")}`
        });
        break;

      case "agent_output_recorded": {
        const structured = event.payload.structuredOutput as Record<string, unknown> | undefined;
        messages.push({
          id: `${event.runId}-${event.sequence}`,
          timestamp: event.timestamp,
          type: structured ? "agent_output_rich" : "agent_output",
          agentId,
          agentLabel: agentInfo.label,
          agentHue: agentInfo.hue,
          content: String(event.payload.output ?? event.payload.summary ?? ""),
          metadata: structured ? { structuredOutput: structured } : undefined
        });
        break;
      }

      case "blocked_action_requested":
        messages.push({
          id: `${event.runId}-${event.sequence}`,
          timestamp: event.timestamp,
          type: "approval_request",
          agentId: HEAD_AGENT.id,
          agentLabel: HEAD_AGENT.label,
          agentHue: HEAD_AGENT.hue,
          content: String(event.payload.actionLabel ?? ""),
          metadata: {
            impact: event.payload.impact,
            reason: event.payload.reason,
            actionLabel: event.payload.actionLabel
          }
        });
        break;

      case "approval_recorded":
        messages.push({
          id: `${event.runId}-${event.sequence}`,
          timestamp: event.timestamp,
          type: "approval_response",
          agentId: "user",
          agentLabel: "You",
          agentHue: "#6366f1",
          content: String(event.payload.note ?? ""),
          metadata: { decision: event.payload.decision }
        });
        break;

      case "run_completed":
        messages.push({
          id: `${event.runId}-${event.sequence}`,
          timestamp: event.timestamp,
          type: "system",
          agentId: "system",
          agentLabel: "Signal Atlas",
          agentHue: "#6366f1",
          content: String(event.payload.summary ?? "Run completed.")
        });
        break;

      case "run_failed":
        messages.push({
          id: `${event.runId}-${event.sequence}`,
          timestamp: event.timestamp,
          type: "agent_output",
          agentId: HEAD_AGENT.id,
          agentLabel: HEAD_AGENT.label,
          agentHue: HEAD_AGENT.hue,
          content: String(event.payload.summary ?? "Run failed.")
        });
        break;
    }
  }

  return messages;
}

function resolveAgent(
  actorId: string,
  agents: AgentProjection[]
): { label: string; hue: string } {
  const agent = agents.find((a) => a.id === actorId);
  if (agent) return { label: agent.label, hue: agent.hue };
  if (actorId === HEAD_AGENT.id)
    return { label: HEAD_AGENT.label, hue: HEAD_AGENT.hue };
  const role = AVAILABLE_ROLES.find((candidate) => candidate.id === actorId);
  if (role) {
    return { label: role.label, hue: role.hue };
  }
  return { label: actorId, hue: "#6366f1" };
}

export interface AgentHistoryItem {
  id: string;
  timestamp: string;
  type: "handoff" | "output" | "status_change";
  summary: string;
  content: string;
}

export function toAgentHistory(
  agentId: string,
  events: RunEvent[],
  agents: AgentProjection[]
): AgentHistoryItem[] {
  const items: AgentHistoryItem[] = [];

  for (const event of events) {
    const isActor = event.actorId === agentId;
    const refsAgent =
      event.payload.toAgentId === agentId ||
      event.payload.fromAgentId === agentId;

    if (!isActor && !refsAgent) continue;

    switch (event.eventType) {
      case "handoff_requested": {
        const info = resolveAgent(event.actorId, agents);
        items.push({
          id: `${event.runId}-${event.sequence}`,
          timestamp: event.timestamp,
          type: "handoff",
          summary: `Handoff from ${info.label}`,
          content: String(event.payload.note ?? "")
        });
        break;
      }
      case "agent_output_recorded":
        if (isActor) {
          items.push({
            id: `${event.runId}-${event.sequence}`,
            timestamp: event.timestamp,
            type: "output",
            summary: String(event.payload.output ?? event.payload.summary ?? "").slice(0, 80),
            content: String(event.payload.output ?? event.payload.summary ?? "")
          });
        }
        break;
      case "agent_status_changed":
        if (isActor) {
          items.push({
            id: `${event.runId}-${event.sequence}`,
            timestamp: event.timestamp,
            type: "status_change",
            summary: `Now active on: ${String(event.payload.task ?? "")}`,
            content: String(event.payload.task ?? "")
          });
        }
        break;
    }
  }

  return items;
}

export function toPreRunNodes(canvasAgents: RoleDefinition[]): {
  nodes: Node<AgentNodeData>[];
  edges: Edge[];
} {
  const spacing = 220;
  const totalWidth = (canvasAgents.length - 1) * spacing;
  const startX = -totalWidth / 2;

  const nodes: Node<AgentNodeData>[] = [
    {
      id: `draft-${HEAD_AGENT.id}`,
      type: "agentNode",
      position: { x: 0, y: 0 },
      data: {
        label: HEAD_AGENT.label,
        role: "Head Agent",
        responsibility: HEAD_AGENT.responsibility,
        status: "idle" as AgentStatus,
        hue: HEAD_AGENT.hue,
        currentTask: HEAD_AGENT.responsibility,
        isActive: false,
        kind: "head" as const
      }
    }
  ];

  canvasAgents.forEach((role, index) => {
    nodes.push({
      id: `draft-${role.id}`,
      type: "agentNode",
      position: { x: startX + index * spacing, y: 180 },
      data: {
        label: role.label,
        role: role.label,
        responsibility: role.responsibility,
        status: "idle" as AgentStatus,
        hue: role.hue,
        currentTask: role.responsibility,
        isActive: false,
        kind: "role" as const
      }
    });
  });

  const edges: Edge[] = canvasAgents.map((role) => ({
    id: `draft-edge-${role.id}`,
    source: `draft-${HEAD_AGENT.id}`,
    target: `draft-${role.id}`,
    animated: false,
    style: { stroke: "#e4e4e7", strokeWidth: 1.5, strokeDasharray: "6 3" }
  }));

  return { nodes, edges };
}
