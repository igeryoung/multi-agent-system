# Deep Interview Spec: Real Agent Usage And Division Of Work

## Metadata

- Profile: standard
- Rounds: 8
- Final ambiguity: 0.091
- Threshold: 0.200
- Context type: brownfield
- Interview ID: 8F82C722-2786-44FB-A5F1-A8E60B64F9B1
- Context snapshot: `.omx/context/real-agent-usage-division-of-work-20260404T065846Z.md`
- Transcript: `.omx/interviews/real-agent-usage-division-of-work-20260404T065846Z.md`

## Clarity Breakdown

| Dimension | Score | Notes |
| --- | --- | --- |
| Intent | 0.89 | Move the current demo toward real agent usage without jumping straight to full worker execution. |
| Outcome | 0.92 | The next version should generate a real head-driven plan, workflow pipeline, and per-agent packets. |
| Scope | 0.93 | Only the head node gets live local Codex `tmux` execution; subagents remain PoC task viewers. |
| Constraints | 0.90 | User-channel, discovery source, reporting policy, and excluded runtime features are explicit. |
| Success | 0.84 | Done-when signals are testable, especially head-generated plan/packet output and visible per-agent task input. |
| Context | 0.98 | The requirements are grounded in the current React/TypeScript event-projected app and its synthetic orchestrator. |

## Intent

Continue building beyond v1 by making the system feel like real orchestration rather than a scripted replay. The user wants the head node to become a meaningful orchestrator that inspects available agents in the current session, partitions the task, defines the workflow pipeline, and assigns bounded subtasks using a strong context-engineering format.

## Desired Outcome

When a user submits a task to the head node, the head node uses local Codex via `tmux` to produce:

- a structured plan
- a workflow pipeline
- a per-agent task packet for each selected canvas agent
- a single head-node summary back to the user

The role-agent/subagent surfaces in this milestone do not execute the task for real. They serve as proof-of-concept nodes that display the assigned task packet produced by the head node.

## In Scope

- User assigns one task to the head node
- Head node remains the only node that communicates with the user
- Head node discovers available agents from the current session canvas selection only
- Head node uses agent descriptions from the current environment to partition work
- Head node creates a structured plan and explicit workflow pipeline
- Head node produces per-agent task packets
- The task packet format is refined around context-engineering best practice
- Each subtask/node can display its assigned task input
- Agent-to-agent direct messaging is allowed inside the workflow contract
- The workflow can mark some nodes as required intermediate-return checkpoints
- Local Codex via `tmux` is required now for the head-node planning/generation path

## Out Of Scope / Non-goals

- No real role-agent/subagent execution in this milestone
- No auto-retry or failure-recovery policy
- No token or cost budgeting system
- No approval-gate system redesign
- No separate external runtime-discovery source for agents
- No agent ranking or performance scoring system

## Decision Boundaries

The system may decide automatically without confirmation:

- Which of the currently selected canvas agents are relevant to the task
- How to partition the user task into workflow stages
- How to generate the structured plan and per-agent task packets
- Which direct agent-to-agent collaboration edges exist inside the internal workflow
- Whether some nodes should return intermediate results to the head node

The system must obey these fixed boundaries in this milestone:

- Only the head node communicates with the user
- Only the head node may run local Codex via `tmux`
- Role agents/subagents only display assigned tasks as a PoC in this milestone
- Agent discovery comes only from agents currently selected on the session canvas
- By default the head receives final outputs and explicit blockers only
- The plan may require selected nodes to return intermediate results/checkpoints

## Constraints

- The codebase is an existing brownfield React/TypeScript app with a synthetic event replay runtime today
- Existing run/event projection concepts should be evolved rather than discarded without reason
- The current head-agent UX pattern should be preserved
- The milestone should stay contract-first even though the head node now gets a live local Codex `tmux` path
- The per-agent task packet should follow context-engineering best practice and can be refined to better match the product goal

## Refined Task Packet Shape

Each assigned task packet should contain:

- Goal: what this agent must change, produce, or decide
- Context: the relevant files, folders, docs, examples, prior outputs, errors, and upstream plan context
- Constraints: architecture, safety, conventions, and boundaries this agent must follow
- Done when: concrete completion conditions for this subtask
- Next: who receives the result next, and whether the result is final-only, blocker-only, or intermediate-return

