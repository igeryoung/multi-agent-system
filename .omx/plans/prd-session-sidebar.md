# PRD: Session Sidebar V1

## Metadata

- Source spec: [deep-interview-session-sidebar.md](/Users/yangping/Studio/side-project/multi-agent-system/.omx/specs/deep-interview-session-sidebar.md)
- Source transcript: [session-sidebar-20260404T013359Z.md](/Users/yangping/Studio/side-project/multi-agent-system/.omx/interviews/session-sidebar-20260404T013359Z.md)
- Source context: [session-sidebar-20260404T013359Z.md](/Users/yangping/Studio/side-project/multi-agent-system/.omx/context/session-sidebar-20260404T013359Z.md)
- Consensus draft: [session-sidebar-ralplan-dr-short-20260404.md](/Users/yangping/Studio/side-project/multi-agent-system/.omx/plans/session-sidebar-ralplan-dr-short-20260404.md)
- Planning mode: `ralplan` consensus, short mode
- Status: `consensus-approved for execution handoff`

## Requirements Summary

The app must add a Codex-like sidebar where each session is an isolated task environment, not just a historical run row. Version 1 must support create, switch, inline rename, and delete with confirmation, while preserving independent conversation/history and agent state per session. This is grounded in the clarified spec at [deep-interview-session-sidebar.md](/Users/yangping/Studio/side-project/multi-agent-system/.omx/specs/deep-interview-session-sidebar.md).

The current brownfield gap is structural: the repo already persists multiple runs in [storage.ts](/Users/yangping/Studio/side-project/multi-agent-system/src/server/events/storage.ts), and [use-run-store.ts](/Users/yangping/Studio/side-project/multi-agent-system/src/hooks/use-run-store.ts) already derives a run catalog, but the UI still behaves like one active run view and the draft task/agent state is not session-owned. The feature therefore requires a first-class session model around existing run history, not a thin sidebar over current run state.

## RALPLAN-DR Summary

### Principles

1. Preserve true session isolation, not just historical run browsing.
2. Reuse the existing run event log and projection pipeline where it already fits.
3. Keep V1 narrow: sidebar session management only, no workspace taxonomy.
4. Prefer additive brownfield seams over broad rewrites of live-run mechanics.
5. Make destructive actions explicit and precisely scoped in UX; do not imply undo behavior that V1 does not provide.

### Decision Drivers

1. New blank sessions are a hard requirement and cannot be modeled cleanly by runs alone.
2. Session switching must restore both persisted run history and pre-run draft state.
3. [use-live-drain.ts](/Users/yangping/Studio/side-project/multi-agent-system/src/hooks/use-live-drain.ts) is single-queue today, so V1 must keep one live run globally.
4. Approval and delete guards must target the true live session even when the user is browsing another session.
5. Existing users may already have legacy `signal-atlas:runs` storage without session records, so bootstrap behavior must be deterministic.

### Viable Options

#### Option A: Treat existing runs as sessions

- Pros: smallest apparent persisted-model change; reuses current run projection concepts.
- Cons: cannot represent brand-new blank sessions, cannot own per-session draft state, and makes rename/delete semantics awkward because the primary entity is still a run.

#### Option B: Add a first-class session envelope around run history plus per-session draft state

- Pros: directly supports blank sessions, inline rename, confirmed delete, deterministic bootstrap, and an explicit split between persisted UI selection and ephemeral live-session ownership.
- Cons: requires a second persisted model and careful sequencing between run creation, run attachment, and drain start.

#### Option C: Synthetic placeholder runs or metadata-only overlay

- Pros: avoids naming a full session model immediately and can reuse more of the current run-centric path in the short term.
- Cons: pollutes run history or creates an implicit session abstraction with muddled delete/restore/live-ownership semantics.

### Recommendation

Choose Option B. It is the only option that cleanly satisfies blank-session isolation, session-owned draft state, single-run-per-session semantics, and live-session ownership without rewriting the current run event substrate.

## Architect Review

