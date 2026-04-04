# Context Snapshot: session-sidebar

## Task statement
Add a sidebar to create and maintain the session for this app.

## Desired outcome
Clarify what "session" means in this brownfield app and define the intended sidebar behavior tightly enough for planning handoff.

## Stated solution
Introduce a sidebar UI for session creation and maintenance.

## Probable intent hypothesis
The user wants the app to support multiple persistent conversation/run sessions instead of behaving like a single active run view, while making session switching and management visible and easy to control.

## Known facts / evidence
- `src/hooks/use-run-store.ts` already loads a persisted `runMap`, derives a sorted `catalog`, and exposes `handleSelectRun(runId)`.
- `src/server/events/storage.ts` persists runs under `localStorage` key `signal-atlas:runs`.
- `src/app/App.tsx` only renders one conversation panel backed by `activeRunId` and does not surface the run catalog in the UI.
- `src/components/layout/app-shell.tsx` uses a two-panel layout: graph on the left, conversation plus drawer on the right.
- `src/components/conversation/task-input.tsx` starts a run from a single task box and has no visible session creation or browsing affordance.
- `src/server/events/projectRun.ts` already computes session-friendly metadata such as `runId`, `title`, `task`, `phase`, and `lastEventAt`.

## Constraints
- Brownfield React/TypeScript app with existing run persistence and tests.
- No session UX exists yet in the current shell.
- "Session" could still mean one of multiple scopes: persisted runs, drafts, or a broader workspace concept.

## Unknowns / open questions
- Whether a session should equal a persisted run, include draft agent selections, or represent a higher-level workspace.
- Whether the sidebar is primarily for switching old sessions, creating new ones, renaming/archiving/deleting them, or all of the above.
- How much autonomy the system should have when creating/selecting sessions.
- What must remain out of scope for the first release of this sidebar.

## Decision-boundary unknowns
- Which session actions OMX may do automatically without confirmation.
- Which destructive or state-changing actions must always require explicit user approval.

## Likely codebase touchpoints
- `src/hooks/use-run-store.ts`
- `src/app/App.tsx`
- `src/components/layout/app-shell.tsx`
- `src/components/conversation/task-input.tsx`
- `src/server/events/storage.ts`
- `tests/app.test.tsx`
