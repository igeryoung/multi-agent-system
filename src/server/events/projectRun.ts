import {
  type ExecutionPlan,
  getRoleById,
  HEAD_AGENT,
  type AgentProjection,
  type ApprovalProjection,
  type HandoffProjection,
  type OutputProjection,
  type RunEvent,
  type RunProjection,
  type StepProjection,
  type TaskPacket,
  type WorkflowEdge
} from "../../shared/contracts/types";

function emptyApproval(): ApprovalProjection {
  return {
    status: "idle",
    actionLabel: "",
    impact: "",
    reason: "",
    decisionNote: ""
  };
}

function createHeadAgent(): AgentProjection {
  return {
    id: HEAD_AGENT.id,
    label: HEAD_AGENT.label,
    kind: "head",
    hue: HEAD_AGENT.hue,
    responsibility: HEAD_AGENT.responsibility,
    status: "idle",
    currentTask: "Waiting for a task.",
    assignedTaskPacket: null
  };
}

function createRoleAgent(roleId: string): AgentProjection {
  const role = getRoleById(roleId);

  return {
    id: role.id,
    label: role.label,
    kind: "role",
    hue: role.hue,
    responsibility: role.responsibility,
    status: "idle",
    currentTask: "Waiting for delegation.",
    assignedTaskPacket: null
  };
}

function summarizeTitle(task: string): string {
  return task.length > 42 ? `${task.slice(0, 39)}...` : task;
}

function setOnlyActive(agents: AgentProjection[], agentId: string, task: string): void {
  for (const agent of agents) {
    if (agent.id === agentId) {
      agent.status = "active";
      agent.currentTask = task;
    } else if (agent.status !== "completed" && agent.status !== "blocked") {
      agent.status = "waiting";
    }
  }
}

function agentLabel(agents: AgentProjection[], actorId: string): string {
  return agents.find((agent) => agent.id === actorId)?.label ?? actorId;
}

