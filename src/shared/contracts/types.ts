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
  | "run_completed";

export type AgentStatus = "idle" | "active" | "waiting" | "blocked" | "completed";
export type StepStatus = "pending" | "in_progress" | "completed" | "blocked";
export type ApprovalStatus = "idle" | "pending" | "approved" | "rejected";

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
  linkedRunId: string | null;
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

export function getRoleById(roleId: string): RoleDefinition {
  return PREDEFINED_ROLES.find((role) => role.id === roleId) ?? PREDEFINED_ROLES[0];
}
