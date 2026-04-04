# Test Spec: Multi-Agent System App V1

## Scope

Validate the version 1 behaviors defined in [prd-multi-agent-system-app.md](/Users/yangping/Studio/side-project/multi-agent-system/.omx/plans/prd-multi-agent-system-app.md) and grounded in [deep-interview-multi-agent-system-app.md](/Users/yangping/Studio/side-project/multi-agent-system/.omx/specs/deep-interview-multi-agent-system-app.md).

## Core Test Matrix

### Unit

- Event contract validation for run, agent, handoff, approval, and replay events
- Run-state machine transition validation, including illegal transition rejection
- Reducer/projection tests for active-agent state, task breakdown state, graph edges, and timeline ordering
- Adapter normalization tests for provider outputs mapping into the shared event contract
- Approval-gate rules for automatic internal actions versus blocked external/user-facing side effects
- Head-agent coordination rules ensuring exactly one visible head agent per run

### Integration

- Create a run, assign predefined role agents, decompose the task, and coordinate delegated work through the head agent
- Persist every orchestration event and rebuild projections from storage
- Verify that role agents can delegate to existing agents but cannot create new agents
- Verify that full role/skill auto-generation is not exposed in version 1 flows
- Verify approval gating interrupts any blocked action path before side effects occur
- Verify a blocked external action emits an audit event before any side effect is attempted
- Verify blocked-action requests and user approval decisions survive replay without semantic drift
- Verify provider failure/retry events remain visible in timeline and do not corrupt active-agent state

### End-to-End

- User submits a task from the top-level console and assigns roles successfully
- UI shows the head agent, explicit task breakdown, active agent with exact task/status, and handoff trace during execution
- UI shows a historical graph/timeline view after the run completes
- User approval is required before any external or user-facing side effect is executed

### Observability

- No event drop between runtime emission and projection update
- Projection lag stays at p95 under 1000 ms from event persistence to UI projection update in the reference local/staging environment
- Approval-blocked actions emit visible audit events
- Replay mismatches are surfaced as detectable errors
- Illegal state transitions and adapter-normalization failures emit diagnosable errors

## Acceptance Mapping

1. Single top-level task console plus predefined role assignment
   Tests: integration, e2e
2. Exactly one visible head agent
   Tests: unit, integration, e2e
3. Visible task breakdown, active agent/task/status, and handoff trace
   Tests: unit, integration, e2e
4. Historical replay/debug-log-style view
   Tests: unit, integration, observability
5. Explicit approval for side effects
   Tests: unit, integration, e2e
6. No agent-created agents and no auto-generated complete role skills
   Tests: integration, e2e

## Suggested Verification Order

1. Unit tests for state machine, event contracts, adapter normalization, and approval rules
2. Integration tests for orchestration, persistence, replay, blocked actions, and provider failure paths
3. E2E happy-path run with visible trust evidence
4. Observability and failure-path checks

## Evidence Required For Completion

- Passing automated tests for unit and integration layers
- At least one captured end-to-end run proving the required UI evidence
- Proof that replay reproduces the same head-agent state transitions and handoff sequence
- Proof that blocked side effects require approval and are audited
- Proof that illegal state transitions are rejected and surfaced diagnostically
