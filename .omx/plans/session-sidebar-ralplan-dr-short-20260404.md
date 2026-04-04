# Session Sidebar RALPLAN-DR Draft

## 1. Requirements Summary

- Add a Codex-like session sidebar to the existing React/TypeScript app.
- V1 must support create, switch, inline rename, and delete with confirmation.
- New sessions must start completely blank; they must not inherit the current draft task or selected draft agents.
- Each session must restore its own conversation/history and agent status when selected.
- V1 explicitly excludes search, folders/projects, archive, and broader workspace management.
- Live-session contract for V1:
  - `useSessionStore` owns the authoritative ephemeral `liveSessionId`.
  - `liveSessionId` is not persisted across reload.
  - On boot, if any linked session resolves to a nonterminal or approval-pending run projection, V1 rehydrates `liveSessionId` from that linked session instead of treating reload-during-live as unsupported.
  - `activeSessionId` remains the persisted UI router.
  - Start guard checks `liveSessionId !== null`; if true, no session may start a run.
  - Delete guard checks `sessionId === liveSessionId`; if true, delete is blocked.
  - Approval resolution targets `liveSessionId`, not whichever session is currently selected.
  - If the user browses another session while the live session awaits approval, the sidebar must show a pending-approval indicator on the live session, and approval/rejection happens only after reselecting that session.
- Run-linking contract for V1:
  - Scenario creation and drain start are separate phases.
  - The plan must first build the scenario and obtain `runId`.
  - The plan must then atomically persist initial events, call `attachRunToSession(sessionIdAtStart, runId)`, and set `liveSessionId = sessionIdAtStart`.
  - Only after that atomic linking step may queued events be handed to the drain.
  - Executors must refactor `useLiveDrain` or its call site so `runId` is surfaced before queue processing starts.
- Brownfield bootstrap decision for V1:
  - If `signal-atlas:runs` exists and `signal-atlas:sessions` does not, bootstrap by backfilling one run-backed session per existing run.
  - Backfill sessions sorted by run `lastEventAt`.
  - Use the run projection title as the backfilled session title.
  - Set each backfilled session `linkedRunId` to that run, initialize blank draft state, and set the newest backfilled session as `activeSessionId`.
  - Verify this migration path in tests.
- Session ordering contract for V1:
  - Sidebar rows are sorted by `session.updatedAt` descending.
  - `updatedAt` bumps on session create, rename, draft task edit, draft agent edit, run attachment, and whenever the linked run projection's `lastEventAt` advances.
  - The same descending `updatedAt` order is used when choosing the most recently updated remaining session after delete.
- Brownfield facts that constrain the design:
  - `src/hooks/use-run-store.ts` already persists multiple runs, builds a catalog, and exposes `handleSelectRun(runId)`.
  - `src/app/App.tsx` currently renders exactly one active conversation/run view.
  - `src/hooks/use-canvas-agents.ts` holds draft-agent state in one global hook instance, so blank per-session drafts are not representable cleanly today.
  - `src/server/events/storage.ts` persists run events in localStorage under `signal-atlas:runs`.

## 2. RALPLAN-DR Summary

### Principles

1. Preserve true session isolation, not just historical run browsing.
2. Reuse the existing run event log and projection pipeline where it already fits.
3. Keep V1 narrow: sidebar session management only, no workspace taxonomy.
4. Prefer additive brownfield seams over broad rewrites of live-run mechanics.
5. Make destructive actions explicit and precisely scoped in UX; do not imply undo behavior that V1 does not provide.

### Decision Drivers

1. New blank sessions are a hard requirement, which the current run-only model does not satisfy cleanly.
2. Session switching must restore both persisted run history and pre-run draft state.
3. `src/hooks/use-live-drain.ts` is a single-queue live-drain path today, so V1 must preserve one-live-run-global behavior instead of implying parallel session execution.
4. The app already has a working run event store/projection path, so the plan should layer on top of that rather than replace it.
5. Approval flows and live-run routing must remain pinned to the true live session even when `activeSessionId` changes for browsing.
6. Existing users may already have `signal-atlas:runs` without session records, so V1 must define a deterministic brownfield bootstrap path.