export function projectRun(events: RunEvent[]): RunProjection {
  const agents: AgentProjection[] = [createHeadAgent()];
  const steps: StepProjection[] = [];
  const handoffs: HandoffProjection[] = [];
  const outputs: OutputProjection[] = [];
  const workflowEdges: WorkflowEdge[] = [];
  const taskPackets: TaskPacket[] = [];
  const diagnostics: string[] = [];
  let approval = emptyApproval();
  let activeAgentId: string = HEAD_AGENT.id;
  let title = "New run";
  let task = "";
  let phase: RunProjection["phase"] = "draft";
  let currentDecision = "Waiting for the user to dispatch a run.";
  let latestSummary = "No execution yet.";
  let lastEventAt = "";

  for (const event of events) {
    phase = event.phase;
    lastEventAt = event.timestamp;

    switch (event.eventType) {
      case "run_created": {
        task = String(event.payload.task ?? "");
        title = summarizeTitle(task);
        currentDecision = "Task accepted and waiting for role assignment.";
        agents[0].status = "active";
        agents[0].currentTask = "Staging the task for planning";
        break;
      }
      case "roles_assigned": {
        const roleIds = (event.payload.roleIds as string[]) ?? [];
        for (const roleId of roleIds) {
          if (!agents.some((agent) => agent.id === roleId)) {
            agents.push(createRoleAgent(roleId));
          }
        }
        currentDecision = `${roleIds.length} role agents were assigned to the run.`;
        break;
      }
      case "planning_started": {
        currentDecision = String(event.payload.summary ?? "Planning in progress...");
        agents[0].status = "active";
        agents[0].currentTask = currentDecision;
        break;
      }
      case "plan_created": {
        const executionPlan = event.payload.executionPlan as ExecutionPlan | undefined;
        const plannedSteps = (executionPlan?.steps ?? event.payload.steps) as StepProjection[] | undefined;
        const plannedPackets = (executionPlan?.taskPackets ?? event.payload.taskPackets) as TaskPacket[] | undefined;
        const plannedEdges = (executionPlan?.workflowEdges ?? event.payload.workflowEdges) as WorkflowEdge[] | undefined;
        steps.splice(
          0,
          steps.length,
          ...(plannedSteps ?? []).map((step) => ({ ...step, status: "pending" as const }))
        );
        taskPackets.splice(0, taskPackets.length, ...(plannedPackets ?? []));
        workflowEdges.splice(0, workflowEdges.length, ...(plannedEdges ?? []));
        diagnostics.push(...(executionPlan?.diagnostics ?? []));
        for (const agent of agents) {
          agent.assignedTaskPacket = taskPackets.find((packet) => packet.agentId === agent.id) ?? null;
          if (agent.assignedTaskPacket) {
            agent.currentTask = agent.assignedTaskPacket.goal;
          }
        }
        agents[0].status = "active";
        agents[0].currentTask = "Publishing the execution plan";
        activeAgentId = HEAD_AGENT.id;
        currentDecision = String(event.payload.summary ?? "The head agent created the plan.");
        latestSummary = currentDecision;
        break;
      }
      case "handoff_requested": {
        const fromAgentId = String(event.payload.fromAgentId ?? HEAD_AGENT.id);
        const toAgentId = String(event.payload.toAgentId ?? "");
        const stepId = String(event.payload.stepId ?? "");
        const note = String(event.payload.note ?? "");
        handoffs.push({
          id: `${event.runId}-handoff-${event.sequence}`,
          fromAgentId,
          toAgentId,
          stepId,
          note,
          sequence: event.sequence
        });
        currentDecision = note;
        activeAgentId = toAgentId || activeAgentId;
        const step = steps.find((candidate) => candidate.id === stepId);
        if (step && step.status === "pending") {
          step.status = "in_progress";
        }
        break;
      }
      case "agent_status_changed": {
        const taskLabel = String(event.payload.task ?? "");
        setOnlyActive(agents, event.actorId, taskLabel);
        activeAgentId = event.actorId;
        currentDecision = `${agentLabel(agents, event.actorId)} is active.`;
        break;
      }
      case "agent_output_recorded": {
        const output = String(event.payload.output ?? "");
        const summary = String(event.payload.summary ?? output);
        outputs.unshift({
          id: `${event.runId}-output-${event.sequence}`,
          actorId: event.actorId,
          actorLabel: agentLabel(agents, event.actorId),
          summary,
          content: output,
          sequence: event.sequence
        });
        latestSummary = summary;
        const stepId = String(event.payload.stepId ?? "");
        const step = steps.find((candidate) => candidate.id === stepId);
        if (step) {
          step.status = "completed";
        }
        const agent = agents.find((candidate) => candidate.id === event.actorId);
        if (agent) {
          agent.status = "completed";
          agent.currentTask = summary;
        }
        break;
      }
      case "blocked_action_requested": {
        approval = {
          status: "pending",
          actionLabel: String(event.payload.actionLabel ?? ""),
          impact: String(event.payload.impact ?? ""),
          reason: String(event.payload.reason ?? ""),
          decisionNote: ""
        };
        activeAgentId = HEAD_AGENT.id;
        agents[0].status = "blocked";
        agents[0].currentTask = String(event.payload.actionLabel ?? "Waiting for user approval");
        const finalStep = steps[steps.length - 1];
        if (finalStep && finalStep.status !== "completed") {
          finalStep.status = "blocked";
        }
        currentDecision = `Approval required: ${approval.actionLabel}`;
        break;
      }
      case "approval_recorded": {
        approval = {
          ...approval,
          status: String(event.payload.decision ?? "approved") === "approved" ? "approved" : "rejected",
          decisionNote: String(event.payload.note ?? "")
        };
        agents[0].status = "active";
        agents[0].currentTask = approval.decisionNote;
        currentDecision = approval.decisionNote;
        break;
      }
      case "run_completed": {
        activeAgentId = HEAD_AGENT.id;
        agents[0].status = "completed";
        agents[0].currentTask = String(event.payload.summary ?? "Run completed.");
        latestSummary = agents[0].currentTask;
        currentDecision = latestSummary;
        for (const step of steps) {
          if (step.status === "in_progress" || step.status === "blocked") {
            step.status = "completed";
          }
        }
        for (const agent of agents) {
          if (agent.status === "waiting" || agent.status === "active" || agent.status === "blocked") {
            agent.status = "completed";
          }
        }
        break;
      }
      case "run_failed": {
        activeAgentId = HEAD_AGENT.id;
        agents[0].status = "blocked";
        agents[0].currentTask = String(event.payload.summary ?? "Run failed.");
        latestSummary = agents[0].currentTask;
        currentDecision = latestSummary;
        const failureDiagnostics = (event.payload.diagnostics as string[] | undefined) ?? [];
        diagnostics.push(...failureDiagnostics);
        break;
      }
      default: {
        diagnostics.push(`Unhandled event type: ${event.eventType}`);
      }
    }
  }

  return {
    runId: events[0]?.runId ?? "draft-run",
    title,
    task,
    phase,
    headAgentId: HEAD_AGENT.id,
    activeAgentId,
    currentDecision,
    latestSummary,
    lastEventAt,
    agents,
    steps,
    handoffs,
    workflowEdges,
    taskPackets,
    approval,
    outputs,
    diagnostics
  };
}
