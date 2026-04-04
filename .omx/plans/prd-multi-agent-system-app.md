# PRD: Multi-Agent System App V1

## Metadata

- Source spec: [deep-interview-multi-agent-system-app.md](/Users/yangping/Studio/side-project/multi-agent-system/.omx/specs/deep-interview-multi-agent-system-app.md)
- Source context: [multi-agent-system-app-20260402T125002Z.md](/Users/yangping/Studio/side-project/multi-agent-system/.omx/context/multi-agent-system-app-20260402T125002Z.md)
- Planning mode: `ralplan` consensus, short mode
- Status: `consensus-approved for execution handoff`

## Requirements Summary

The product must let a user submit one task, assign pre-defined role agents, and watch a single visible head agent coordinate the work while the UI exposes live state and historical handoffs. This comes directly from the clarified scope and outcome in the source spec at [deep-interview-multi-agent-system-app.md:30](/Users/yangping/Studio/side-project/multi-agent-system/.omx/specs/deep-interview-multi-agent-system-app.md#L30), [deep-interview-multi-agent-system-app.md:34](/Users/yangping/Studio/side-project/multi-agent-system/.omx/specs/deep-interview-multi-agent-system-app.md#L34), and [deep-interview-multi-agent-system-app.md:77](/Users/yangping/Studio/side-project/multi-agent-system/.omx/specs/deep-interview-multi-agent-system-app.md#L77).

The product value is transparency and control, not maximal autonomy. Version 1 must keep exactly one visible head agent, must expose task breakdown, active agent/task/status, and handoff trace, and must require explicit approval before any external or user-facing side effect. Those are binding constraints from [deep-interview-multi-agent-system-app.md:69](/Users/yangping/Studio/side-project/multi-agent-system/.omx/specs/deep-interview-multi-agent-system-app.md#L69), [deep-interview-multi-agent-system-app.md:79](/Users/yangping/Studio/side-project/multi-agent-system/.omx/specs/deep-interview-multi-agent-system-app.md#L79), and [deep-interview-multi-agent-system-app.md:83](/Users/yangping/Studio/side-project/multi-agent-system/.omx/specs/deep-interview-multi-agent-system-app.md#L83).

## RALPLAN-DR Summary

### Principles

1. Make the head agent the visible source of truth for planning and control.
2. Persist every meaningful orchestration event before deriving any UI view from it.
3. Treat approval boundaries as product behavior, not backend policy glue.
4. Keep version 1 narrow: predefined roles, no agent self-spawn, no auto-generated skills.
5. Design runtime adapters so agent providers can vary later without changing the event model.

### Decision Drivers

1. User trust depends on visible workflow evidence before approval, especially step breakdown, active agent/task/status, and handoff trace. Source: [deep-interview-multi-agent-system-app.md:79](/Users/yangping/Studio/side-project/multi-agent-system/.omx/specs/deep-interview-multi-agent-system-app.md#L79) to [deep-interview-multi-agent-system-app.md:82](/Users/yangping/Studio/side-project/multi-agent-system/.omx/specs/deep-interview-multi-agent-system-app.md#L82).
2. Version 1 needs exactly one visible coordinating head agent for predictability and auditability. Source: [deep-interview-multi-agent-system-app.md:36](/Users/yangping/Studio/side-project/multi-agent-system/.omx/specs/deep-interview-multi-agent-system-app.md#L36), [deep-interview-multi-agent-system-app.md:69](/Users/yangping/Studio/side-project/multi-agent-system/.omx/specs/deep-interview-multi-agent-system-app.md#L69), [deep-interview-multi-agent-system-app.md:96](/Users/yangping/Studio/side-project/multi-agent-system/.omx/specs/deep-interview-multi-agent-system-app.md#L96).
3. Safety requires automatic internal coordination but explicit approval for any external or user-facing side effect. Source: [deep-interview-multi-agent-system-app.md:52](/Users/yangping/Studio/side-project/multi-agent-system/.omx/specs/deep-interview-multi-agent-system-app.md#L52) to [deep-interview-multi-agent-system-app.md:65](/Users/yangping/Studio/side-project/multi-agent-system/.omx/specs/deep-interview-multi-agent-system-app.md#L65).

### Viable Options

#### Option A: Event-sourced web app with a single orchestrator service

- Pros: Best fit for live and historical traceability, keeps the head-agent model explicit, minimizes V1 moving parts, and supports approval gates naturally.
- Cons: Requires deliberate event-schema design early and may need later extraction if concurrency or provider diversity grows.

#### Option B: Workflow-engine-first distributed system with message bus and worker services

- Pros: Strong long-term scaling and richer orchestration semantics.
- Cons: Too much operational weight for a greenfield V1, hides product learning behind infrastructure, and makes "easy to understand" harder to achieve quickly.

### Recommendation

Choose Option A: a web-first TypeScript app with one orchestrator service, append-only run events, projection-based UI views, and provider adapters behind the head-agent runtime boundary.

## Architect Review

- Steelman antithesis: A workflow-engine-first design could avoid later re-architecture by formalizing retries, fan-out, and worker durability from day one.
- Tradeoff tension: V1 needs auditability and speed of delivery now, but a thin monolith can drift into accidental coupling if runtime, persistence, and UI projections are not bounded.
- Synthesis: Keep V1 as a single deployable app, but enforce module boundaries around `orchestrator`, `event-log`, `projection`, `approval-gate`, and `agent-adapters` so the runtime can split later without changing the user-facing contract.
- Missing boundary that must be explicit before execution: define one run state machine, one single-writer orchestration rule, and one normalized agent-adapter contract so replay and approval behavior cannot diverge across providers.

## Critic Evaluation

- Verdict: `APPROVE`
- Required improvements applied:
  - Made the approval boundary explicit in both runtime and UI requirements.
  - Added a dedicated state-machine and event-schema step before provider integration.
  - Added normalized adapter-boundary rules to prevent provider leakage into orchestration state.
  - Added verification coverage for replay/history correctness, blocked actions, and failure-path visibility.
  - Added execution staffing guidance that respects current OMX team constraints.

## Proposed Product Architecture

### Product Surface

- `Task Console`: single top-level input/output surface, similar to one Codex session, where the user submits a task, configures roles, and approves outcomes.
- `Head Agent Panel`: pinned source-of-truth area showing plan, current coordination decision, and approval checkpoints.
- `Live Flow Graph`: current task graph showing active agent, task status, and current handoff edge.
- `Trace Timeline`: append-only event/history view for debugging and auditing.

### Runtime Model

- `HeadAgentRuntime`: accepts the user task, decomposes it into steps, routes work to existing role agents, and records all transitions.
- `RoleAgentRuntime`: executes scoped assignments, emits structured outputs, and may delegate only to other existing agents.
- `ApprovalGate`: blocks any external side effect or user-facing commit until explicit user confirmation.
- `EventLog`: append-only run event store; every UI view is derived from this source.
- `ProjectionLayer`: builds live and historical views from the event log for the graph, timeline, and head-agent panel.

### Run-State And Event Invariants

- A run has one authoritative lifecycle: `draft -> planning -> dispatching -> waiting_on_agent -> awaiting_approval -> completed | failed | cancelled`.
- The head agent is the only writer allowed to change run phase; role agents may emit proposed outputs and handoff results, but not mutate global run state directly.
- Every persisted event must include: `runId`, monotonic `sequence`, `timestamp`, `actorType`, `actorId`, `eventType`, and normalized payload.
- Projections must be replayable from events alone; no UI-only state may be required to reconstruct graph, timeline, active agent, or approval status.
- Approval decisions must be persisted as first-class events, not implicit flags, so blocked actions and user approvals remain auditable.

### Agent Adapter Boundary

- Adapters normalize provider-specific streaming or completion outputs into a shared event contract.
- Adapters may not bypass the approval gate or persist custom event shapes directly.
- Adapters return structured outcomes only: `partial`, `final`, `handoff_request`, `blocked_action_request`, or `error`.
- Provider retries and transient failures must surface as events so the timeline and replay path remain truthful.

### Recommended V1 Technical Direction

- App shape: web-first TypeScript application
- UI: React-based single-page shell with graph and timeline panels
- Server: Node/TypeScript orchestration layer with streaming updates
- Persistence: relational store with append-only `run_events` table plus small projection tables or materialized views
- Transport: SSE or WebSocket for live execution updates
- Agent integration: provider adapter interface so Codex/Claude-style runtimes can be swapped without changing orchestration events

### V1 Observability Target

- Projection lag target: p95 under 1000 ms from event persistence to UI projection update in the reference local/staging environment.
- Explicit non-goal: version 1 does not optimize for high-scale multi-tenant fan-out; the goal is trustworthy single-run visibility, not distributed throughput leadership.

## Planned Repository Shape

These are target paths for execution; they do not exist yet.

- `src/app/`
  Purpose: application shell, routes, layout, task console
- `src/features/agents/`
  Purpose: role assignment UI, head-agent panel, agent state cards
- `src/features/graph/`
  Purpose: live graph and historical flow visualization
- `src/features/trace/`
  Purpose: trace timeline and approval review surfaces
- `src/server/orchestrator/`
  Purpose: head-agent runtime, role dispatch, approval gate
- `src/server/events/`
  Purpose: event schema, event store, replay logic, projections
- `src/server/adapters/`
  Purpose: external agent provider abstractions
- `src/shared/contracts/`
  Purpose: shared event, task, approval, and agent-role types

## Acceptance Criteria

1. The app provides one top-level task console where a user submits a task and assigns pre-defined role agents. Source: [deep-interview-multi-agent-system-app.md:34](/Users/yangping/Studio/side-project/multi-agent-system/.omx/specs/deep-interview-multi-agent-system-app.md#L34) to [deep-interview-multi-agent-system-app.md:35](/Users/yangping/Studio/side-project/multi-agent-system/.omx/specs/deep-interview-multi-agent-system-app.md#L35).
2. The app always shows exactly one visible head agent that owns planning and coordination for the run. Source: [deep-interview-multi-agent-system-app.md:36](/Users/yangping/Studio/side-project/multi-agent-system/.omx/specs/deep-interview-multi-agent-system-app.md#L36), [deep-interview-multi-agent-system-app.md:69](/Users/yangping/Studio/side-project/multi-agent-system/.omx/specs/deep-interview-multi-agent-system-app.md#L69).
3. The UI shows a step-by-step task breakdown, the active agent with exact task and status, and a visible handoff trace. Source: [deep-interview-multi-agent-system-app.md:39](/Users/yangping/Studio/side-project/multi-agent-system/.omx/specs/deep-interview-multi-agent-system-app.md#L39) to [deep-interview-multi-agent-system-app.md:42](/Users/yangping/Studio/side-project/multi-agent-system/.omx/specs/deep-interview-multi-agent-system-app.md#L42).
4. The app preserves a historical dataflow/debug-log-style view for each run and can replay the same head-agent state transitions and handoff sequence from persisted events. Source: [deep-interview-multi-agent-system-app.md:42](/Users/yangping/Studio/side-project/multi-agent-system/.omx/specs/deep-interview-multi-agent-system-app.md#L42), [deep-interview-multi-agent-system-app.md:116](/Users/yangping/Studio/side-project/multi-agent-system/.omx/specs/deep-interview-multi-agent-system-app.md#L116).
5. The system may coordinate internal work automatically, but any external or user-facing side effect must require approval. Source: [deep-interview-multi-agent-system-app.md:52](/Users/yangping/Studio/side-project/multi-agent-system/.omx/specs/deep-interview-multi-agent-system-app.md#L52) to [deep-interview-multi-agent-system-app.md:65](/Users/yangping/Studio/side-project/multi-agent-system/.omx/specs/deep-interview-multi-agent-system-app.md#L65).
6. Version 1 forbids agent-created agents and auto-generated complete role/skill definitions. Source: [deep-interview-multi-agent-system-app.md:47](/Users/yangping/Studio/side-project/multi-agent-system/.omx/specs/deep-interview-multi-agent-system-app.md#L47) to [deep-interview-multi-agent-system-app.md:48](/Users/yangping/Studio/side-project/multi-agent-system/.omx/specs/deep-interview-multi-agent-system-app.md#L48).

## Implementation Steps

1. Bootstrap the web app shell and shared TypeScript contracts.
   Planned touchpoints: `package.json`, `tsconfig.json`, `src/app/`, `src/shared/contracts/`
2. Define the run state machine, orchestration event schema, append-only event store, and replay/projection interfaces before building UI views.
   Planned touchpoints: `src/server/events/`, `src/shared/contracts/`
3. Implement the head-agent runtime, role-agent task dispatch, normalized adapter boundary, and approval-gate enforcement on top of the event log.
   Planned touchpoints: `src/server/orchestrator/`, `src/server/adapters/`
4. Build the task console, head-agent panel, live flow graph, and trace timeline against projection APIs.
   Planned touchpoints: `src/app/`, `src/features/agents/`, `src/features/graph/`, `src/features/trace/`
5. Add persistence, replay tests, failure-path coverage, and user approval flows; then harden with end-to-end verification focused on trust evidence.
   Planned touchpoints: `src/server/events/`, `src/server/orchestrator/`, `tests/`

## Risks And Mitigations

- Risk: The event model is underspecified, causing UI and runtime drift.
  Mitigation: Freeze the event taxonomy early and require all live/history views to derive from persisted events.

- Risk: The head agent becomes a vague label rather than a real source of truth.
  Mitigation: Make planning decisions and approval checkpoints first-class head-agent events and surface them explicitly in the UI.

- Risk: Provider-specific adapters mutate core orchestration behavior or replay semantics.
  Mitigation: Restrict adapters to a normalized outcome contract and keep the head agent as the single writer for run-state transitions.

- Risk: Provider-specific behavior leaks into core orchestration.
  Mitigation: Put provider logic behind adapters and persist normalized events/contracts only.

- Risk: The graph becomes decorative instead of auditable.
  Mitigation: Treat graph edges and statuses as projections of the same event log used by the trace timeline.

- Risk: Approval-blocked actions become invisible or unreplayable.
  Mitigation: Persist blocked-action proposals and approval decisions as first-class events and verify them in replay tests.

- Risk: Team execution later over-splits work and causes merge churn.
  Mitigation: Keep write scopes separate by module boundary and assign one verification-focused lane.

## Verification Steps

1. Unit-test the run state machine, event schemas, replay reducers, approval rules, adapter normalization, and head-agent decision transitions.
2. Integration-test a full run with predefined roles, internal delegation, approval gating, blocked-action persistence, and failure/retry event handling.
3. End-to-end test the UI evidence path: task console, visible head agent, live active-agent status, handoff trace, and history replay.
4. Add observability assertions for dropped events, p95 projection lag under 1000 ms in the reference environment, approval-blocked actions, and replay mismatches.

## ADR

### Decision

Build version 1 as a web-first TypeScript application with a single orchestrator service and append-only event log that powers both live execution views and historical replay.

### Drivers

- Visible trust evidence is the central product value.
- Exactly one head agent must be present and understandable.
- Approval gates must be explicit and enforceable.
- The repository is greenfield, so V1 should optimize for shipping a learnable product rather than distributed-system completeness.

### Alternatives Considered

- Event-sourced web app with single orchestrator service
- Workflow-engine-first distributed system with message bus and worker services

### Why Chosen

The event-sourced web app meets the trust, auditability, and usability requirements with the least operational overhead while preserving a clean future extraction path through module boundaries and provider adapters.

### Consequences

- The initial implementation must invest early in event design and replay logic.
- V1 scaling limits are acceptable, but runtime boundaries must stay clean to support later extraction.
- The UI and backend must share contracts tightly around events and approval states.

### Follow-ups

- Decide the exact frontend framework/runtime bootstrap in execution.
- Decide the initial persistence choice for local development versus hosted environments.
- Define the minimal provider adapter contract for the first supported agent runtimes.
- Write the canonical run-state and event-schema ADR before any provider-specific integration work starts.

## Available-Agent-Types Roster

Relevant available types in this workspace:

- `planner`
- `architect`
- `executor`
- `designer`
- `test-engineer`
- `verifier`
- `debugger`
- `critic`
- `code-reviewer`
- `security-reviewer`
- `writer`
- `dependency-expert`

## Follow-Up Staffing Guidance

### Ralph Path

- Owner: `executor` with `high` reasoning
- Side consultations:
  - `designer` with `high` reasoning for task console, graph, and trace-panel interaction design
  - `test-engineer` with `medium` reasoning for acceptance-test scaffolding
  - `verifier` with `high` reasoning for end-state evidence review
- Why this lane works: the project is greenfield and tightly coupled enough that a single owner can keep architecture, contracts, and UI/runtime alignment coherent.

### Team Path

Current OMX team launches one shared worker role prompt, so use `executor` workers with distinct write scopes rather than mixing role prompts at startup.

- Recommended headcount: `3`
- Worker role: `executor`
- Lane 1: app shell + task console + head-agent panel
  Suggested reasoning: `high`
- Lane 2: orchestrator + event log + approval gate
  Suggested reasoning: `high`
- Lane 3: graph/timeline wiring + automated verification harness
  Suggested reasoning: `medium`
- Leader follow-up: `verifier` pass after team completion to confirm acceptance criteria and collect evidence

## Launch Hints

### Ralph

- `$ralph /Users/yangping/Studio/side-project/multi-agent-system/.omx/plans/prd-multi-agent-system-app.md`

### Team

- `$team 3:executor "Implement /Users/yangping/Studio/side-project/multi-agent-system/.omx/plans/prd-multi-agent-system-app.md with three lanes: UI shell/head-agent panel, orchestrator/event-log/approval gate, and graph/timeline plus verification harness"`
- `omx team 3:executor "Implement /Users/yangping/Studio/side-project/multi-agent-system/.omx/plans/prd-multi-agent-system-app.md with three lanes: UI shell/head-agent panel, orchestrator/event-log/approval gate, and graph/timeline plus verification harness"`

## Team Verification Path

Before team shutdown, the team should prove:

1. One end-to-end run can be created with predefined role agents.
2. The head agent remains visible and authoritative throughout the run.
3. Task breakdown, active agent/task/status, and handoff trace are visible during execution.
4. Historical replay reconstructs the same head-agent state transitions and handoff sequence from persisted events.
5. Approval-required actions are blocked until explicit confirmation and emit an audit event before any side effect is attempted.

After team completion, a Ralph or verifier-led follow-up should confirm:

1. Acceptance criteria map cleanly to observed behavior.
2. Tests cover replay, approval boundaries, and UI evidence requirements.
3. No accidental support was introduced for agent self-spawn or auto-generated full role skills.

## Changelog From Review Loop

- Added an explicit run-state model and single-writer rule so approval and replay semantics are unambiguous.
- Added a normalized agent-adapter contract to keep provider behavior from leaking into orchestration state.
- Expanded risks and verification to cover blocked-action persistence, failure/retry events, and replay mismatches.
- Strengthened the event-schema-first implementation step and execution staffing guidance.
- Added a concrete V1 projection-lag target and tightened replay plus blocked-action audit assertions.