### Viable Options

#### Option A: Treat existing runs as sessions

Pros
- Smallest apparent persisted-model change because `signal-atlas:runs` already exists.
- Reuses existing run projection concepts without introducing a second top-level entity.

Cons
- Cannot represent a brand-new blank session before a run exists.
- Cannot isolate pre-run draft state because `use-canvas-agents.ts` is global and runless.
- Rename/delete semantics become awkward because they operate on runs, not first-class sessions.
- Conflicts with the V1 rule that a history-bearing session does not start a second run.
- Future session-level behavior would keep leaking into run-level abstractions.
- Does not provide a clean place to hold authoritative ephemeral `liveSessionId` semantics separate from persisted routing.

#### Option B: Add a first-class session envelope around run history plus per-session draft state

Pros
- Directly supports blank sessions, inline rename, confirmed delete, and per-session restoration.
- Lets the app keep `signal-atlas:runs` as the event-log substrate while adding session metadata and draft state separately.
- Makes the V1 single-run-per-session rule explicit with one `linkedRunId`.
- Creates a clean brownfield seam: session selection determines which run and which draft state are active.
- Cleanly separates persisted UI routing (`activeSessionId`) from ephemeral live-run authority (`liveSessionId`).
- Provides an explicit place to host brownfield backfill from legacy run-only storage.

Cons
- Requires a second persisted model and store coordination.
- Needs modest refactoring in `App.tsx`, `useRunStore`, and draft-state handling to pivot around `activeSessionId`.
- Requires careful sequencing so run creation, initial event persistence, session linking, and live-drain start stay atomic enough to avoid mis-linked live state.

#### Option C: Synthetic placeholder runs or metadata-only overlay

Pros
- Avoids introducing a full first-class session envelope immediately.
- Could reuse more of the existing run-centric selection path in the short term.

Cons
- Placeholder runs pollute run history with non-execution artifacts, or metadata overlays create an implicit session model without naming it.
- Delete and restore semantics become harder to reason about because blank-state data is split across faux runs and side metadata.
- Keeps V1 boundaries around one live run globally and one run per session harder to enforce clearly in code and UX.
- Makes brownfield migration and approval targeting more ambiguous because live-session authority remains smeared across run and selection state.

### Recommendation

Choose Option B. In this repo, runs alone are not sufficient as sessions because V1 requires zero-run blank sessions plus isolated pre-run state. The least risky brownfield move is to keep run events as the durable conversation/history substrate, then introduce a first-class session envelope that owns metadata, persisted UI routing, ephemeral live-session authority, and draft state.

## 3. Architecturally Grounded Proposed Product/State Model

### Proposed user-facing model

- A session is the primary sidebar object.
- A session may be in one of two practical states:
  - Draft-only: no run yet, blank task input, blank canvas, no history.
  - Run-backed: linked to one persisted run whose events/projected agent state drive the conversation/history view.
- V1 allows only one live run globally because `src/hooks/use-live-drain.ts` is single-queue today.
- Users may switch away from a live session for browsing, but they cannot start another run in any session until the live run completes or approval is resolved.
- A session is single-run in V1: once a session has a linked run, it becomes a history-bearing task environment and does not start a second run. The user creates a new session for a new task.
- Live-session contract in the product model:
  - `activeSessionId` is the persisted selection used to route the visible workspace.
  - `liveSessionId` is the authoritative ephemeral session currently owning the live run or pending approval.
  - Approval/rejection actions always resolve against `liveSessionId`, not whichever sidebar row is selected.
  - If `activeSessionId !== liveSessionId` while approval is pending, the sidebar must still mark the live session with a pending-approval indicator, and the user must reselect that session before resolving the approval.