- Steelman antithesis: the strongest counterargument remains brownfield surface area, because this introduces a second persisted model and intentionally retains hidden run data after session delete.
- Tradeoff tension: the app wants Codex-like session semantics, but the current runtime is single-run routed and uses local/runtime state for live ownership.
- Synthesis: keep the run event log intact, but make sessions the top-level routing model with a persisted `activeSessionId` and a boot-rehydratable ephemeral `liveSessionId`.
- Final architectural result: approvable once live-session reload behavior, run-linking sequencing, and bootstrap behavior were explicit. Those are now fixed in the approved draft.

## Critic Evaluation

- Verdict: `APPROVE`
- Approval basis:
  - Option B is principle-consistent and fairly compared.
  - Risks are paired with concrete mitigations.
  - Acceptance criteria are testable.
  - Verification steps are specific enough for implementation and QA.
- Non-blocking executor note:
  - The run-linking refactor is specifically about exposing a pre-drain attach point around `handleStartRun`, because `buildRunScenario()` already creates `runId`.

## Proposed Product And State Model

### User-Facing Model

- A session is the primary sidebar object.
- A session is either:
  - Draft-only: no linked run, blank or saved draft task input, saved draft agents, no history.
  - Run-backed: linked to one persisted run whose events/projected state drive conversation/history.
- V1 allows browsing away from a live session, but only one live run may exist globally.
- A session is single-run in V1. Once it has `linkedRunId`, a new task requires a new session.

### Persistence Model

- Existing run events remain in `signal-atlas:runs`.
- Add session persistence under:
  - `signal-atlas:sessions`
  - `signal-atlas:active-session`
- Session shape:
  - `sessionId`
  - `title`
  - `createdAt`
  - `updatedAt`
  - `linkedRunId | null`
  - `draft.taskInput`
  - `draft.selectedRoleIds`
- `activeSessionId` is persisted.
- `liveSessionId` is runtime-only, but rehydrated on boot from linked nonterminal or approval-pending runs.
- If multiple linked sessions project as nonterminal, choose `liveSessionId` by newest run `lastEventAt`, then newest session `updatedAt`, then lexical `sessionId`.

### Ordering Contract

- Sidebar rows are sorted by `updatedAt` descending.
- `updatedAt` must bump on:
  - session create
  - rename
  - draft task edit
  - draft agent edit
  - run attachment
  - linked-run activity when `lastEventAt` advances
- The same ordering is used to choose the next selected session after delete.

### Live-Session Contract

- `activeSessionId` routes the visible workspace.
- `liveSessionId` owns:
  - live-run start blocking
  - live-session delete blocking
  - approval routing
- If `activeSessionId !== liveSessionId` while approval is pending:
  - the sidebar shows a pending-approval indicator on the live session
  - approval/rejection requires reselecting that live session first

### Delete Contract

- Delete always requires confirmation.
- Deleting the currently live session is blocked.
- Deleting the currently selected but non-live session is allowed.
- Delete removes only the session record and its draft state.
- Linked run events are retained in run storage and hidden from the sidebar.
- After delete:
  - select the most recently updated remaining session
  - if none remain, create and select one new blank session immediately

### Brownfield Bootstrap

- If `signal-atlas:runs` exists and `signal-atlas:sessions` does not:
  - backfill one run-backed session per existing run
  - sort by run `lastEventAt`
  - use run projection title as session title
  - initialize blank draft state
  - assign singular `linkedRunId`
  - select the newest backfilled session as `activeSessionId`

## Acceptance Criteria

