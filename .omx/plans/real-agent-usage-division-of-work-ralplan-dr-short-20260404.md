# RALPLAN-DR Draft: Real Agent Usage And Division Of Work

## Metadata

- Source spec: [deep-interview-real-agent-usage-division-of-work.md](/Users/yangping/Studio/side-project/multi-agent-system/.omx/specs/deep-interview-real-agent-usage-division-of-work.md)
- Source transcript: [real-agent-usage-division-of-work-20260404T065846Z.md](/Users/yangping/Studio/side-project/multi-agent-system/.omx/interviews/real-agent-usage-division-of-work-20260404T065846Z.md)
- Source context: [real-agent-usage-division-of-work-20260404T065846Z.md](/Users/yangping/Studio/side-project/multi-agent-system/.omx/context/real-agent-usage-division-of-work-20260404T065846Z.md)
- Planning mode: `ralplan` consensus, short mode
- Status: `consensus-approved for execution handoff`

## Requirements Summary

The current app already has the right product shell for a head-led multi-agent workspace, but the runtime is still synthetic. The event layer already models `plan_created`, `handoff_requested`, `agent_output_recorded`, and approval events in [types.ts](/Users/yangping/Studio/side-project/multi-agent-system/src/shared/contracts/types.ts#L14) and [projectRun.ts](/Users/yangping/Studio/side-project/multi-agent-system/src/server/events/projectRun.ts), while the orchestrator still hardcodes steps and role outputs in [scenario.ts](/Users/yangping/Studio/side-project/multi-agent-system/src/server/orchestrator/scenario.ts#L88).

This milestone should make the head node meaningfully real without turning the whole app into a live multi-agent runtime. Submitting one task should let the head node discover the selected canvas agents from [use-canvas-agents.ts](/Users/yangping/Studio/side-project/multi-agent-system/src/hooks/use-canvas-agents.ts#L9), use local Codex via `tmux` to generate a structured plan and workflow pipeline, and emit refined per-agent task packets. Role agents remain proof-of-concept nodes that display assigned task input only, which fits the current node/drawer UI surfaces in [agent-node.tsx](/Users/yangping/Studio/side-project/multi-agent-system/src/components/graph/agent-node.tsx#L14) and [agent-drawer.tsx](/Users/yangping/Studio/side-project/multi-agent-system/src/components/graph/agent-drawer.tsx#L24).

## RALPLAN-DR Summary

### Principles

1. Keep the head node as the single user-facing orchestrator.
2. Replace synthetic planning before replacing worker execution.
3. Reuse the existing event-projection and session/canvas model where possible.
4. Make the task packet the core product artifact, not just a hidden prompt detail.
5. Preserve future room for real worker execution without forcing it into this milestone.

### Decision Drivers

1. The orchestrator gap is in head-plan generation, not in graph rendering or session selection, as shown by [scenario.ts](/Users/yangping/Studio/side-project/multi-agent-system/src/server/orchestrator/scenario.ts#L100) versus [App.tsx](/Users/yangping/Studio/side-project/multi-agent-system/src/app/App.tsx#L196).
2. Agent discovery is explicitly limited to canvas-selected agents in the active session, which already exists in [use-canvas-agents.ts](/Users/yangping/Studio/side-project/multi-agent-system/src/hooks/use-canvas-agents.ts#L13) and [App.tsx](/Users/yangping/Studio/side-project/multi-agent-system/src/app/App.tsx#L67).
3. Only the head node is allowed to use local Codex via `tmux` now; role agents must stay non-executing PoC task viewers.

### Viable Options

#### Option A: Keep the replay runtime and only enrich the synthetic data model

- Pros: smallest code churn; fast to demo; keeps the current drain loop in [use-live-drain.ts](/Users/yangping/Studio/side-project/multi-agent-system/src/hooks/use-live-drain.ts#L88).
- Cons: does not satisfy the required proof signal that the head node really uses local Codex via `tmux`; still leaves plan generation hardcoded in [scenario.ts](/Users/yangping/Studio/side-project/multi-agent-system/src/server/orchestrator/scenario.ts#L109).

#### Option B: Replace only head-plan generation with a live head-node planning harness, while keeping role execution synthetic/PoC

- Pros: matches the clarified milestone exactly; introduces a real planning path; keeps worker execution out of scope; reuses the current event log and projection pipeline in [types.ts](/Users/yangping/Studio/side-project/multi-agent-system/src/shared/contracts/types.ts#L44) and [projectRun.ts](/Users/yangping/Studio/side-project/multi-agent-system/src/server/events/projectRun.ts#L69).
- Cons: requires a new planning harness boundary, richer plan/task-packet payloads, and careful fallback behavior when the head planner fails.

#### Option C: Replace both head and role agents with live Codex `tmux` execution now

- Pros: maximally “real” and closest to the long-term vision.
- Cons: directly violates the clarified scope that real role-agent execution is out of scope; multiplies runtime, supervision, and failure-policy work far beyond this milestone.

### Recommendation

Choose Option B. It is the only option that satisfies the hard requirement for live head-node planning via local Codex `tmux` while preserving the contract-first boundary that role agents remain PoC task viewers.

## Architect Review

- Steelman antithesis: the strongest case against Option B is that it mixes two incompatible runtime assumptions. The current app is a browser-first React/Vite app with localStorage-backed state and no real backend process host, so adding `tmux`-driven local Codex planning is not a small orchestrator tweak. Without an explicit host boundary, the plan risks pretending the browser can spawn local processes, which would make the favored option architecturally dishonest.
- Tradeoff tension: preserving the existing replay/event substrate keeps the milestone small, but it also increases the temptation to silently fall back to synthetic behavior when live head planning fails. That would preserve UX smoothness at the cost of violating the user’s main proof signal that the head planner is now real.
- Synthesis path: keep Option B, but narrow it further. Introduce a dedicated local planner bridge outside the browser runtime, keep direct agent-to-agent edges declarative rather than executable in this milestone, and make planner failure explicit in the run state instead of silently reverting to the old synthetic planner.
- Result: `ITERATE` until the draft names the host boundary, the failure contract, and the representational-only meaning of internal agent-to-agent edges in this milestone.

## Proposed Architecture

### 1. Extend the shared run contract for plan, packet, and visibility policy

The current shared types only model `StepDefinition` with `title` and `summary`, plus generic event payloads in [types.ts](/Users/yangping/Studio/side-project/multi-agent-system/src/shared/contracts/types.ts#L37). That is not enough to carry:

- workflow pipeline metadata
- per-agent task packets
- return-policy rules
- direct messaging edges and intermediate-return flags
- head-generated summary provenance

Add first-class shared types for:

- `TaskPacket`
- `WorkflowEdge`
- `ExecutionPlan`
- `ReturnPolicy`
- richer `plan_created` and `handoff_requested` payloads

Preserve the event-driven projection model rather than bypassing it, so [projectRun.ts](/Users/yangping/Studio/side-project/multi-agent-system/src/server/events/projectRun.ts#L74) remains the source of truth for the live UI.

### 2. Split orchestration into head planning and replay/display phases

Today [buildRunScenario()`](/Users/yangping/Studio/side-project/multi-agent-system/src/server/orchestrator/scenario.ts#L100) does everything at once: create steps, create handoffs, create synthetic role outputs, and decide approval gating. Replace that with two explicit phases:

- Phase A: head planner generates plan and task packets using local Codex via `tmux`
- Phase B: the app converts the plan into replay/display events for the current milestone

That means:

- move synthetic step creation out of `buildSteps()` in [scenario.ts](/Users/yangping/Studio/side-project/multi-agent-system/src/server/orchestrator/scenario.ts#L88)
- introduce a head-planning adapter/service that takes the user task plus selected roles and returns an `ExecutionPlan`
- let the scenario builder consume that `ExecutionPlan` and emit events for PoC subagent display

Internal direct agent-to-agent messaging is representational in this milestone. The plan may declare peer edges and return checkpoints, but worker agents do not execute those edges for real yet. The replay/display phase is responsible for visualizing those edges and checkpoints without implying live worker autonomy.

### 3. Keep agent discovery session-local and canvas-driven

The discovery source is already present: `useCanvasAgents()` maps `selectedRoleIds` into concrete role definitions in [use-canvas-agents.ts](/Users/yangping/Studio/side-project/multi-agent-system/src/hooks/use-canvas-agents.ts#L13). The head planner should consume only those roles, preserving session-local selection state from [use-session-store.ts](/Users/yangping/Studio/side-project/multi-agent-system/src/hooks/use-session-store.ts#L180).

This avoids introducing a second registry or runtime lookup source in this milestone.

### 4. Make the task packet visible in node and drawer UI

The current agent node only shows `currentTask` in [agent-node.tsx](/Users/yangping/Studio/side-project/multi-agent-system/src/components/graph/agent-node.tsx#L15), and the drawer only shows `responsibility` plus history in [agent-drawer.tsx](/Users/yangping/Studio/side-project/multi-agent-system/src/components/graph/agent-drawer.tsx#L74). Add a first-class task-packet view so each role node can expose:

- Why
- Goal
- Context
- Constraints
- Done when
- Next
- Return policy

The drawer is the natural place for the full packet, while the node surface should continue showing a concise current-task summary.

### 5. Keep the user conversation head-only

The message adapter already centralizes plan, handoff, output, and approval display in [adapters.ts](/Users/yangping/Studio/side-project/multi-agent-system/src/lib/adapters.ts#L120). Preserve that pattern by having the head-node planning harness emit one user-facing summary derived from the generated plan, while subagent/task-packet details stay visible in graph/drawer surfaces rather than becoming raw chat noise.

### 6. Introduce a narrow head-node `tmux` integration seam

The local head planner should be its own seam, separate from UI hooks and separate from event projection. The interface should look roughly like:

- input: user task + selected roles + repo/session context
- output: generated execution plan + task packets + head summary + fallback diagnostics

The call site should sit behind the live-run start path currently wired in [use-live-drain.ts](/Users/yangping/Studio/side-project/multi-agent-system/src/hooks/use-live-drain.ts#L117), but the UI hook should not own process orchestration details directly. Put the integration behind a local planner bridge module under `src/server/orchestrator/` or an equivalent companion boundary so UI code can stay declarative.

Critical host-boundary decision:

- The browser app must not attempt to spawn `tmux` directly.
- This milestone therefore requires a local host bridge for head planning, such as a dev-only localhost endpoint, local companion process, or equivalent environment-specific adapter.
- The planning adapter in the app should call that bridge through an interface that is mockable in tests.

Failure contract:

- No silent synthetic fallback for normal user-triggered runs.
- If the head planner bridge or local Codex `tmux` call fails, the run should surface a visible head-node diagnostic and stop before queuing synthetic worker progress.
- The existing synthetic planner path may remain only as an explicit test/demo fixture path, not as an invisible production fallback.

## Refined Task Packet Recommendation

Use this product-facing task packet shape:

- `why`: short mission statement for why this agent is in the workflow
- `goal`: exact deliverable or decision this agent owns
- `context`: relevant files, prior outputs, role context, docs, and errors
- `constraints`: architecture, safety, and process rules
- `doneWhen`: concrete completion conditions
- `next`: who receives the result next
- `inputSource`: user task, environment fact, prior node output, or mixed
- `returnPolicy`: final-only, blocker-only, or checkpointed

This preserves the user’s original structure while making the packet usable as both an execution input and a UI artifact.

## Acceptance Criteria

1. Starting a run with selected canvas agents causes the head node to generate a plan from those selected agents, not from a hardcoded role-to-step template.
2. The generated plan contains workflow pipeline structure plus one task packet per selected role agent.
3. Only the head node uses local Codex via `tmux`; role-agent execution remains synthetic or display-only.
4. The user-facing conversation remains head-only even if the plan contains internal direct agent-to-agent edges.
5. The run data and projection layer can represent return-policy rules, including default final-only/blocker-only visibility and plan-defined intermediate returns.
6. Each role/subagent can display its assigned task packet in the UI.
7. Existing approval gating for external/user-facing side effects still works after the planning refactor.
8. Planner failure does not silently re-enter the old synthetic happy path for user-triggered runs; it surfaces an explicit diagnostic or failed/blocked run state instead.
9. Existing run projection behavior remains valid for legacy runs and explicit fixture/demo runs that do not use the new head-planning path.

## Critic Evaluation

- Verdict: `APPROVE`
- Approval basis:
  - The favored option is now principle-consistent after making the host boundary and failure contract explicit.
  - Alternatives are real and fairly bounded.
  - Acceptance criteria are testable and now protect against silent synthetic fallback.
  - Verification steps cover contract, translation, UI evidence, and failure handling.
- Applied improvements:
  - Made the browser-vs-`tmux` host boundary explicit.
  - Converted fallback from an implicit convenience into an explicit failure contract.
  - Clarified that internal agent-to-agent edges are declarative in this milestone, not live worker execution.

## Implementation Steps

1. Expand shared orchestration contracts in [types.ts](/Users/yangping/Studio/side-project/multi-agent-system/src/shared/contracts/types.ts#L14) to represent task packets, workflow edges, return policy, and richer plan payloads.
2. Refactor [scenario.ts](/Users/yangping/Studio/side-project/multi-agent-system/src/server/orchestrator/scenario.ts#L88) so step creation comes from a head-generated `ExecutionPlan` instead of `buildSteps(task, roleIds)`.
3. Add a head-planning adapter/service under `src/server/orchestrator/` that invokes local Codex via `tmux`, consumes selected canvas roles, and returns plan + packet + head-summary output.
4. Define the host boundary for that adapter explicitly: the app-side code calls a local planner bridge, while the bridge owns `tmux`/Codex process orchestration and can be mocked in tests.
5. Adjust [use-live-drain.ts](/Users/yangping/Studio/side-project/multi-agent-system/src/hooks/use-live-drain.ts#L117) to await the head-planning phase before queuing replay/display events, and to stop with a visible diagnostic if planning fails.
6. Extend [projectRun.ts](/Users/yangping/Studio/side-project/multi-agent-system/src/server/events/projectRun.ts) and [adapters.ts](/Users/yangping/Studio/side-project/multi-agent-system/src/lib/adapters.ts#L120) to project richer plan/task-packet metadata into nodes, drawers, and user-facing messages without exposing raw internal peer traffic in chat.
7. Update [agent-node.tsx](/Users/yangping/Studio/side-project/multi-agent-system/src/components/graph/agent-node.tsx#L14) and [agent-drawer.tsx](/Users/yangping/Studio/side-project/multi-agent-system/src/components/graph/agent-drawer.tsx#L24) so each subagent can view its task packet.
8. Add regression and new behavior tests around packet generation, discovery-from-selected-roles, head-only chat, planner-failure diagnostics, and approval continuity in [tests/projectRun.test.ts](/Users/yangping/Studio/side-project/multi-agent-system/tests/projectRun.test.ts#L6) plus new orchestrator/service tests.

## Risks And Mitigations

- Risk: the `tmux` head planner introduces brittle local-process coupling.
  - Mitigation: isolate the integration behind one service boundary with explicit fallback diagnostics and mockable outputs.
- Risk: the browser app has no legitimate way to spawn `tmux` directly.
  - Mitigation: make the host boundary explicit and keep app code dependent on a bridge interface instead of direct process orchestration.
- Risk: expanding the event payloads breaks projection assumptions.
  - Mitigation: keep the event types stable and extend payloads additively, then lock behavior with regression tests around [projectRun.ts](/Users/yangping/Studio/side-project/multi-agent-system/src/server/events/projectRun.ts).
- Risk: the plan schema becomes overfit to UI and underfit to future execution.
  - Mitigation: model task packets as first-class shared contracts rather than ad hoc drawer-only fields.
- Risk: direct agent-to-agent edges leak into the chat and violate the head-only communication rule.
  - Mitigation: keep chat rendering head-centered in [adapters.ts](/Users/yangping/Studio/side-project/multi-agent-system/src/lib/adapters.ts#L120) and move internal detail to graph/drawer surfaces.
- Risk: role agents accidentally appear “real” before a worker runtime exists.
  - Mitigation: explicitly label them as assigned-task PoC views and keep their outputs synthetic until a later milestone.

## Verification Steps

1. Unit-test the new plan/task-packet/return-policy contract.
2. Unit-test planner-output-to-event translation, including explicit planner-failure states.
3. Mock the local planner bridge and verify `handleStartRun()` waits for plan generation before queuing events.
4. Verify that selected canvas roles alone determine discovery and packet generation.
5. Verify that task-packet content is visible in the subagent UI.
6. Verify that the head summary remains the only user-facing conversation output.
7. Verify that planner failure produces a visible blocked/failed run state instead of silently replaying the old synthetic path.
8. Re-run approval-gate and replay-history tests to confirm the planning refactor preserved existing safety behavior.

## ADR

### Decision

Adopt a head-generated planning seam: the head node uses local Codex via `tmux` to generate an execution plan and task packets, while the rest of the app continues to use an event-projected replay/display model for this milestone.

### Drivers

- The current product gap is in synthetic orchestration, not session/canvas/graph basics.
- Live head-node planning is required now.
- Real role-agent execution is explicitly out of scope.
- The current event-projection model is already valuable and should be reused.

### Alternatives Considered

- Keep everything synthetic and only reshape data: rejected because it fails the live head-planning requirement.
- Make all agents live via `tmux` now: rejected because it exceeds scope and forces runtime concerns the user explicitly deferred.

### Why Chosen

This is the narrowest architecture that proves the product direction without overcommitting to a full worker runtime. It keeps the event model and UI mostly intact while replacing the highest-value synthetic seam first.

### Consequences

- Shared contracts become richer and more explicit.
- `buildRunScenario()` stops being the source of truth for step decomposition.
- The app gains a local planner-bridge integration point for head planning.
- UI surfaces must expose task packets more explicitly.
- Fallback behavior matters because head planning now has a real failure mode.

### Follow-Ups

- Add real worker-agent execution in a later milestone.
- Revisit direct agent-to-agent execution semantics once workers are real.
- Revisit retry, budgeting, and richer observability once the planning seam is stable.

## Available-Agent-Types Roster

- `planner`: planning structure and execution sequencing
- `architect`: orchestration boundaries, interfaces, and service seams
- `critic`: plan quality gate and tradeoff pressure
- `executor`: implementation of shared types, orchestrator seam, and UI wiring
- `debugger`: runtime-process and event-sequencing diagnosis
- `test-engineer`: test design for contract, translation, and UI evidence
- `verifier`: completion evidence and regression validation
- `researcher`: local Codex/tmux integration research if runtime behavior needs confirmation

## Follow-Up Staffing Guidance

### Recommended `ralph` lane

- Lead: `executor` with `high` reasoning
- Validation support: `test-engineer` with `medium` reasoning
- Close-out: `verifier` with `high` reasoning
- Why: this milestone is narrow enough for one persistent owner if the implementation stays focused on the head-planning seam and contract/UI wiring.

### Recommended `$team` lane

- Lane 1: `executor` with `high` reasoning for shared contracts + orchestrator seam
- Lane 2: `executor` with `medium` reasoning for UI packet display and adapter updates
- Lane 3: `test-engineer` with `medium` reasoning for regression + new packet/planner tests
- Optional review pass: `debugger` or `verifier` if the `tmux` harness becomes flaky
- Why: the write scopes are naturally split across contract/orchestrator, UI/adapters, and tests.

## Launch Hints

### `ralph`

Use the approved PRD plus the test spec as the execution source of truth:

```text
$ralph /Users/yangping/Studio/side-project/multi-agent-system/.omx/plans/prd-real-agent-usage-division-of-work.md
```

### `$team`

Use the same artifacts with lanes split by write scope:

```text
$team /Users/yangping/Studio/side-project/multi-agent-system/.omx/plans/prd-real-agent-usage-division-of-work.md
```

Suggested team split:

- worker 1: shared contracts + orchestrator/head planner
- worker 2: projection/adapters + node/drawer packet UI
- worker 3: tests and regression coverage

## Team Verification Path

Before team shutdown:

- Contracts and event translation prove one plan + one packet per selected role
- UI proves subagent packet visibility
- Tests prove approval continuity and head-only user communication

After team handoff, Ralph or the leader verifier should confirm:

- the `tmux` head-planning seam is exercised or cleanly mocked in tests
- no role-agent live execution leaked into the milestone
- existing replay/approval behavior still passes
