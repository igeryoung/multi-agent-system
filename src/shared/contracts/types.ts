export type AgentKind = "head" | "role";
export type ActorType = "system" | "user" | "head-agent" | "role-agent";
export type RunLifecyclePhase = Exclude<RunPhase, "draft">;
export type RunPhase =
  | "draft"
  | "planning"
  | "dispatching"
  | "waiting_on_agent"
  | "awaiting_approval"
  | "completed"
  | "failed"
  | "cancelled";

export type EventType =
  | "run_created"
  | "roles_assigned"
  | "plan_created"
  | "handoff_requested"
  | "agent_status_changed"
  | "agent_output_recorded"
  | "blocked_action_requested"
  | "approval_recorded"
  | "planning_started"
  | "run_completed"
  | "run_failed";

export type AgentStatus = "idle" | "active" | "waiting" | "blocked" | "completed";
export type StepStatus = "pending" | "in_progress" | "completed" | "blocked";
export type ApprovalStatus = "idle" | "pending" | "approved" | "rejected";
export type ReturnPolicy = "final_only" | "blocker_only" | "checkpoint";
export type WorkflowEdgeKind = "head_handoff" | "peer_handoff";
export type TaskInputSource = "user_task" | "environment" | "prior_agent_output" | "mixed";

export interface RoleDefinition {
  id: string;
  label: string;
  responsibility: string;
  stepTemplate: string;
  hue: string;
}

export interface StepDefinition {
  id: string;
  ownerId: string;
  title: string;
  summary: string;
  taskPacketId: string;
  returnPolicy: ReturnPolicy;
}

export interface TaskPacket {
  id: string;
  agentId: string;
  why: string;
  goal: string;
  context: string[];
  constraints: string[];
  doneWhen: string[];
  next: string;
  inputSource: TaskInputSource;
  returnPolicy: ReturnPolicy;
}

export interface WorkflowEdge {
  id: string;
  fromAgentId: string;
  toAgentId: string;
  kind: WorkflowEdgeKind;
  note: string;
  requiresIntermediateReturn: boolean;
}

export interface ExecutionPlan {
  plannerMode: "bridge" | "fixture";
  summary: string;
  headSummary: string;
  workflowSummary: string;
  steps: StepDefinition[];
  taskPackets: TaskPacket[];
  workflowEdges: WorkflowEdge[];
  diagnostics: string[];
}

export interface RunEvent {
  runId: string;
  sequence: number;
  timestamp: string;
  actorType: ActorType;
  actorId: string;
  eventType: EventType;
  phase: RunPhase;
  payload: Record<string, unknown>;
}

export interface AgentProjection {
  id: string;
  label: string;
  kind: AgentKind;
  hue: string;
  responsibility: string;
  status: AgentStatus;
  currentTask: string;
  assignedTaskPacket: TaskPacket | null;
}

export interface StepProjection extends StepDefinition {
  status: StepStatus;
}

export interface HandoffProjection {
  id: string;
  fromAgentId: string;
  toAgentId: string;
  stepId: string;
  note: string;
  sequence: number;
}

export interface ApprovalProjection {
  status: ApprovalStatus;
  actionLabel: string;
  impact: string;
  reason: string;
  decisionNote: string;
}

export interface OutputProjection {
  id: string;
  actorId: string;
  actorLabel: string;
  summary: string;
  content: string;
  sequence: number;
}

export interface RunProjection {
  runId: string;
  title: string;
  task: string;
  phase: RunPhase;
  headAgentId: string;
  activeAgentId: string;
  currentDecision: string;
  latestSummary: string;
  lastEventAt: string;
  agents: AgentProjection[];
  steps: StepProjection[];
  handoffs: HandoffProjection[];
  workflowEdges: WorkflowEdge[];
  taskPackets: TaskPacket[];
  approval: ApprovalProjection;
  outputs: OutputProjection[];
  diagnostics: string[];
}

export interface SessionDraft {
  taskInput: string;
  selectedRoleIds: string[];
}

export interface SessionRecord {
  sessionId: string;
  title: string;
  createdAt: string;
  updatedAt: string;
  linkedRunIds: string[];
  draft: SessionDraft;
}

export const HEAD_AGENT = {
  id: "atlas-head",
  label: "Atlas Head Agent",
  responsibility: "Creates the plan, controls the run, and owns every approval checkpoint.",
  hue: "#0f766e"
} as const;

export const PREDEFINED_ROLES: RoleDefinition[] = [
  {
    id: "ceo-planner",
    label: "CEO Planner",
    responsibility: "Reframes the task into sequenced workstreams and keeps the mission coherent.",
    stepTemplate: "Frame the mission and sequence the work",
    hue: "#0f766e"
  },
  {
    id: "engineer",
    label: "Engineer",
    responsibility: "Builds the implementation path and resolves technical gaps.",
    stepTemplate: "Build the implementation path",
    hue: "#2563eb"
  },
  {
    id: "qa",
    label: "QA Tester",
    responsibility: "Challenges the output and highlights broken or missing evidence.",
    stepTemplate: "Pressure-test correctness and edge cases",
    hue: "#c2410c"
  },
  {
    id: "reviewer",
    label: "Reviewer",
    responsibility: "Turns work into a clear recommendation with critique and revisions.",
    stepTemplate: "Review the output and request refinements",
    hue: "#7c3aed"
  },
  {
    id: "writer",
    label: "Writer",
    responsibility: "Transforms findings into a user-facing narrative or summary.",
    stepTemplate: "Shape the final narrative for the user",
    hue: "#b45309"
  }
];

const PREDEFINED_ROLE_IDS = new Set(PREDEFINED_ROLES.map((role) => role.id));

export function isKnownRoleId(roleId: string): boolean {
  return PREDEFINED_ROLE_IDS.has(roleId);
}

export function sanitizeRoleIds(roleIds: readonly unknown[]): string[] {
  const uniqueRoleIds = new Set<string>();
  for (const roleId of roleIds) {
    if (typeof roleId === "string" && isKnownRoleId(roleId)) {
      uniqueRoleIds.add(roleId);
    }
  }
  return [...uniqueRoleIds];
}

export function getRoleById(roleId: string): RoleDefinition {
  const role = PREDEFINED_ROLES.find((candidate) => candidate.id === roleId);
  if (!role) {
    throw new Error(`Unknown role id: ${roleId}`);
  }
  return role;
}
