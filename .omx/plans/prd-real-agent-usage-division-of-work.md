# PRD: Real Agent Usage And Division Of Work

## Metadata

- Source spec: [deep-interview-real-agent-usage-division-of-work.md](/Users/yangping/Studio/side-project/multi-agent-system/.omx/specs/deep-interview-real-agent-usage-division-of-work.md)
- Source transcript: [real-agent-usage-division-of-work-20260404T065846Z.md](/Users/yangping/Studio/side-project/multi-agent-system/.omx/interviews/real-agent-usage-division-of-work-20260404T065846Z.md)
- Source context: [real-agent-usage-division-of-work-20260404T065846Z.md](/Users/yangping/Studio/side-project/multi-agent-system/.omx/context/real-agent-usage-division-of-work-20260404T065846Z.md)
- Consensus draft: [real-agent-usage-division-of-work-ralplan-dr-short-20260404.md](/Users/yangping/Studio/side-project/multi-agent-system/.omx/plans/real-agent-usage-division-of-work-ralplan-dr-short-20260404.md)
- Planning mode: `ralplan` consensus, short mode
- Status: `consensus-approved for execution handoff`

## Requirements Summary

The app already has a viable head-agent product shell, but the orchestration runtime is still synthetic. The shared contract already models head and role agents plus event-projected plan/handoff/output state in [types.ts](/Users/yangping/Studio/side-project/multi-agent-system/src/shared/contracts/types.ts#L14), [projectRun.ts](/Users/yangping/Studio/side-project/multi-agent-system/src/server/events/projectRun.ts#L69), and [adapters.ts](/Users/yangping/Studio/side-project/multi-agent-system/src/lib/adapters.ts#L120). The gap is that [scenario.ts](/Users/yangping/Studio/side-project/multi-agent-system/src/server/orchestrator/scenario.ts#L100) still hardcodes step decomposition and synthetic worker outputs.

This milestone should replace only the head-planning seam. When the user submits a task with selected canvas agents, the head node should use local Codex via `tmux` through a dedicated local bridge to generate:

- a structured plan
- a workflow pipeline
- a refined per-agent task packet for each selected canvas agent
- a single head-only user summary

Role agents remain proof-of-concept nodes that display assigned task packets only. No real worker-agent execution is introduced in this milestone.

## RALPLAN-DR Summary

### Principles

1. Keep the head node as the only user-facing orchestrator.
2. Replace synthetic planning before replacing worker execution.
3. Reuse the current event-projection and session/canvas model wherever it already fits.
4. Make task packets explicit product artifacts, not hidden prompt internals.
5. Preserve an upgrade path to real worker execution without forcing it into this milestone.

### Decision Drivers

1. The orchestrator gap is head-plan generation, not session selection or graph display, as shown by [scenario.ts](/Users/yangping/Studio/side-project/multi-agent-system/src/server/orchestrator/scenario.ts#L100) versus [App.tsx](/Users/yangping/Studio/side-project/multi-agent-system/src/app/App.tsx#L196).
2. Discovery must be limited to currently selected canvas agents, which already exist in [use-canvas-agents.ts](/Users/yangping/Studio/side-project/multi-agent-system/src/hooks/use-canvas-agents.ts#L13) and [use-session-store.ts](/Users/yangping/Studio/side-project/multi-agent-system/src/hooks/use-session-store.ts#L180).
3. Only the head node may use local Codex via `tmux` now; role agents must remain non-executing PoC task viewers.

### Viable Options

#### Option A: Keep the replay runtime and only enrich synthetic plan data

- Pros: smallest code churn; preserves the current queue/drain flow in [use-live-drain.ts](/Users/yangping/Studio/side-project/multi-agent-system/src/hooks/use-live-drain.ts#L88).
- Cons: does not satisfy the user’s proof signal that the head node now uses local Codex via `tmux`.

#### Option B: Replace only head-plan generation with a live head-node planning harness, while keeping role execution synthetic/PoC

- Pros: matches the clarified milestone exactly; keeps worker execution out of scope; reuses the current event log and projection model.
- Cons: requires a local host bridge, richer contracts, and an explicit failure path.

#### Option C: Make both head and role agents live via local Codex `tmux` now

- Pros: closest to the long-term vision.
- Cons: violates the clarified scope and forces runtime supervision, retry, and budgeting concerns too early.

### Recommendation

Choose Option B.

## Architect Review

- Steelman antithesis: the strongest case against Option B is that the repo is still a browser-first React/Vite app with localStorage-backed state and no real process host, so “head node uses `tmux`” is not a small refactor unless the host boundary is made explicit.
- Tradeoff tension: preserving the existing replay substrate keeps the milestone small, but it also creates temptation to silently fall back to synthetic behavior if live head planning fails.
- Synthesis: introduce an explicit local planner bridge outside the browser runtime, keep internal agent-to-agent edges declarative in this milestone, and make planner failure visible rather than silently synthetic.

## Critic Evaluation

- Verdict: `APPROVE`
- Approval basis:
  - The favored option is principle-consistent after making the host boundary and failure contract explicit.
  - Alternatives are real and fairly bounded.
  - Acceptance criteria and verification are concrete and testable.

## Product And Runtime Model

### User-facing model

- The user submits one task to the head node through the existing conversation/task input in [App.tsx](/Users/yangping/Studio/side-project/multi-agent-system/src/app/App.tsx#L253).
- The head node remains the only user-facing voice.
- Each selected role agent gets a visible task packet and can display it in the graph/drawer UI.
- Internal direct agent-to-agent edges may appear in the workflow, but they are declarative/representational only in this milestone.

### Discovery model

- Discovery uses only the agents currently selected on the canvas for the active session.
- No separate runtime registry or all-known-agents discovery source is introduced.

### Planning model

- The head planner consumes:
  - user task
  - selected role definitions
  - current repo/session context
- The head planner returns:
  - execution plan
  - workflow edges
  - task packets
  - head summary
  - diagnostics

### Host-boundary model

- The browser app must not spawn `tmux` directly.
- This milestone requires a local planner bridge outside the browser runtime.
- App-side code calls that bridge through a mockable adapter boundary under `src/server/orchestrator/` or equivalent.

### Failure model

- No silent synthetic fallback for normal user-triggered runs.
- Planner failure must surface a visible diagnostic and stop before synthetic worker progress is queued.
- Existing synthetic paths may remain only as explicit fixture/demo or test paths.

## Refined Task Packet Contract

Each task packet should include:

- `why`
- `goal`
- `context`
- `constraints`
- `doneWhen`
- `next`
- `inputSource`
- `returnPolicy`

This extends the user’s original `Goal / Context / Constraints / Done when / Next` shape into a reusable execution and UI contract.

## Acceptance Criteria

1. Starting a run with selected canvas agents causes the head node to generate a plan from those selected agents instead of the hardcoded `buildSteps(task, roleIds)` path in [scenario.ts](/Users/yangping/Studio/side-project/multi-agent-system/src/server/orchestrator/scenario.ts#L88).
2. The generated plan contains a workflow pipeline plus one task packet per selected role agent.
3. Only the head node uses local Codex via `tmux`; role-agent execution remains synthetic or display-only.
4. The user-facing conversation remains head-only even if the plan contains internal direct agent-to-agent edges.
5. The run contract can represent default final-only/blocker-only head visibility plus plan-defined intermediate returns.
6. Each role/subagent can display its assigned task packet in the UI.
7. Existing approval-gate behavior continues to work after the planning refactor.
8. Planner failure produces an explicit blocked/failed run state or diagnostic and does not silently replay the old synthetic happy path.
9. Legacy runs and explicit fixture/demo runs that do not use the new head planner still project correctly.

## Implementation Steps

1. Expand shared orchestration contracts in [types.ts](/Users/yangping/Studio/side-project/multi-agent-system/src/shared/contracts/types.ts#L14) to represent task packets, workflow edges, return policy, and richer plan payloads.
2. Refactor [scenario.ts](/Users/yangping/Studio/side-project/multi-agent-system/src/server/orchestrator/scenario.ts#L88) so it consumes an `ExecutionPlan` instead of generating steps from `buildSteps(task, roleIds)`.
3. Add a head-planning adapter/service under `src/server/orchestrator/` that calls a local planner bridge, consumes selected canvas roles, and returns plan + packet + summary output.
4. Define the local host boundary explicitly so the app never tries to spawn `tmux` directly from the browser.
5. Adjust [use-live-drain.ts](/Users/yangping/Studio/side-project/multi-agent-system/src/hooks/use-live-drain.ts#L117) so run start awaits head planning before queuing events, and stops with a visible diagnostic when planning fails.
6. Extend [projectRun.ts](/Users/yangping/Studio/side-project/multi-agent-system/src/server/events/projectRun.ts#L69) and [adapters.ts](/Users/yangping/Studio/side-project/multi-agent-system/src/lib/adapters.ts#L120) to project plan/task-packet metadata into the graph, drawer, and head-facing messages without leaking raw internal peer traffic into chat.
7. Update [agent-node.tsx](/Users/yangping/Studio/side-project/multi-agent-system/src/components/graph/agent-node.tsx#L14) and [agent-drawer.tsx](/Users/yangping/Studio/side-project/multi-agent-system/src/components/graph/agent-drawer.tsx#L24) so each role/subagent can view its assigned task packet.
8. Add regression and new behavior tests in [tests/projectRun.test.ts](/Users/yangping/Studio/side-project/multi-agent-system/tests/projectRun.test.ts#L6) plus new orchestrator/service tests for planner translation, discovery, and failure states.

## Risks And Mitigations

- Risk: `tmux` integration becomes brittle or machine-specific.
  - Mitigation: isolate it behind one local bridge interface with mockable outputs.
- Risk: browser code accidentally owns local-process orchestration.
  - Mitigation: make the host boundary explicit and keep app code dependent on a planner-bridge adapter only.
- Risk: additive payload changes break projection assumptions.
  - Mitigation: preserve event types and extend payloads additively, then lock behavior with regression tests.
- Risk: chat starts showing internal agent traffic and violates the head-only communication rule.
  - Mitigation: keep internal detail in graph/drawer surfaces and keep chat head-centered in [adapters.ts](/Users/yangping/Studio/side-project/multi-agent-system/src/lib/adapters.ts#L120).
- Risk: role agents look “real” before a worker runtime exists.
  - Mitigation: explicitly keep them task-display PoC nodes in this milestone.

## Verification Steps

1. Unit-test plan/task-packet/return-policy contracts.
2. Unit-test planner-output-to-event translation, including explicit planner-failure states.
3. Mock the local planner bridge and verify run start waits for head planning before queuing events.
4. Verify selected canvas roles alone determine discovery and packet generation.
5. Verify task-packet content is visible in the subagent UI.
6. Verify the head summary remains the only user-facing conversation output.
7. Verify planner failure surfaces a visible diagnostic instead of silently using the old synthetic path.
8. Re-run approval-gate and replay-history tests to confirm the planning refactor preserved existing safety behavior.

## ADR

### Decision

Adopt a head-generated planning seam: the head node uses local Codex via `tmux` through a dedicated local bridge to generate execution plans and task packets, while the rest of the app remains event-projected and role-agent execution stays synthetic/PoC.

### Drivers

- Synthetic head planning is the main product gap.
- Live head-node planning is required now.
- Real role-agent execution is explicitly out of scope.
- The existing event-projection model already has value and should be reused.

### Alternatives Considered

- Keep everything synthetic and only reshape data: rejected because it fails the live head-planning requirement.
- Make all agents live via `tmux` now: rejected because it exceeds scope and reopens runtime concerns the user deferred.

### Why Chosen

This is the narrowest architecture that proves the product direction without overcommitting to a full worker runtime.

### Consequences

- Shared contracts become richer and more explicit.
- `buildRunScenario()` stops being the source of truth for decomposition.
- The app gains a local planner-bridge integration point.
- UI surfaces must expose task packets more explicitly.
- Planner failure becomes a real product state that must be handled.

### Follow-Ups

- Add real role-agent execution in a later milestone.
- Revisit direct agent-to-agent execution semantics once workers are real.
- Revisit retry, budgeting, and richer observability after the planning seam stabilizes.

## Available-Agent-Types Roster

- `planner`
- `architect`
- `critic`
- `executor`
- `debugger`
- `test-engineer`
- `verifier`
- `researcher`

## Follow-Up Staffing Guidance

### Recommended `ralph` lane

- Lead: `executor` with `high` reasoning
- Validation support: `test-engineer` with `medium` reasoning
- Close-out: `verifier` with `high` reasoning

### Recommended `$team` lane

- Lane 1: `executor` with `high` reasoning for contracts + orchestrator seam
- Lane 2: `executor` with `medium` reasoning for adapters + node/drawer packet UI
- Lane 3: `test-engineer` with `medium` reasoning for regression + planner tests
- Optional stabilizer: `debugger` if the local planner bridge is flaky

## Launch Hints

### `ralph`

```text
$ralph /Users/yangping/Studio/side-project/multi-agent-system/.omx/plans/prd-real-agent-usage-division-of-work.md
```

### `$team`

```text
$team /Users/yangping/Studio/side-project/multi-agent-system/.omx/plans/prd-real-agent-usage-division-of-work.md
```

Suggested team split:

- worker 1: contracts + orchestrator/head planner
- worker 2: projection/adapters + packet UI
- worker 3: tests and regression coverage

## Team Verification Path

Before team shutdown:

- contracts prove one plan + one packet per selected role
- UI proves subagent packet visibility
- tests prove approval continuity and head-only chat

After handoff, Ralph or the leader verifier should confirm:

- the local bridge seam is exercised or cleanly mocked
- no live role-agent execution leaked into this milestone
- legacy replay/approval behavior still passes