Recommended refinement for this product:

- Add `Why` as a short mission line so the agent understands why this subtask exists in the broader workflow
- Add `Input source` so the packet shows whether context came from the user task, prior node output, or current environment facts
- Add `Return policy` so the node knows whether to report only on completion, only on blocker, or at named checkpoints

## Testable Acceptance Criteria

- Submitting one task causes the head node to generate a structured plan rather than a hardcoded scripted plan
- The generated output includes a workflow pipeline and one per-agent task packet for each selected canvas agent
- Agent discovery uses only the agents currently selected on the canvas for that session
- The head-node output can be driven by a prompt or head-node skill using local Codex via `tmux`
- Each subtask node can display the assigned task packet/task input
- The user-facing conversation still comes only from the head node
- The workflow contract can express direct agent-to-agent collaboration while keeping head visibility rules explicit
- The implementation does not require real worker-agent execution yet

## Assumptions Exposed And Resolutions

- Assumption: Contract-first means no live execution at all.
  Resolution: The user wants a narrow live path now, but only for the head node through local Codex `tmux`.

- Assumption: “Current environment” means any agent the system knows about.
  Resolution: In this app it means only the agents currently selected on the session canvas.

- Assumption: Allowing direct agent-to-agent messaging means the head must see all traffic.
  Resolution: The head sees final outputs and blockers by default, with plan-defined exceptions for intermediate checkpoints.

- Assumption: Role agents must execute for real to make the milestone valuable.
  Resolution: Not yet. Displaying assigned task packets is enough for the current proof-of-concept role-agent layer.

## Pressure-Pass Findings

The main contradiction was between “no real subagent invocation” and “Codex via tmux required now.” After revisiting the requirement, the clarified rule is:

- live execution is required now only for the head node
- role agents remain non-executing task viewers in this milestone

This keeps the milestone small while still proving the head-node orchestration contract against a real local Codex path.

## Brownfield Evidence Vs Inference

- Evidence: [`src/shared/contracts/types.ts`](/Users/yangping/Studio/side-project/multi-agent-system/src/shared/contracts/types.ts) already models head vs role agents and run events such as plan creation, handoffs, outputs, and approvals.
- Evidence: [`src/server/orchestrator/scenario.ts`](/Users/yangping/Studio/side-project/multi-agent-system/src/server/orchestrator/scenario.ts) currently builds a synthetic scenario from selected roles and hardcoded event generation.
- Evidence: [`src/hooks/use-live-drain.ts`](/Users/yangping/Studio/side-project/multi-agent-system/src/hooks/use-live-drain.ts) currently drains a queue of prebuilt events instead of invoking real orchestration logic.
- Evidence: [`src/server/events/projectRun.ts`](/Users/yangping/Studio/side-project/multi-agent-system/src/server/events/projectRun.ts) already provides a reusable event-projection layer that can likely carry richer plan/packet payloads.
- Inference: The current architecture can evolve incrementally by replacing synthetic head planning first, before tackling full role-agent execution.

## Technical Context Findings

- The current app already has the right product skeleton for a head-led orchestration UX
- The main technical gap is the orchestrator contract, not the graph or projection UI
- This milestone likely centers on:
  - expanding shared contract types for plan/pipeline/task packets
  - replacing synthetic head planning in the scenario/orchestrator path
  - integrating a head-node local Codex `tmux` planning harness
  - rendering per-agent packet/task input in the existing node or drawer UI

## Condensed Transcript

1. The user wants the next version to be contract-first before full worker execution.
2. The head node must produce a structured plan, workflow pipeline, per-agent task packets, and a head-only user summary.
3. Agents may message each other directly, but only the head talks to the user.
4. The head should usually receive final outputs and blockers only, with plan-driven intermediate-return exceptions.
5. Real worker execution, retry policy, token budgeting, and approval redesign are out of scope.
6. Done-when signals include head-generated plan/pipeline/packets, refined task-packet format, and visible subtask task input.
7. Only the head node gets live local Codex `tmux` execution now; subagents remain task-display PoC nodes.
8. Agent discovery should use only agents selected on the current session canvas.
