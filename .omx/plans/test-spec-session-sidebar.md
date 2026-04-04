# Test Spec: Session Sidebar V1

## Scope

Validate the behaviors defined in [prd-session-sidebar.md](/Users/yangping/Studio/side-project/multi-agent-system/.omx/plans/prd-session-sidebar.md) and grounded in [deep-interview-session-sidebar.md](/Users/yangping/Studio/side-project/multi-agent-system/.omx/specs/deep-interview-session-sidebar.md).

## Core Test Matrix

### Unit

- Session storage contract for `sessionId`, `title`, `createdAt`, `updatedAt`, `linkedRunId`, and blank draft state.
- `updatedAt` bump rules for create, rename, draft task edit, draft agent edit, run attachment, and linked-run activity.
- Boot-time session bootstrap from `signal-atlas:runs` when `signal-atlas:sessions` is absent.
- Deterministic `liveSessionId` rehydration and tie-break behavior.
- Delete guards for live session vs selected non-live session.
- Run-start guards for `liveSessionId !== null` and `linkedRunId !== null`.
- Approval routing against `liveSessionId` instead of `activeSessionId`.
- Pre-drain run-linking sequence using captured `sessionIdAtStart`.

### Integration

- Create a blank session and verify empty task, empty draft graph, and empty history.
- Rename a session inline and verify persistence across reload.
- Start a run, attach it to the captured session, and verify run-backed restoration after switching away and back.
- Browse to another session while one run is live and verify browse-only behavior.
- Enter approval-pending state while another session is selected and verify sidebar indicator plus reselect-before-resolve behavior.
- Delete a selected non-live session and verify deterministic reselection or blank-session auto-create.
- Verify linked run retention after delete.
- Bootstrap from legacy run-only storage and verify one-session-per-run backfill.

### End-to-End

- User creates a session from the sidebar and lands on a blank canvas/chat.
- User switches between draft-only and run-backed sessions and sees isolated state.
- User cannot start a new run while another session is live.
- User cannot delete the currently live session.
- User sees and resolves pending approval only through the live session.

### Observability

- Detect any mismatch between `activeSessionId`, `liveSessionId`, and linked run ownership.
- Detect any run-start path where queue processing begins before run attachment.
- Detect any bootstrap ambiguity when multiple legacy runs are nonterminal.
- Detect ordering drift between `updatedAt` and rendered sidebar order.

## Acceptance Mapping

1. Create session opens blank canvas/chat.
   Tests: unit, integration, e2e
2. Switch restores per-session history and agent state.
   Tests: integration, e2e
3. Inline rename persists.
   Tests: unit, integration
4. Delete confirms, blocks live session deletion, and reseats selection deterministically.
   Tests: unit, integration, e2e
5. One live run globally and one run per session.
   Tests: unit, integration, e2e
6. Approval follows `liveSessionId` ownership.
   Tests: unit, integration, e2e
7. Legacy run-only storage bootstraps deterministically.
   Tests: unit, integration, observability
8. Sidebar ordering follows `updatedAt`.
   Tests: unit, integration, observability

## Suggested Verification Order

1. Unit-test storage, bootstrap, guards, ordering, and live-session ownership rules.
2. Integration-test create/switch/rename/delete and pre-drain run-linking.
3. Integration-test live browsing and approval-routing edge cases.
4. End-to-end test the core sidebar workflow.
5. Run observability assertions for ownership drift, queue-before-attach, bootstrap ambiguity, and ordering drift.

## Evidence Required For Completion

- Passing automated tests for unit and integration layers.
- Passing UI tests for create/switch/rename/delete/live guards.
- Proof that legacy run-only storage bootstraps into deterministic sessions.
- Proof that `liveSessionId` rehydrates correctly after reload of a nonterminal or approval-pending session.
- Proof that queue processing never starts before `attachRunToSession(sessionIdAtStart, runId)`.