1. The app shows a visible sidebar listing sessions and a create-session action.
2. Creating a session immediately selects it and renders a blank task input, blank draft canvas, and no inherited conversation history.
3. Switching to a draft-only session restores that session’s saved draft task input and selected draft agents, not another session’s state.
4. Switching to a run-backed session restores that session’s conversation/history and projected agent status from its linked run.
5. Inline rename updates only the targeted session title and persists across reload.
6. `useSessionStore` owns the authoritative ephemeral `liveSessionId` in V1.
7. On boot, V1 rehydrates `liveSessionId` from the linked session whose run projection is nonterminal or approval-pending.
8. Browsing another session during a live run does not change which session owns approval/run resolution.
9. Run start is blocked whenever `liveSessionId !== null`, regardless of which session is selected.
10. Delete is blocked whenever `sessionId === liveSessionId`.
11. Approval resolution targets `liveSessionId`, not the currently selected session.
12. The sidebar shows a pending-approval indicator on the live session while another session is selected.
13. Starting a first run follows the explicit sequence: capture `sessionIdAtStart`, build scenario and obtain `runId`, atomically persist initial events plus `attachRunToSession(sessionIdAtStart, runId)` plus `liveSessionId = sessionIdAtStart`, then hand queued events to the drain.
14. Executors surface `runId` before queue processing begins and do not re-read `activeSessionId` after scenario construction for ownership.
15. Deleting a session removes only that session record and draft state; linked run events remain retained and hidden.
16. After deleting the selected non-live session, the app selects the most recently updated remaining session, or creates/selects one new blank session if none remain.
17. Once a session has `linkedRunId`, V1 does not allow that session to start a second run.
18. `linkedRunId` remains singular in V1.
19. If legacy runs exist without sessions, V1 backfills one session per run with deterministic ordering and titles.
20. Sidebar ordering is by `updatedAt` descending with the defined update contract.
21. If multiple linked sessions are nonterminal on boot, `liveSessionId` uses the deterministic tie-break.
22. V1 does not expose search, folders/projects, archive, duplication, or broader workspace controls.

## Implementation Steps

1. Add first-class session persistence and bootstrap logic in [storage.ts](/Users/yangping/Studio/side-project/multi-agent-system/src/server/events/storage.ts) and shared contracts in [types.ts](/Users/yangping/Studio/side-project/multi-agent-system/src/shared/contracts/types.ts).
2. Add `useSessionStore` with `activeSessionId`, `liveSessionId`, session CRUD, draft updates, run attachment, and boot-time rehydration.
3. Refactor [use-run-store.ts](/Users/yangping/Studio/side-project/multi-agent-system/src/hooks/use-run-store.ts) so session state chooses which run is rendered instead of bootstrapping the app from newest run alone.
4. Make draft state session-scoped by replacing global draft ownership in [use-canvas-agents.ts](/Users/yangping/Studio/side-project/multi-agent-system/src/hooks/use-canvas-agents.ts) and local task state in [task-input.tsx](/Users/yangping/Studio/side-project/multi-agent-system/src/components/conversation/task-input.tsx).
5. Refactor [use-live-drain.ts](/Users/yangping/Studio/side-project/multi-agent-system/src/hooks/use-live-drain.ts) or its call site so `runId` is available before drain start, then enforce `sessionIdAtStart`-based run attachment.
6. Extend [app-shell.tsx](/Users/yangping/Studio/side-project/multi-agent-system/src/components/layout/app-shell.tsx) with a left session sidebar and add a focused session-sidebar component with create/list/rename/delete/indicators.
7. Rewire [App.tsx](/Users/yangping/Studio/side-project/multi-agent-system/src/app/App.tsx) so rendering begins from `activeSessionId`, with explicit guards for live-session delete, run start, and approval routing.
8. Add regression, bootstrap, and lifecycle tests in [app.test.tsx](/Users/yangping/Studio/side-project/multi-agent-system/tests/app.test.tsx) and companion storage/store tests.

## Risks And Mitigations

- Risk: users expect rerun-in-place behavior.
  - Mitigation: make single-run-per-session explicit in UI and tests.
- Risk: session switching accidentally bypasses the single-queue drain.
  - Mitigation: gate all run starts on `liveSessionId !== null`.
- Risk: approval resolves against the wrong session.
  - Mitigation: route approval only through `liveSessionId` and force reselect before resolve.
- Risk: reload loses live-session ownership.
  - Mitigation: rehydrate `liveSessionId` from linked nonterminal runs on boot.
- Risk: draft state leaks across sessions.
  - Mitigation: move task and agent selection behind session-store APIs first.
- Risk: run events drain before session attachment.
  - Mitigation: capture `sessionIdAtStart`, obtain `runId`, and attach before queue handoff.
- Risk: legacy run-only storage upgrades nondeterministically.
  - Mitigation: deterministic one-session-per-run bootstrap and deterministic live-session tie-break.
- Risk: delete fallback or sidebar ordering drift.
  - Mitigation: formalize and test the `updatedAt` contract.

## Verification Steps