- Delete boundary in V1:
  - Deleting the currently live session is blocked.
  - Deleting the currently selected but non-live session is allowed with confirmation.
  - After deleting the selected non-live session, the app selects the most recently updated remaining session.
  - If no session remains after delete, the app immediately creates and selects one new blank session.
  - Session delete removes only the session record and draft state; linked run events remain retained and hidden from the sidebar.

### Proposed persisted model

- Keep existing run storage in `src/server/events/storage.ts` under `signal-atlas:runs`.
- Add a session index and active-session pointer in the same storage module or a closely related session-storage helper.
- Proposed V1 session shape:
  - `sessionId`
  - `title`
  - `createdAt`
  - `updatedAt`
  - `linkedRunId | null`
  - `draft`
    - `taskInput`
    - `selectedRoleIds`
- Proposed additional localStorage keys:
  - `signal-atlas:sessions`
  - `signal-atlas:active-session`
- Explicit persistence contract:
  - `activeSessionId` is persisted.
  - `liveSessionId` is runtime-only and must not be persisted across reload.
  - On boot, `liveSessionId` is rehydrated by scanning sessions whose `linkedRunId` projects to a nonterminal or approval-pending phase; that linked session regains live ownership.
  - If multiple linked sessions project as nonterminal or approval-pending, V1 picks `liveSessionId` deterministically by newest run `lastEventAt`, then newest session `updatedAt`, then lexical `sessionId`.
  - Brownfield bootstrap runs when `signal-atlas:runs` exists and `signal-atlas:sessions` does not.
  - Bootstrap creates one run-backed session per run, sorted by `lastEventAt`, with projection-title-derived titles, blank draft state, singular `linkedRunId`, and the newest backfilled session set as `activeSessionId`.

### Proposed runtime model

- `useRunStore` remains responsible for run event maps and catalog projections, while session state determines which run is rendered.
- Add a session-focused store/hook, likely `src/hooks/use-session-store.ts`, responsible for:
  - loading/saving the session list
  - maintaining persisted `activeSessionId`
  - maintaining authoritative ephemeral `liveSessionId`
  - create/select/rename/delete session actions
  - resolving the active session’s `linkedRunId`
  - updating session draft state independently of run history
  - `attachRunToSession(sessionId, runId)`
- Live-run guard stays global in V1 and is enforced by `liveSessionId !== null`.
- Session actions may change `activeSessionId` during a live run for browsing, but run-start actions must reject any attempt to launch a second run while `liveSessionId` is set.
- Delete actions must reject any session where `sessionId === liveSessionId`.
- Approval resolution must target `liveSessionId` and reselect that session before allowing the action if the user is browsing elsewhere.
- Refactor draft-agent handling so `use-canvas-agents` becomes session-scoped input state instead of one global singleton. Two acceptable brownfield paths:
  - preferred: replace it with a session-draft hook driven by the active session record
  - fallback: keep the API shape but back it with `activeSession.draft.selectedRoleIds`
- Run-linking sequencing contract:
  - Capture `sessionIdAtStart = activeSessionId` before scenario construction begins.
  - Build the scenario next and obtain `runId`.
  - Atomically persist the initial events, call `attachRunToSession(sessionIdAtStart, runId)`, and set `liveSessionId = sessionIdAtStart`.
  - Only then hand queued events to the live drain.
  - Executors must refactor `useLiveDrain` or its call site so `runId` is available before queue processing begins, and they must not re-read a possibly changed `activeSessionId` after scenario construction.

### Main design choice rationale

- First-class session envelope is the correct choice for this repo.
- Reason:
  - Runs represent event history after execution starts.
  - Sessions must also represent pre-run blank state, draft task input, and rename/delete behavior before any run exists.
  - V1 also needs a hard boundary of one run per session plus one live run globally, which is clearer with a singular `linkedRunId`.
  - The explicit split between persisted `activeSessionId` and ephemeral `liveSessionId` is necessary to keep browsing state from corrupting live approval/run ownership.
  - Treating runs alone as sessions would either break the blank-session requirement or force fake placeholder runs, which would contaminate event history and complicate projection logic for little gain.
  - Brownfield backfill from legacy run-only storage is straightforward only when sessions are a real top-level model.

