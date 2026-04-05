import type {
  ExecutionPlan,
  ReturnPolicy,
  RoleDefinition,
  StepDefinition,
  TaskPacket,
  WorkflowEdge
} from "../../shared/contracts/types";

const DEFAULT_BRIDGE_URL = "http://127.0.0.1:4317/api/plan";
const PLANNER_TIMEOUT_MS = 45_000;

export type HeadPlannerMode = "bridge" | "fixture";

export interface HeadPlannerRequest {
  task: string;
  roles: RoleDefinition[];
  cwd?: string;
}

export type HeadPlannerResult =
  | { ok: true; plan: ExecutionPlan }
  | { ok: false; diagnostic: string; details: string[] };

export interface HeadPlannerProgressUpdate {
  message: string;
  details: string[];
  level: "info" | "error";
}

declare global {
  var __SIGNAL_ATLAS_HEAD_PLANNER_MODE__: HeadPlannerMode | undefined;
}

export async function createHeadPlan(
  request: HeadPlannerRequest,
  mode: HeadPlannerMode = detectHeadPlannerMode(),
  onProgress?: (update: HeadPlannerProgressUpdate) => void,
  signal?: AbortSignal
): Promise<HeadPlannerResult> {
  if (mode === "fixture") {
    return {
      ok: true,
      plan: createFixtureExecutionPlan(request.task, request.roles)
    };
  }

  return requestBridgePlan(request, onProgress, signal);
}

export function getHeadPlannerBridgeUrl(): string {
  return resolveBridgeUrl();
}

export function detectHeadPlannerMode(): HeadPlannerMode {
  if (globalThis.__SIGNAL_ATLAS_HEAD_PLANNER_MODE__) {
    return globalThis.__SIGNAL_ATLAS_HEAD_PLANNER_MODE__;
  }

  if (typeof process !== "undefined" && process.env.VITEST) {
    return "fixture";
  }

  return "bridge";
}

function createFixtureExecutionPlan(task: string, roles: RoleDefinition[]): ExecutionPlan {
  const sanitizedTask = task.trim();
  const taskPackets = roles.map((role, index) => {
    const nextRole = roles[index + 1];
    const returnPolicy: ReturnPolicy = nextRole ? "checkpoint" : "final_only";

    return {
      id: `packet-${role.id}`,
      agentId: role.id,
      why: `${role.label} is included because ${role.responsibility.toLowerCase()}`,
      goal: `${role.stepTemplate} for "${sanitizedTask}"`,
      context: [
        `User task: ${sanitizedTask}`,
        `Role responsibility: ${role.responsibility}`,
        `Selected lane order: ${roles.map((candidate) => candidate.label).join(" -> ")}`
      ],
      constraints: [
        "Only the head node speaks to the user.",
        "This milestone is planning-first; role agents only show assigned work.",
        "Surface blockers explicitly if the assigned goal cannot be completed."
      ],
      doneWhen: nextRole
        ? [
            `${role.label} refines its lane output into a handoff package for ${nextRole.label}.`,
            "The output is specific enough for the next lane to continue."
          ]
        : [
            `${role.label} produces the final specialist output for the head node.`,
            "The final output is ready for head-node summarization."
          ],
      next: nextRole
        ? `Send the checkpoint result to ${nextRole.label}.`
        : "Return the final result to Atlas Head Agent.",
      inputSource: index === 0 ? "user_task" : "mixed",
      returnPolicy
    } satisfies TaskPacket;
  });

  const steps: StepDefinition[] = taskPackets.map((packet, index) => ({
    id: `step-${index + 1}`,
    ownerId: packet.agentId,
    title: `${roles[index]?.label ?? packet.agentId}: ${roles[index]?.stepTemplate ?? packet.goal}`,
    summary: packet.goal,
    taskPacketId: packet.id,
    returnPolicy: packet.returnPolicy
  }));

  const workflowEdges: WorkflowEdge[] = taskPackets.map((packet, index) => {
    const previousRole = roles[index - 1];
    return {
      id: `edge-${index + 1}`,
      fromAgentId: previousRole?.id ?? "atlas-head",
      toAgentId: packet.agentId,
      kind: previousRole ? "peer_handoff" : "head_handoff",
      note: previousRole
        ? `${previousRole.label} hands its checkpoint to ${roles[index]?.label ?? packet.agentId}.`
        : `Atlas Head Agent delegates the first lane to ${roles[index]?.label ?? packet.agentId}.`,
      requiresIntermediateReturn: packet.returnPolicy === "checkpoint"
    };
  });

  return {
    plannerMode: "fixture",
    summary: `Atlas generated a ${roles.length}-lane workflow for "${sanitizedTask}".`,
    headSummary: `Atlas planned ${roles.length} accountable lanes and prepared a task packet for each selected agent.`,
    workflowSummary: workflowEdges.map((edge) => edge.note).join(" "),
    steps,
    taskPackets,
    workflowEdges,
    diagnostics: []
  };
}