1. Verify session create/select/rename/delete persistence across reload.
2. Verify `activeSessionId` persists and `liveSessionId` is rehydrated rather than persisted.
3. Verify sidebar ordering follows the defined `updatedAt` contract.
4. Verify legacy `signal-atlas:runs` bootstraps one session per run with deterministic titles, ordering, and `activeSessionId`.
5. Verify deterministic `liveSessionId` tie-break if multiple linked runs are nonterminal on boot.
6. Verify blank session creation, draft restoration, rename persistence, and delete reselection behavior.
7. Verify switching away from a live session is browse-only and does not permit a second run.
8. Verify pending approval indicators and reselect-before-resolve behavior.
9. Verify `sessionIdAtStart`, run attachment, and `liveSessionId` assignment happen before queue processing begins.
10. Verify existing run lifecycle tests still pass after the routing refactor.

## ADR

### Decision

Adopt a first-class session envelope around existing run history, with per-session draft state, a persisted active session pointer, and an authoritative ephemeral live session pointer.

### Drivers

- Blank session creation is required.
- Session switching must restore both pre-run and run-backed state.
- Existing run persistence/projection is useful but insufficient as the sole session model.
- V1 must preserve one live run globally and one run per session.
- Approval and delete guards must target the true live session even when the user browses another session.
- Brownfield users may already have legacy run storage without session records.

### Alternatives Considered

- Runs as sessions: rejected because it cannot cleanly model blank sessions, session-owned drafts, or live-session ownership.
- Synthetic placeholder runs / metadata overlay: rejected because it muddies delete/restore/live semantics and pollutes the run model.

### Why Chosen

This is the narrowest brownfield design that satisfies the product requirement without rewriting the run engine. It preserves the current event-log substrate while moving routing and draft ownership to the correct abstraction boundary.

### Consequences

- The app gains a second persisted model.
- `App.tsx` becomes session-routed instead of newest-run-routed.
- Draft task input and draft agents become product state instead of transient hook/component state.
- The runtime splits persisted `activeSessionId` from boot-rehydratable `liveSessionId`.
- Sidebar ordering and delete fallback depend on a formal `updatedAt` contract.
- Run start becomes a two-phase flow with `sessionIdAtStart` capture and pre-drain attachment.
- Deleted sessions retain hidden linked run events.
- Brownfield startup needs deterministic one-time backfill behavior.

### Follow-Ups

- Revisit `linkedRunIds[]` / reruns if the live-drain architecture stops being single-queue.
- Revisit retained hidden run recovery/pruning.
- Revisit title derivation precedence.
- Revisit cross-session approval resolution without reselection once the UI supports a richer pending-action surface.

## Available-Agent-Types Roster

- `planner`
- `architect`
- `critic`
- `executor`
- `debugger`
- `test-engineer`
- `verifier`
- `explore`

## Follow-Up Staffing Guidance

### Ralph Path

- Use `ralph` when one owner should sequence the brownfield refactor end-to-end.
- Suggested reasoning:
  - planning/architecture checkpoints: high
  - implementation: high
  - verification: medium to high
- Recommended order:
  1. session storage/types/bootstrap
  2. session store with `activeSessionId`/`liveSessionId`
  3. draft-state refactor
  4. pre-drain run-linking refactor
  5. sidebar UI and approval indicators
  6. app wiring
  7. tests and verification

### Team Path

- Use `team` if parallel lanes are worth the coordination cost.
- Recommended staffing:
  - Lane 1: `executor` for storage/contracts/bootstrap
  - Lane 2: `executor` for run-linking/live-drain/App wiring
  - Lane 3: `executor` or `test-engineer` for sidebar UI, approval indicators, and tests
  - Optional review lane: `architect` or `verifier`
- Team verification path:
  1. merge storage/contracts/bootstrap lane
  2. validate run-linking lane against merged state shape
  3. validate UI lane against live-session contracts
  4. run integrated tests
  5. finish with verifier pass against acceptance criteria and manual workflow

## Applied Improvements

- Demoted run selection to session-driven rendering.
- Added explicit `liveSessionId` contract, approval routing, and delete guards.
- Added boot-time rehydration and deterministic tie-break rules.
- Added explicit `updatedAt` ordering semantics.
- Added deterministic brownfield bootstrap from legacy run-only storage.
- Added the pre-drain `sessionIdAtStart` run-linking contract.