## 4. Acceptance Criteria

1. The app shows a visible sidebar listing sessions and a create-session action.
2. Creating a session immediately selects it and renders a blank task input, blank draft canvas, and no inherited conversation history.
3. Switching to a draft-only session restores that session’s saved draft task input and selected draft agents, not another session’s state.
4. Switching to a run-backed session restores that session’s conversation/history and projected agent status from its linked run.
5. Inline rename updates only the targeted session title and persists across reload.
6. `useSessionStore` owns the authoritative ephemeral `liveSessionId` in V1, and `liveSessionId` is not persisted across reload.
7. On boot, V1 rehydrates `liveSessionId` from the linked session whose run projection is nonterminal or approval-pending.
8. `activeSessionId` remains the persisted UI router, and browsing another session during a live run does not change which session owns approval/run resolution.
9. Run start is blocked whenever `liveSessionId !== null`, regardless of which session is currently selected.
10. Delete requires confirmation; delete is blocked whenever `sessionId === liveSessionId`, while deleting the currently selected but non-live session is allowed.
11. Approval resolution targets `liveSessionId`, not whichever session is currently selected.
12. If the user is browsing another session while the live session awaits approval, the sidebar shows a pending-approval indicator on the live session, and approval/rejection requires reselecting that session first.
13. Starting a session’s first run follows the explicit sequence: capture `sessionIdAtStart`, build scenario and obtain `runId`, atomically persist initial events plus `attachRunToSession(sessionIdAtStart, runId)` plus `liveSessionId = sessionIdAtStart`, then hand queued events to the drain.
14. Executors surface `runId` before queue processing starts by refactoring `useLiveDrain` or its call site, and they do not re-read `activeSessionId` after scenario construction for linkage ownership.
15. Deleting a session removes only that session record and its draft state; linked run events remain retained in storage and hidden from the sidebar.
16. After deleting the selected non-live session, the app selects the most recently updated remaining session, or creates and selects one new blank session if none remain.
17. Once a session has `linkedRunId`, V1 does not allow that session to start a second run; the user must create a new session for a new task.
18. `linkedRunId` remains singular in V1, not a list.
19. If `signal-atlas:runs` exists and `signal-atlas:sessions` does not, V1 backfills one run-backed session per existing run using the run projection title, blank draft state, `lastEventAt` sort order, and newest-session `activeSessionId` selection.
20. Sidebar rows are sorted by `updatedAt` descending, and `updatedAt` bumps on create, rename, draft task edit, draft agent edit, run attachment, and linked-run activity updates.
21. If boot-time rehydration finds multiple linked sessions with nonterminal or approval-pending runs, V1 picks `liveSessionId` by newest run `lastEventAt`, then newest session `updatedAt`, then lexical `sessionId`.
22. The brownfield backfill path is covered by tests.
23. V1 does not expose search, folders/projects, archive, duplication, or workspace-wide controls.
24. Existing run playback/live behavior still works once a session starts a run and becomes linked to that run.

## 5. Implementation Steps

1. Add a first-class session persistence model and brownfield bootstrap path.
   - Touch `src/server/events/storage.ts` or add a sibling session-storage module under `src/server/events/`.
   - Add load/save helpers for sessions and active session selection without breaking `signal-atlas:runs`.
  - Define session/draft types in `src/shared/contracts/types.ts` or a nearby shared contract file.
  - Persist a singular `linkedRunId` on each session, not `runIds[]`.
  - Persist `activeSessionId`, but keep `liveSessionId` runtime-only and rehydratable from linked nonterminal runs on boot.
  - Define `updatedAt` as the authoritative sidebar ordering field and update it on create, rename, draft task edit, draft agent edit, run attachment, and linked-run activity updates.
  - Add brownfield bootstrap logic: if runs exist and sessions do not, create one run-backed session per run sorted by `lastEventAt`, derive titles from run projections, initialize blank drafts, and set the newest backfilled session as `activeSessionId`.
  - Add deterministic boot-time `liveSessionId` tie-break logic: newest run `lastEventAt`, then newest session `updatedAt`, then lexical `sessionId`.