async function requestBridgePlan({
  task,
  roles,
  cwd
}: HeadPlannerRequest, onProgress?: (update: HeadPlannerProgressUpdate) => void, userSignal?: AbortSignal): Promise<HeadPlannerResult> {
  const timeoutController = new AbortController();
  const timeoutId = globalThis.setTimeout(() => timeoutController.abort(), PLANNER_TIMEOUT_MS);

  const signals = userSignal
    ? [userSignal, timeoutController.signal]
    : [timeoutController.signal];
  const combinedSignal = signals.length === 1 ? signals[0] : AbortSignal.any(signals);

  try {
    const response = await fetch(resolveBridgeUrl(), {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({
        task,
        roles,
        cwd
      }),
      signal: combinedSignal
    });

    if (isStreamingBridgeResponse(response)) {
      return await readStreamingBridgeResponse(response, roles, onProgress);
    }

    const payload = await response.json().catch(() => null);
    return normalizeBridgePayload(payload, response.status, roles);
  } catch (error) {
    const detail = error instanceof Error ? error.message : String(error);
    return {
      ok: false,
      diagnostic: "Atlas could not reach the local head planner bridge.",
      details: [
        detail,
        "Start the local planner bridge before dispatching a real head-planned run."
      ]
    };
  } finally {
    globalThis.clearTimeout(timeoutId);
    timeoutController.abort();
  }
}

function resolveBridgeUrl(): string {
  const env = (import.meta as ImportMeta & {
    env?: Record<string, string | undefined>;
  }).env;
  return env?.VITE_HEAD_PLANNER_BRIDGE_URL || DEFAULT_BRIDGE_URL;
}

function isStreamingBridgeResponse(response: Response): boolean {
  const contentType = typeof response.headers?.get === "function"
    ? response.headers.get("content-type") ?? ""
    : "";
  return contentType.includes("application/x-ndjson") && Boolean(response.body);
}

async function readStreamingBridgeResponse(
  response: Response,
  roles: RoleDefinition[],
  onProgress?: (update: HeadPlannerProgressUpdate) => void
): Promise<HeadPlannerResult> {
  const reader = response.body?.getReader();
  if (!reader) {
    return {
      ok: false,
      diagnostic: "Atlas could not read the planner bridge stream.",
      details: ["The bridge response body was not readable."]
    };
  }

  const decoder = new TextDecoder();
  let buffer = "";
  let finalPayload: unknown = null;

  while (true) {
    const { value, done } = await reader.read();
    buffer += decoder.decode(value ?? new Uint8Array(), { stream: !done });

    let newlineIndex = buffer.indexOf("\n");
    while (newlineIndex >= 0) {
      const line = buffer.slice(0, newlineIndex).trim();
      buffer = buffer.slice(newlineIndex + 1);
      if (line.length > 0) {
        const chunk = safeParseJson(line);
        if (chunk && typeof chunk === "object") {
          const candidate = chunk as Record<string, unknown>;
          if (candidate.type === "progress") {
            const message = typeof candidate.message === "string"
              ? candidate.message.trim()
              : "";
            if (message.length > 0) {
              onProgress?.({
                message,
                details: normalizeStringArray(candidate.details),
                level: candidate.level === "error" ? "error" : "info"
              });
            }
          } else if (candidate.type === "result") {
            finalPayload = candidate.payload;
          }
        }
      }
      newlineIndex = buffer.indexOf("\n");
    }

    if (done) {
      const trailing = buffer.trim();
      if (trailing.length > 0) {
        const chunk = safeParseJson(trailing);
        if (chunk && typeof chunk === "object") {
          const candidate = chunk as Record<string, unknown>;
          if (candidate.type === "result") {
            finalPayload = candidate.payload;
          }
        }
      }
      break;
    }
  }

  if (!finalPayload) {
    return {
      ok: false,
      diagnostic: "Atlas did not receive a final planner result from the bridge.",
      details: ["The bridge stream ended before emitting a final result payload."]
    };
  }

  return normalizeBridgePayload(finalPayload, response.status, roles);
}

