# Test Spec: Real Agent Usage And Division Of Work

## Scope

Validate the behaviors defined in [prd-real-agent-usage-division-of-work.md](/Users/yangping/Studio/side-project/multi-agent-system/.omx/plans/prd-real-agent-usage-division-of-work.md) and grounded in [deep-interview-real-agent-usage-division-of-work.md](/Users/yangping/Studio/side-project/multi-agent-system/.omx/specs/deep-interview-real-agent-usage-division-of-work.md).

## Core Test Matrix

### Unit

- Shared contract shape for `ExecutionPlan`, `TaskPacket`, `WorkflowEdge`, and `ReturnPolicy`.
- Plan translation from head-planner output into run events.
- Discovery restricted to canvas-selected roles only.
- Planner-failure state generation and diagnostic payloads.
- Head-only user-summary/message shaping.
- Default final-only/blocker-only visibility plus plan-defined intermediate returns.

### Integration

- Start one run with selected roles and verify the head planner is called before queueing replay/display events.
- Verify one task packet is generated for each selected role.
- Verify the generated plan replaces the old hardcoded `buildSteps()` path.
- Verify planner failure stops the run with a visible diagnostic instead of silently replaying synthetic progress.
- Verify existing approval-gate behavior still works after plan generation moves to the head seam.
- Verify internal direct agent-to-agent edges appear in workflow data without polluting user-facing chat.

### End-to-End

- User selects agents, submits one task, and sees a head-generated plan/pipeline.
- User opens a subagent node/drawer and sees the assigned task packet.
- User sees only head-authored conversation output.
- User sees explicit failure/blocked state if the head planner bridge fails.

### Observability

- Detect any run-start path where queue processing begins before head planning completes.
- Detect any case where agent discovery includes unselected roles.
- Detect any case where planner failure silently uses the old synthetic path.
- Detect any case where internal peer traffic is rendered as direct user-facing chat.

## Acceptance Mapping

1. Head plan comes from live head planning, not hardcoded templates.
   Tests: unit, integration, e2e
2. One task packet per selected role.
   Tests: unit, integration, e2e
3. Only the head node uses local Codex via `tmux`.
   Tests: integration, observability
4. Head-only user conversation is preserved.
   Tests: unit, integration, e2e
5. Return-policy and intermediate-return rules project correctly.
   Tests: unit, integration
6. Task packets are visible in the UI.
   Tests: integration, e2e
7. Planner failure is explicit and not silently synthetic.
   Tests: unit, integration, e2e, observability
8. Existing approval behavior still passes.
   Tests: unit, integration
9. Legacy or fixture/demo runs still project correctly.
   Tests: integration

## Suggested Verification Order

1. Unit-test contract and translation logic.
2. Unit-test planner failure and visibility rules.
3. Integration-test run start sequencing and discovery-from-selected-roles.
4. Integration-test packet projection into node/drawer/chat surfaces.
5. Integration-test approval continuity after the refactor.
6. End-to-end test success and failure paths.
7. Run observability assertions for queue-before-plan, unselected discovery, silent fallback, and chat leakage.

## Evidence Required For Completion

- Passing automated tests for contract, translation, and planner-failure behavior.
- Proof that head planning happens before queue processing starts.
- Proof that only selected canvas roles are discovered.
- Proof that each subagent can view its assigned task packet.
- Proof that chat stays head-only.
- Proof that planner failure becomes an explicit diagnostic/failed state.
- Proof that approval-gate and replay-history regressions still pass.