2. Introduce session-state orchestration with explicit live-session ownership.
   - Add `src/hooks/use-session-store.ts` to manage:
     - `sessions`
     - `activeSessionId`
     - `liveSessionId`
     - `createSession`
     - `selectSession`
     - `renameSession`
     - `deleteSession`
     - `updateSessionDraft`
     - `attachRunToSession`
    - live-session setter/clearer actions tied to run lifecycle
    - boot-time `liveSessionId` rehydration from linked nonterminal or approval-pending runs
   - Refactor `src/hooks/use-run-store.ts` so active run selection can be derived from the active session’s `linkedRunId` rather than only the newest catalog entry.
   - Encode delete behavior explicitly: block delete when `sessionId === liveSessionId`, allow confirmed delete for selected non-live sessions, then select the most recently updated remaining session or create a fresh blank session if none remain.
   - Encode start guard explicitly: if `liveSessionId !== null`, no session may start a run.
   - Encode approval routing explicitly: approval/rejection actions resolve through `liveSessionId`, not `activeSessionId`.

3. Make draft state session-scoped instead of global.
   - Refactor `src/hooks/use-canvas-agents.ts` so selected agents come from the active session draft, or replace it with a session-draft hook.
   - Update `src/components/conversation/task-input.tsx` so task text is controlled by session draft state rather than component-local-only state.
   - Ensure “new session” initializes `{ taskInput: "", selectedRoleIds: [] }`.
   - Ensure brownfield backfilled sessions also initialize blank draft state rather than inferred historical draft content.

4. Split run creation from drain start and link runs atomically to sessions.
   - Refactor `src/hooks/use-live-drain.ts` or its call site so scenario construction returns or exposes `runId` before queue processing starts.
  - Change run-start flow to:
    - capture `sessionIdAtStart`
    - build scenario
    - obtain `runId`
    - atomically persist initial events
    - call `attachRunToSession(sessionIdAtStart, runId)`
    - set `liveSessionId = sessionIdAtStart`
    - then hand queued events to the drain
  - Clear `liveSessionId` only when the live run fully completes, fails terminally, or approval resolution finishes and the lifecycle no longer owns the live session.
  - On app boot, rehydrate `liveSessionId` from the linked session whose run projection is nonterminal or approval-pending.
  - Preserve current live-drain mechanics after the session/run linkage step so existing event processing behavior remains intact.

5. Add the sidebar shell and session-management UI.
   - Extend `src/components/layout/app-shell.tsx` to support a left session sidebar plus the existing graph/conversation workspace.
   - Add a focused session-sidebar component, likely under `src/components/layout/` or `src/components/session/`, with:
     - create button
     - session list
     - active-state styling
     - inline rename
     - delete action with confirmation
     - disabled delete affordance or equivalent blocked behavior for the currently live session
     - pending-approval indicator on the `liveSessionId` row even when another session is selected
   - Ensure approval/rejection affordances or routing return the user to `liveSessionId` before resolving the action if they are browsing elsewhere.

6. Rewire `src/app/App.tsx` around active session and live-session contracts.
   - Resolve view state from `activeSessionId`:
     - draft-only session => pre-run graph and empty conversation
     - run-backed session => existing run projection/message flow
   - Preserve current live-run flow from `useLiveDrain` while making session selection the top-level router.
   - Add V1 run-start guards:
     - reject launching a run if `liveSessionId !== null`
     - reject launching a run from a session that already has `linkedRunId`
     - direct the user to create a new session for a new task
   - Ensure approval resolution path uses `liveSessionId`, not current selection, and reselects the live session if required before resolving approval/rejection.