function normalizeBridgePayload(
  payload: unknown,
  status: number,
  roles: RoleDefinition[]
): HeadPlannerResult {
  const candidate = (payload && typeof payload === "object" ? payload : {}) as Record<string, unknown>;

  if (candidate.ok !== true || !candidate.plan) {
    return {
      ok: false,
      diagnostic: typeof candidate.diagnostic === "string"
        ? candidate.diagnostic
        : `Head planner bridge failed with status ${status}.`,
      details: normalizeStringArray(candidate.details)
    };
  }

  try {
    return {
      ok: true,
      plan: validatePlanMatchesSelectedRoles(
        normalizeExecutionPlan(candidate.plan),
        roles
      )
    };
  } catch (error) {
    return {
      ok: false,
      diagnostic: "Atlas rejected malformed planner bridge output.",
      details: [error instanceof Error ? error.message : String(error)]
    };
  }
}

function normalizeStringArray(value: unknown): string[] {
  if (!Array.isArray(value)) {
    return [];
  }

  return value.filter((entry): entry is string => typeof entry === "string");
}

function safeParseJson(value: string): unknown {
  try {
    return JSON.parse(value);
  } catch {
    return null;
  }
}

function normalizeExecutionPlan(rawPlan: unknown): ExecutionPlan {
  const plan = (rawPlan && typeof rawPlan === "object" ? rawPlan : {}) as Partial<ExecutionPlan>;
  const steps = normalizeSteps(plan.steps);
  const taskPackets = normalizeTaskPackets(plan.taskPackets);
  const workflowEdges = normalizeWorkflowEdges(plan.workflowEdges, taskPackets);

  if (steps.length === 0 || taskPackets.length === 0 || workflowEdges.length === 0) {
    throw new Error("Head planner bridge returned an invalid or incomplete execution plan.");
  }

  const packetIds = new Set(taskPackets.map((packet) => packet.id));
  const stepPacketIds = new Set(steps.map((step) => step.taskPacketId));
  if (packetIds.size !== taskPackets.length || stepPacketIds.size !== steps.length) {
    throw new Error("Head planner bridge returned duplicate packet or step bindings.");
  }
  for (const step of steps) {
    if (!packetIds.has(step.taskPacketId)) {
      throw new Error(`Execution plan references missing task packet: ${step.taskPacketId}`);
    }
  }

  return {
    plannerMode: plan.plannerMode === "fixture" ? "fixture" : "bridge",
    summary: normalizeRequiredString(plan.summary, "summary"),
    headSummary: normalizeRequiredString(plan.headSummary, "headSummary"),
    workflowSummary: normalizeRequiredString(plan.workflowSummary, "workflowSummary"),
    steps,
    taskPackets,
    workflowEdges,
    diagnostics: Array.isArray(plan.diagnostics)
      ? plan.diagnostics.filter((detail: unknown): detail is string => typeof detail === "string")
      : []
  };
}

function validatePlanMatchesSelectedRoles(
  plan: ExecutionPlan,
  roles: RoleDefinition[]
): ExecutionPlan {
  const selectedRoleIds = new Set(roles.map((role) => role.id));
  const plannedRoleIds = plan.taskPackets.map((packet) => packet.agentId);

  if (plannedRoleIds.length !== roles.length) {
    throw new Error("Head planner bridge returned the wrong number of task packets.");
  }

  if (new Set(plannedRoleIds).size !== plannedRoleIds.length) {
    throw new Error("Head planner bridge returned duplicate task packets.");
  }

  for (const roleId of plannedRoleIds) {
    if (!selectedRoleIds.has(roleId)) {
      throw new Error(`Head planner bridge returned an unselected role: ${roleId}`);
    }
  }

  return plan;
}

function normalizeRequiredString(value: unknown, fieldName: string): string {
  if (typeof value !== "string" || value.trim().length === 0) {
    throw new Error(`Head planner bridge returned an invalid ${fieldName}.`);
  }
  return value;
}

function normalizeSteps(rawSteps: unknown): StepDefinition[] {
  if (!Array.isArray(rawSteps)) {
    throw new Error("Head planner bridge returned invalid steps.");
  }

  return rawSteps.map((step, index) => {
    const candidate = (step && typeof step === "object" ? step : {}) as Partial<StepDefinition>;
    return {
      id: normalizeRequiredString(candidate.id, `steps[${index}].id`),
      ownerId: normalizeRequiredString(candidate.ownerId, `steps[${index}].ownerId`),
      title: normalizeRequiredString(candidate.title, `steps[${index}].title`),
      summary: normalizeRequiredString(candidate.summary, `steps[${index}].summary`),
      taskPacketId: normalizeRequiredString(
        candidate.taskPacketId,
        `steps[${index}].taskPacketId`
      ),
      returnPolicy: normalizeReturnPolicy(candidate.returnPolicy, `steps[${index}].returnPolicy`)
    };
  });
}

