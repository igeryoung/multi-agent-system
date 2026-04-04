# Deep Interview Spec: Multi-Agent System App

## Metadata

- Profile: standard
- Rounds: 7
- Final ambiguity: 0.184
- Threshold: 0.200
- Context type: greenfield
- Interview ID: 082FC24A-AD30-4388-AC6B-B658F5D09914
- Context snapshot: `.omx/context/multi-agent-system-app-20260402T125002Z.md`
- Transcript: `.omx/interviews/multi-agent-system-app-20260402T125002Z.md`

## Clarity Breakdown

| Dimension | Score | Notes |
| --- | --- | --- |
| Intent | 0.86 | Users need specialist agents to collaborate without becoming an opaque black box. |
| Outcome | 0.84 | The target experience is a usable, controllable system with visible workflow and a trusted approval surface. |
| Scope | 0.82 | V1 focuses on one collaborative task workflow with assigned roles and visible execution flow. |
| Constraints | 0.72 | Approval boundaries and orchestration model are defined, though technical stack choices remain open for planning. |
| Success | 0.80 | Trust is operationalized through required UI evidence signals visible before approval. |

## Intent

Build a multi-agent system app that lets specialized agents collaborate on one user task while keeping the entire process visible, understandable, and controllable. The app should feel less like an opaque autonomous swarm and more like an auditable workspace where users can see why work is happening and whether the collaboration is coherent.

## Desired Outcome

The user can submit a task, assign role-based agents, observe a visible head agent coordinate execution, follow the live flow of work across agents, and inspect the history of the run before approving the result. The product should provide the usability of a single top-level interaction surface while exposing the underlying multi-agent workflow.

## In Scope

- A user submits a single task into a global context window
- The user assigns different agents to defined roles
- Exactly one visible head agent plans and controls the workflow
- Role agents collaborate on the task under head-agent coordination
- Agents may assign tasks to other existing agents as part of collaboration
- The UI shows the currently active agent, its exact task, and its status
- The UI shows a taskflow breakdown of the user request into explicit steps
- The UI shows a handoff trace of what each agent passes to the next
- The UI includes a graph/history view for task and data flow, similar to an agent debug log
- The system may automatically read inputs, decompose tasks, coordinate agents, and generate drafts or recommendations

## Out of Scope / Non-goals

- Version 1 must not allow agents to create new agents
- Version 1 must not auto-generate complete role or skill definitions

## Decision Boundaries

The system may decide automatically without confirmation:

- Read user-provided inputs
- Decompose the task
- Coordinate agents
- Generate drafts or recommendations

The system must always require explicit user approval before:

- Sending or publishing externally
- Purchasing anything
- Deleting anything
- Modifying external systems
- Committing user-facing changes

## Constraints

- Version 1 must use exactly one visible head agent as the source of truth for planning and control
- The product must optimize for predictability, auditability, and user trust rather than maximum autonomy
- The workflow must stay understandable to the user at every step
- The application is greenfield; architecture and technical stack are still open planning decisions
- No new capabilities should violate the explicit approval boundary for external or user-facing side effects

## Testable Acceptance Criteria

- A user can create one task and assign multiple pre-defined role agents to it from one top-level interface
- The run displays a visible head agent responsible for planning and control
- The UI renders a taskflow breakdown of the user request into explicit steps
- At any moment during execution, the UI shows the currently active agent, its exact task, and its current status
- The UI renders a visible handoff trace between agents for the current run
- The UI preserves a historical graph or debug-log-style view of task/data flow for the run
- The system can automatically coordinate internal work without asking for permission
- The system blocks or requires confirmation for any external side effect or user-facing committed change
- The system does not support agent-created agents in version 1
- The system does not auto-generate complete role/skill definitions in version 1

## Assumptions Exposed And Resolutions

- Assumption: More agents automatically means a better product.
  Resolution: The real value is transparent collaboration plus control, not raw agent count.

- Assumption: "Easy to control" is self-explanatory.
  Resolution: Control must be represented through explicit plan visibility, active-agent visibility, and handoff traceability.

- Assumption: A head agent is merely an implementation detail.
  Resolution: For version 1, a single visible head agent is a product requirement because it anchors trust and auditability.

- Assumption: Agent self-spawning is part of the core vision.
  Resolution: It is deliberately excluded from version 1 to keep the product understandable and shippable.

## Pressure-Pass Findings

The original trust requirement was vague. After a pressure pass, it became concrete: users should only approve results when they can see the task broken into explicit steps, identify which agent is active and what it is doing, and inspect the handoff trace across agents. This converted an abstract trust goal into UI-level acceptance criteria.

## Brownfield Evidence Vs Inference

- Evidence: The repository currently contains `.git` and `.omx` only, with no existing app source files.
- Evidence: No previous deep-interview state or artifacts existed for this task.
- Inference: Product architecture, runtime design, and UI framework are open decisions for the planning phase.

## Technical Context Findings

- This is effectively a greenfield product effort inside an initialized repository shell
- Planning must still determine frontend stack, orchestration runtime, persistence/event model, and visualization approach
- The eventual architecture will need a clear event model because the UI must show both live state and historical handoff/dataflow

## Full Transcript

1. User wants specialist agents to work together instead of remaining a black box, with easier control and clearer correctness checks.
2. User initially described v1 broadly as agents coworking with visible task/data flow.
3. User clarified the main scenario: submit a task, assign agents to roles, let them collaborate, and visualize active agent and task-processing flow.
4. User explicitly excluded agent-created agents and automatic generation of complete role skills from v1.
5. User set the autonomy boundary: internal coordination may be automatic, but external side effects and user-facing changes require approval.
6. User defined required trust evidence in the UI: taskflow breakdown, active agent/task/status, and handoff trace.
7. User decided that v1 must have exactly one visible head agent because it improves predictability, auditability, and trust.