7. Add regression and feature tests before closeout.
   - Extend `tests/app.test.tsx`.
   - Add focused storage/store tests for session persistence and bootstrap migration if the repo pattern supports it, likely under `tests/` beside existing app coverage.
   - Cover blank session creation, switch restoration, rename persistence, confirmed delete, blocked live-session delete, post-delete reselection, blank-session auto-create when last session is deleted, and run-start blocking under the global single-live-run rule.
   - Cover approval-routing behavior when `activeSessionId !== liveSessionId`, including pending indicator visibility and reselect-before-resolve behavior.
   - Cover the run-linking sequence so `attachRunToSession` and `liveSessionId` are set before queue processing begins.
   - Cover brownfield bootstrap from `signal-atlas:runs`-only storage and verify per-run session backfill ordering/title/linkage/blank drafts/newest-session activation.

## 6. Risks and Mitigations

- Risk: Users may expect “new prompt in same session” reruns, but V1 defines a history-bearing session as single-run.
  - Mitigation: Make the UI and tests explicit that a run-backed session is not rerunnable; new work starts by creating a new session.

- Risk: The current single-queue live-drain path could be accidentally bypassed by session switching.
  - Mitigation: Keep concurrency control global at run-start time via `liveSessionId !== null` and treat session switching during a live run as browse-only, not a second execution lane.

- Risk: Approval actions could resolve against the wrong session if selection state is mistaken for live ownership.
  - Mitigation: Make `liveSessionId` the sole authoritative target for approval resolution, surface a pending indicator on the live session row, and require reselecting that session before approval/rejection when browsing elsewhere.

- Risk: Reloading during a live or approval-pending run could lose live-session ownership because `liveSessionId` is runtime-only.
  - Mitigation: Rehydrate `liveSessionId` on boot from the linked session whose run projection is nonterminal or approval-pending, and verify this recovery path in tests.

- Risk: Global draft state leaks across sessions during refactor.
  - Mitigation: Move task input and selected role IDs behind session-store APIs first, then update UI consumers to read only from the active session.

- Risk: Run events could start draining before the session/run linkage is recorded, producing a race or mis-linked live state.
  - Mitigation: Explicitly split scenario creation from drain start, capture `sessionIdAtStart` before scenario build, require `runId` before queue processing, and atomically persist initial events plus session attachment plus `liveSessionId` before handing work to the drain.

- Risk: Brownfield users with only `signal-atlas:runs` could lose continuity or land in a nondeterministic sidebar state on upgrade.
  - Mitigation: Add deterministic one-session-per-run backfill sorted by `lastEventAt`, derive titles from run projections, initialize blank drafts, select the newest backfilled session, and verify this path in tests.

- Risk: Session ordering and delete fallback could drift if `updatedAt` is bumped inconsistently across draft and run-backed actions.
  - Mitigation: Treat `updatedAt` as a defined contract, update it on create/rename/draft edits/run attach/linked-run activity, and verify sidebar ordering plus delete reselection behavior in tests.

- Risk: Boot-time `liveSessionId` rehydration could become nondeterministic if multiple sessions appear nonterminal due legacy or corrupted storage.
  - Mitigation: Apply a deterministic tie-break of newest run `lastEventAt`, then newest session `updatedAt`, then lexical `sessionId`, and verify the winner selection in bootstrap tests.

- Risk: Deleting a session could accidentally delete retained run history or leave the app without a selected session.
  - Mitigation: In V1, delete only the session record and draft state, retain linked run events, then deterministically reselect the most recently updated remaining session or auto-create one blank session when none remain.

- Risk: Existing app behavior assumes one implicit active run.
  - Mitigation: Re-anchor app rendering in `activeSessionId` while keeping the current projection pipeline unchanged for run-backed sessions and isolating live-run authority in `liveSessionId`.

## 7. Verification Steps