function normalizeTaskPackets(rawPackets: unknown): TaskPacket[] {
  if (!Array.isArray(rawPackets)) {
    throw new Error("Head planner bridge returned invalid task packets.");
  }

  return rawPackets.map((packet, index) => {
    const candidate = (packet && typeof packet === "object" ? packet : {}) as Partial<TaskPacket>;
    return {
      id: normalizeRequiredString(candidate.id, `taskPackets[${index}].id`),
      agentId: normalizeRequiredString(candidate.agentId, `taskPackets[${index}].agentId`),
      why: normalizeRequiredString(candidate.why, `taskPackets[${index}].why`),
      goal: normalizeRequiredString(candidate.goal, `taskPackets[${index}].goal`),
      context: normalizeRequiredStringArray(candidate.context, `taskPackets[${index}].context`),
      constraints: normalizeRequiredStringArray(
        candidate.constraints,
        `taskPackets[${index}].constraints`
      ),
      doneWhen: normalizeRequiredStringArray(
        candidate.doneWhen,
        `taskPackets[${index}].doneWhen`
      ),
      next: normalizeRequiredString(candidate.next, `taskPackets[${index}].next`),
      inputSource: normalizeInputSource(
        candidate.inputSource,
        `taskPackets[${index}].inputSource`
      ),
      returnPolicy: normalizeReturnPolicy(
        candidate.returnPolicy,
        `taskPackets[${index}].returnPolicy`
      )
    };
  });
}

function normalizeWorkflowEdges(rawEdges: unknown, taskPackets: TaskPacket[]): WorkflowEdge[] {
  if (!Array.isArray(rawEdges)) {
    throw new Error("Head planner bridge returned invalid workflow edges.");
  }

  const agentIds = new Set(taskPackets.map((packet) => packet.agentId));
  agentIds.add("atlas-head");

  return rawEdges.map((edge, index) => {
    const candidate = (edge && typeof edge === "object" ? edge : {}) as Partial<WorkflowEdge>;
    const fromAgentId = normalizeRequiredString(candidate.fromAgentId, `workflowEdges[${index}].fromAgentId`);
    const toAgentId = normalizeRequiredString(candidate.toAgentId, `workflowEdges[${index}].toAgentId`);
    if (!agentIds.has(fromAgentId) || !agentIds.has(toAgentId)) {
      throw new Error(`Workflow edge references an unknown agent: ${fromAgentId} -> ${toAgentId}`);
    }

    return {
      id: normalizeRequiredString(candidate.id, `workflowEdges[${index}].id`),
      fromAgentId,
      toAgentId,
      kind: normalizeWorkflowEdgeKind(candidate.kind, `workflowEdges[${index}].kind`),
      note: normalizeRequiredString(candidate.note, `workflowEdges[${index}].note`),
      requiresIntermediateReturn: Boolean(candidate.requiresIntermediateReturn)
    };
  });
}

function normalizeRequiredStringArray(value: unknown, fieldName: string): string[] {
  if (!Array.isArray(value) || value.length === 0) {
    throw new Error(`Head planner bridge returned invalid ${fieldName}.`);
  }

  return value.map((entry, index) =>
    normalizeRequiredString(entry, `${fieldName}[${index}]`)
  );
}

function normalizeInputSource(value: unknown, fieldName: string): TaskPacket["inputSource"] {
  if (value === "user_task" || value === "environment" || value === "prior_agent_output" || value === "mixed") {
    return value;
  }
  throw new Error(`Head planner bridge returned invalid ${fieldName}.`);
}

function normalizeReturnPolicy(value: unknown, fieldName: string): ReturnPolicy {
  if (value === "final_only" || value === "blocker_only" || value === "checkpoint") {
    return value;
  }
  throw new Error(`Head planner bridge returned invalid ${fieldName}.`);
}

function normalizeWorkflowEdgeKind(
  value: unknown,
  fieldName: string
): WorkflowEdge["kind"] {
  if (value === "head_handoff" || value === "peer_handoff") {
    return value;
  }
  throw new Error(`Head planner bridge returned invalid ${fieldName}.`);
}
