import {
  getRoleById,
  HEAD_AGENT,
  type ActorType,
  type EventType,
  type RunEvent,
  type RunPhase,
  type StepDefinition
} from "../../shared/contracts/types";

interface ScenarioBundle {
  runId: string;
  initialEvents: RunEvent[];
  queuedEvents: RunEvent[];
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

function buildSteps(task: string, roleIds: string[]): StepDefinition[] {
  return roleIds.map((roleId, index) => {
    const role = getRoleById(roleId);
    return {
      id: `step-${index + 1}`,
      ownerId: role.id,
      title: `${role.label}: ${role.stepTemplate}`,
      summary: `${role.responsibility} for "${task}"`
    };
  });
}

export function buildRunScenario(task: string, roleIds: string[]): ScenarioBundle {
  const sanitizedTask = task.trim();
  const selectedRoleIds = roleIds.length > 0 ? roleIds : ["ceo-planner", "engineer", "qa"];
  const runId = createRunId();
  const baseMs = Date.now();
  const steps = buildSteps(sanitizedTask, selectedRoleIds);
  const approvalIntent = inferApprovalIntent(sanitizedTask);
  let sequence = 1;

  const initialEvents: RunEvent[] = [
    createEvent(baseMs, runId, sequence++, "system", "signal-atlas", "run_created", "draft", {
      task: sanitizedTask
    }),
    createEvent(baseMs, runId, sequence++, "user", "operator", "roles_assigned", "draft", {
      roleIds: selectedRoleIds
    }),
    createEvent(baseMs, runId, sequence++, "head-agent", HEAD_AGENT.id, "plan_created", "planning", {
      steps,
      summary: `Atlas split the task into ${steps.length} accountable workstreams.`
    })
  ];

  const queuedEvents: RunEvent[] = [];
  let previousAgentId: string = HEAD_AGENT.id;
  let previousActorType: ActorType = "head-agent";

  steps.forEach((step, index) => {
    const role = getRoleById(step.ownerId);
    const handoffSource =
      previousAgentId === HEAD_AGENT.id ? HEAD_AGENT.label : getRoleById(previousAgentId).label;
    const handoffTarget = role.label;

    queuedEvents.push(
      createEvent(
        baseMs,
        runId,
        sequence++,
        previousActorType,
        previousAgentId,
        "handoff_requested",
        "dispatching",
        {
          fromAgentId: previousAgentId,
          toAgentId: role.id,
          stepId: step.id,
          note: `${handoffSource} handed work to ${handoffTarget} for ${step.title.toLowerCase()}.`
        }
      )
    );

    queuedEvents.push(
      createEvent(baseMs, runId, sequence++, "role-agent", role.id, "agent_status_changed", "waiting_on_agent", {
        task: step.title,
        status: "active"
      })
    );

    queuedEvents.push(
      createEvent(baseMs, runId, sequence++, "role-agent", role.id, "agent_output_recorded", "dispatching", {
        stepId: step.id,
        summary: `${role.label} completed its lane and packaged the next handoff.`,
        output: `${role.label} delivered a grounded update for "${sanitizedTask}" with evidence aligned to ${role.responsibility.toLowerCase()}.`
      })
    );

    previousAgentId = role.id;
    previousActorType = "role-agent";
  });

  queuedEvents.push(
    createEvent(baseMs, runId, sequence++, "head-agent", HEAD_AGENT.id, "agent_status_changed", "dispatching", {
      task: "Review the collaboration, summarize the evidence, and decide whether approval is required.",
      status: "active"
    }),
    createEvent(baseMs, runId, sequence++, "head-agent", HEAD_AGENT.id, "agent_output_recorded", "dispatching", {
      summary: "Atlas consolidated the specialist outputs into one operator-facing recommendation.",
      output: `Atlas reviewed ${steps.length} specialist contributions and aligned them into a single recommendation for "${sanitizedTask}".`
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