1. Storage-level checks
   - Verify session create/rename/select/delete persistence across reload.
   - Verify `activeSessionId` persists and `liveSessionId` does not persist across reload.
   - Verify boot-time rehydration restores `liveSessionId` from the linked session whose run projection is nonterminal or approval-pending.
   - Verify session ordering follows `updatedAt` descending after create, rename, draft edits, run attachment, and linked-run activity updates.
   - Verify `signal-atlas:runs` remains readable for legacy run-backed views.
   - Verify deleting a session does not remove its linked run events from run storage.
   - Verify brownfield bootstrap when runs exist and sessions do not: one session per run, sorted by `lastEventAt`, projection-title titles, blank draft state, singular `linkedRunId`, newest-session `activeSessionId`, and deterministic `liveSessionId` tie-break when multiple runs are nonterminal.

2. App behavior checks
   - Create a new session and confirm blank task input, blank draft graph, and empty conversation.
   - Start a run in session A, switch to session B, and confirm B remains isolated.
   - While session A is live, confirm session switching is allowed for browsing but starting a run in session B is blocked because `liveSessionId !== null`.
   - Put session A into approval-pending state, switch to session B, and confirm the sidebar shows a pending-approval indicator on session A.
   - Attempt approval/rejection while session B is selected and confirm the flow reselects session A and resolves against `liveSessionId`.
   - Reload while session A is live or approval-pending and confirm the correct linked session regains `liveSessionId` ownership after boot.
   - Switch back to session A and confirm history and agent status are restored.
   - Rename a session inline and confirm the sidebar updates without affecting run content.
   - Delete the selected non-live session with confirmation and confirm the most recently updated remaining session is selected.
   - Delete the final remaining non-live session and confirm one new blank session is immediately created and selected.
   - Attempt to delete the currently live session and confirm the action is blocked.
   - Attempt to start a second run from a run-backed session and confirm the user is directed to create a new session.

3. Run-linking and lifecycle checks
   - Verify the run-start path surfaces `runId` before drain queue processing begins.
   - Verify `sessionIdAtStart` is captured before scenario build and remains the ownership key used for attach/live assignment even if `activeSessionId` changes during the start flow.
   - Verify initial event persistence, `attachRunToSession(sessionIdAtStart, runId)`, and `liveSessionId = sessionIdAtStart` all happen before queued events are handed to the drain.
   - Verify the linked session remains stable even if `activeSessionId` changes for browsing during the live run.
   - Verify `liveSessionId` clears only at the appropriate terminal lifecycle boundary.

4. Regression checks
   - Existing run lifecycle tests still pass.
   - Sidebar feature tests pass for create/switch/rename/delete flows plus the global single-live-run boundary.
   - Migration/bootstrap tests pass for legacy run-only storage.

## 8. ADR

### Decision

Adopt a first-class session envelope around existing run history, with per-session draft state, a persisted active session pointer, and an authoritative ephemeral live session pointer.

### Drivers

- Blank session creation is required.
- Session switching must restore both pre-run and run-backed state.
- Existing run persistence/projection is useful but insufficient as the sole session model.
- V1 must preserve one live run globally and one run per session.
- Approval and delete guards must target the true live session even when the user browses another session.
- Brownfield users may already have legacy run storage without session records.

### Alternatives considered

- Treat runs alone as sessions.
  - Rejected because it cannot cleanly model blank sessions, per-session draft state, the single-run-per-session boundary, or the split between persisted UI selection and authoritative live-session ownership.
- Synthetic placeholder runs or metadata-only overlay.
  - Rejected because it either pollutes the event log with non-run artifacts or creates an implicit session model with muddled delete/restore/live-ownership semantics.

### Why chosen

This option is the narrowest brownfield design that satisfies the product requirement without rewriting the run engine. It isolates the new sidebar/session behavior in a clear state boundary while preserving the tested run event pipeline, gives V1 an explicit `activeSessionId` versus `liveSessionId` contract, and supports deterministic bootstrap from legacy run-only storage.

### Consequences

