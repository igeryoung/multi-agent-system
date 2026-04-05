import {
  type ExecutionPlan,
  getRoleById,
  HEAD_AGENT,
  type ActorType,
  type EventType,
  type RunEvent,
  type RunPhase,
  type WorkflowEdge
} from "../../shared/contracts/types";
import {
  createHeadPlan,
  detectHeadPlannerMode,
  type HeadPlannerMode
} from "./head-planner";

interface ScenarioBundle {
  runId: string;
  initialEvents: RunEvent[];
  queuedEvents: RunEvent[];
}

interface BuildRunScenarioOptions {
  cwd?: string;
  plannerMode?: HeadPlannerMode;
  signal?: AbortSignal;
  onInitialEvents?: (payload: { runId: string; initialEvents: RunEvent[] }) => void;
  onPlanningEvent?: (event: RunEvent) => void;
}

interface ApprovalIntent {
  actionLabel: string;
  impact: string;
  reason: string;
}

function createRunId(): string {
  if (typeof crypto !== "undefined" && "randomUUID" in crypto) {
    return crypto.randomUUID();
  }

  return `run-${Math.random().toString(36).slice(2, 10)}`;
}

function createTimestamp(baseMs: number, sequence: number): string {
  return new Date(baseMs + sequence * 1000).toISOString();
}

function createEvent(
  baseMs: number,
  runId: string,
  sequence: number,
  actorType: ActorType,
  actorId: string,
  eventType: EventType,
  phase: RunPhase,
  payload: Record<string, unknown>
): RunEvent {
  return {
    runId,
    sequence,
    timestamp: createTimestamp(baseMs, sequence),
    actorType,
    actorId,
    eventType,
    phase,
    payload
  };
}

function inferApprovalIntent(task: string): ApprovalIntent | null {
  const catalog: Array<{ pattern: RegExp; actionLabel: string; impact: string }> = [
    {
      pattern: /\bpublish\b|\brelease\b|\bship\b/i,
      actionLabel: "Publish a user-facing deliverable",
      impact: "This would make a user-visible artifact public or externally visible."
    },
    {
      pattern: /\bdeploy\b|\bpush\b|\bcommit\b/i,
      actionLabel: "Commit or deploy a user-facing change",
      impact: "This would alter a downstream system or repository-visible output."
    },
    {
      pattern: /\bemail\b|\bsend\b|\bnotify\b/i,
      actionLabel: "Send an external communication",
      impact: "This would contact users or another external channel."
    }
  ];

  const match = catalog.find((item) => item.pattern.test(task));
  if (!match) {
    return null;
  }

  return {
    actionLabel: match.actionLabel,
    impact: match.impact,
    reason: "The task language implies an external or user-facing side effect, so Atlas must wait for approval."
  };
}