- The app gains a second persisted model to coordinate.
- `App.tsx` becomes session-routed instead of implicitly newest-run-routed.
- Draft task input and draft agents become product state instead of transient component/global-hook state.
- The runtime gains an explicit split between persisted `activeSessionId` and ephemeral but boot-rehydratable `liveSessionId`.
- Sidebar ordering and delete fallback now depend on a formal `updatedAt` contract rather than incidental write timing.
- Approval routing, delete guards, and run-start guards all become defined in terms of `liveSessionId`.
- Run start must be refactored into a two-phase flow so `sessionIdAtStart` is captured and `runId` exists before drain queue processing begins.
- Session delete becomes metadata-only plus draft cleanup; linked run events are retained but no longer surfaced in the sidebar.
- Brownfield startup must backfill one run-backed session per legacy run when session storage is absent.
- V1 rerun UX is intentionally constrained: one live run globally, one linked run per session, new task equals new session.

### Follow-ups

- Future V2 can revisit whether sessions should support `linkedRunIds[]` and reruns after the live-drain architecture is no longer single-queue.
- Future V2 can decide whether retained hidden run events from deleted sessions should become recoverable or prunable through separate history management.
- Future V2 can revisit whether session titles should default from draft input, latest run title, or explicit user rename precedence.
- Future V2 can evaluate whether approval can be resolved without reselecting the live session once the UI supports a more explicit cross-session pending-action surface.
- Future V2 can replace bootstrap-only backfill with an explicit one-time versioned migration ledger if storage evolution becomes more complex.

## 9. Available-Agent-Types Roster

- `planner`: refine execution sequencing and keep acceptance criteria/test scope aligned.
- `architect`: challenge the session model boundary and storage/UI seams.
- `critic`: pressure-test option quality, risk coverage, and verification completeness.
- `executor`: implement session storage, hooks, and React UI changes.
- `debugger`: isolate regressions in session switching, live-run transitions, or localStorage migration.
- `test-engineer`: add and harden app/store tests for create/switch/rename/delete behavior.
- `verifier`: validate completion claims against acceptance criteria and manual test script.
- `explore`: fast repo lookup for exact symbols/files during execution.

## 10. Follow-up Staffing Guidance

### Ralph path

- Use `ralph` when one owner should sequence the brownfield refactor end-to-end.
- Suggested lane reasoning:
  - planning/architecture checkpoints: high
  - implementation: high
  - verification: medium to high
- Ralph execution order:
  1. session storage/types and brownfield bootstrap
  2. session store with `activeSessionId`/`liveSessionId`
  3. draft-state refactor
  4. run-linking split before drain start
  5. sidebar UI and approval indicators
  6. app wiring
  7. tests and verification
- Ralph verification path:
  - run targeted tests after each seam
  - run full app test suite before closeout
  - manually verify create/switch/rename/delete, live approval targeting, bootstrap migration, and run restoration

### Team path

- Use `team` if parallel lanes are desired after agreeing on the session-envelope model.
- Recommended staffing:
  - Lane 1: `executor` for storage/contracts/session-store/bootstrap, reasoning `high`
  - Lane 2: `executor` for run-linking/live-drain/App wiring, reasoning `high`
  - Lane 3: `executor` or `test-engineer` for sidebar UI/approval indicators/tests, reasoning `medium`
  - Optional review lane: `architect` or `verifier`, reasoning `medium`
- Coordination rule:
  - Lane 1 owns shared state contracts and bootstrap semantics first, then Lanes 2 and 3 build against those contracts.
- Team verification path:
  1. merge storage/contracts/bootstrap lane
  2. validate run-linking lane against the merged state shape
  3. validate UI lane against merged live-session contracts
  4. run test lane against integrated branch
  5. finish with `verifier` pass against the acceptance criteria and manual sidebar workflow
- Launch hints:
  - `$team` for codified team orchestration once this plan is approved
  - `ralph` if lower coordination overhead is preferred and shared-file churn in `App.tsx` and `use-live-drain.ts` is likely to dominate