export async function buildRunScenario(
  task: string,
  roleIds: string[],
  options: BuildRunScenarioOptions = {}
): Promise<ScenarioBundle> {
  const sanitizedTask = task.trim();
  const selectedRoleIds = roleIds;
  const runId = createRunId();
  const baseMs = Date.now();
  const approvalIntent = inferApprovalIntent(sanitizedTask);
  const plannerMode = options.plannerMode ?? detectHeadPlannerMode();
  let sequence = 1;

  const initialEvents: RunEvent[] = [
    createEvent(baseMs, runId, sequence++, "system", "signal-atlas", "run_created", "draft", {
      task: sanitizedTask
    }),
    createEvent(baseMs, runId, sequence++, "user", "operator", "roles_assigned", "draft", {
      roleIds: selectedRoleIds
    }),
    createEvent(baseMs, runId, sequence++, "head-agent", HEAD_AGENT.id, "planning_started", "planning", {
      summary: "Atlas is generating the head plan..."
    })
  ];

  if (selectedRoleIds.length === 0) {
    initialEvents.push(
      createEvent(baseMs, runId, sequence++, "head-agent", HEAD_AGENT.id, "run_failed", "failed", {
        summary: "Atlas cannot create a plan without selected canvas agents.",
        diagnostics: ["Select at least one canvas agent before starting a run."]
      })
    );

    return {
      runId,
      initialEvents,
      queuedEvents: []
    };
  }

  const selectedRoles = selectedRoleIds.map((roleId) => getRoleById(roleId));
  options.onInitialEvents?.({
    runId,
    initialEvents: [...initialEvents]
  });

  const planningResult = await createHeadPlan(
    {
      task: sanitizedTask,
      roles: selectedRoles,
      cwd: options.cwd
    },
    plannerMode,
    (update) => {
      const summary = update.details.length > 0
        ? `${update.message} ${update.details.join(" ")}`
        : update.message;
      const event = createEvent(
        baseMs,
        runId,
        sequence++,
        "head-agent",
        HEAD_AGENT.id,
        "planning_started",
        "planning",
        {
          summary,
          details: update.details,
          level: update.level
        }
      );
      initialEvents.push(event);
      options.onPlanningEvent?.(event);
    },
    options.signal
  );

  if (!planningResult.ok) {
    initialEvents.push(
      createEvent(baseMs, runId, sequence++, "head-agent", HEAD_AGENT.id, "run_failed", "failed", {
        summary: planningResult.diagnostic,
        diagnostics: planningResult.details
      })
    );

    return {
      runId,
      initialEvents,
      queuedEvents: []
    };
  }

  const plan = planningResult.plan;
  const steps = plan.steps;
  initialEvents.push(
    createEvent(baseMs, runId, sequence++, "head-agent", HEAD_AGENT.id, "plan_created", "planning", {
      executionPlan: plan,
      steps,
      taskPackets: plan.taskPackets,
      workflowEdges: plan.workflowEdges,
      summary: plan.headSummary
    })
  );

  const queuedEvents: RunEvent[] = [];

  plan.workflowEdges.forEach((edge) => {
    const step = steps.find((candidate) => candidate.ownerId === edge.toAgentId);
    if (!step) return;

    queuedEvents.push(
      createHandoffEvent(baseMs, runId, sequence++, edge, step.id)
    );

    queuedEvents.push(
      createEvent(baseMs, runId, sequence++, "role-agent", edge.toAgentId, "agent_status_changed", "waiting_on_agent", {
        task: step.title,
        status: "active"
      })
    );

    const packet = plan.taskPackets.find((p) => p.agentId === edge.toAgentId);
    queuedEvents.push(
      createEvent(baseMs, runId, sequence++, "role-agent", edge.toAgentId, "agent_output_recorded", "dispatching", {
        stepId: step.id,
        summary: `${getRoleById(edge.toAgentId).label} recorded its assigned task packet.`,
        output: buildSyntheticRoleOutput(edge.toAgentId, plan, sanitizedTask),
        structuredOutput: packet ? {
          goal: packet.goal,
          why: packet.why,
          context: packet.context,
          constraints: packet.constraints,
          doneWhen: packet.doneWhen,
          next: packet.next,
          returnPolicy: packet.returnPolicy
        } : undefined
      })
    );

  });

  queuedEvents.push(
    createEvent(baseMs, runId, sequence++, "head-agent", HEAD_AGENT.id, "agent_status_changed", "dispatching", {
      task: "Review the collaboration, summarize the evidence, and decide whether approval is required.",
      status: "active"
    }),
    createEvent(baseMs, runId, sequence++, "head-agent", HEAD_AGENT.id, "agent_output_recorded", "dispatching", {
      summary: plan.headSummary,
      output: `${plan.summary} ${plan.workflowSummary}`.trim()
    })
  );

  if (approvalIntent) {
    queuedEvents.push(
      createEvent(baseMs, runId, sequence++, "head-agent", HEAD_AGENT.id, "blocked_action_requested", "awaiting_approval", {
        actionLabel: approvalIntent.actionLabel,
        impact: approvalIntent.impact,
        reason: approvalIntent.reason
      })
    );
  } else {
    queuedEvents.push(
      createEvent(baseMs, runId, sequence++, "head-agent", HEAD_AGENT.id, "run_completed", "completed", {
        summary: "Run completed without requiring an approval-gated side effect."
      })
    );
  }

  return {
    runId,
    initialEvents,
    queuedEvents
  };
}

function createHandoffEvent(
  baseMs: number,
  runId: string,
  sequence: number,
  edge: WorkflowEdge,
  stepId: string
): RunEvent {
  const actorType: ActorType =
    edge.fromAgentId === HEAD_AGENT.id ? "head-agent" : "role-agent";
  return createEvent(
    baseMs,
    runId,
    sequence,
    actorType,
    edge.fromAgentId,
    "handoff_requested",
    "dispatching",
    {
      fromAgentId: edge.fromAgentId,
      toAgentId: edge.toAgentId,
      stepId,
      note: edge.note,
      edgeKind: edge.kind,
      requiresIntermediateReturn: edge.requiresIntermediateReturn
    }
  );
}

function buildSyntheticRoleOutput(agentId: string, plan: ExecutionPlan, task: string): string {
  const packet = plan.taskPackets.find((candidate) => candidate.agentId === agentId);
  const role = getRoleById(agentId);

  if (!packet) {
    return `${role.label} did not receive a task packet for "${task}".`;
  }

  return [
    `${role.label} is a PoC lane in this milestone.`,
    `Goal: ${packet.goal}`,
    `Next: ${packet.next}`,
    `Return policy: ${packet.returnPolicy}`
  ].join(" ");
}

export function buildApprovalResolutionEvents(
  runId: string,
  nextSequence: number,
  decision: "approved" | "rejected",
  actionLabel: string
): RunEvent[] {
  const baseMs = Date.now();

  return [
    createEvent(baseMs, runId, nextSequence, "user", "operator", "approval_recorded", "awaiting_approval", {
      decision,
      note:
        decision === "approved"
          ? `Operator approved: ${actionLabel}.`
          : `Operator rejected: ${actionLabel}. Internal work remains visible but the side effect stays blocked.`
    }),
    createEvent(baseMs, runId, nextSequence + 1, "head-agent", HEAD_AGENT.id, "run_completed", "completed", {
      summary:
        decision === "approved"
          ? `Run completed after approval for "${actionLabel}". The side effect remains simulated in version 1.`
          : `Run completed without executing "${actionLabel}" because the operator rejected it.`
    })
  ];
}
