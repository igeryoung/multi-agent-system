# Deep Interview Spec: session-sidebar

## Metadata
- Profile: standard
- Rounds: 7
- Final ambiguity: 0.148
- Threshold: 0.20
- Context type: brownfield
- Interview ID: 3577E88C-0E46-4C13-9E17-D9D6155B675E

## Context snapshot
- Path: `.omx/context/session-sidebar-20260404T013359Z.md`

## Clarity breakdown

| Dimension | Score |
| --- | ---: |
| Intent | 0.82 |
| Outcome | 0.90 |
| Scope | 0.90 |
| Constraints | 0.72 |
| Success | 0.86 |
| Context | 0.93 |

## Intent
Add a Codex-like session sidebar so the app supports multiple isolated task environments instead of behaving like one shared conversation/run view.

## Desired Outcome
The user can create, switch, rename, and delete sessions from a sidebar, with each session maintaining its own independent conversation history and agent state.

## In Scope
- Add a sidebar for session management.
- Create a new session from the sidebar.
- Switch between sessions from the sidebar.
- Rename a session via inline edit.
- Delete a session with confirmation.
- Restore a selected session's own conversation history.
- Restore a selected session's own agent status/state.
- Ensure creating a session opens a blank canvas/chat.

## Out of Scope / Non-goals
- Search.
- Folders/projects grouping.
- Advanced session features such as duplicate session, import/export, share session, restore deleted session, or cross-session comparison.
- Copying the current draft into a new session.
- Archive support in v1.

## Decision Boundaries
OMX may do the following automatically without confirmation:
- Create session.
- Switch session.
- Rename session via inline edit.

OMX must require explicit confirmation for:
- Delete session.

## Constraints
- Brownfield React/TypeScript app with existing persisted run storage in localStorage.
- Current app already has a pre-run draft canvas and task input; session isolation must not silently clone that draft into new sessions.
- V1 should stay a lightweight session manager, not a broader workspace taxonomy/browser.
- Existing persisted run catalog is the most likely foundation for session records, but implementation should preserve true per-session isolation semantics.

## Testable Acceptance Criteria
1. Creating a session from the sidebar adds/selects a new session and opens a blank canvas/chat.
2. Switching sessions restores that session's own agent status and conversation/history.
3. Deleting a session prompts for confirmation and removes only that session.
4. Renaming a session happens through inline edit in the sidebar.
5. The sidebar does not introduce search, project grouping, or archive behavior in v1.

## Assumptions Exposed And Resolved
- Assumption: "Session" might only mean historical runs.
  - Resolution: A session is an isolated environment for a distinct task, with independent conversation history.
- Assumption: A new session might duplicate the current draft canvas.
  - Resolution: New sessions must start completely blank.
- Assumption: Delete/archive might both be needed.
  - Resolution: V1 supports delete only.

## Pressure-pass Findings
- Revisited the initial "like Codex" requirement against the actual brownfield app structure.
- The existing shared draft canvas would undermine session isolation if copied forward.
- Final decision: creating a session must start from a blank environment.

## Brownfield Evidence Vs Inference
### Evidence
- `src/hooks/use-run-store.ts` already loads a persisted `runMap`, derives a sorted `catalog`, and exposes `handleSelectRun(runId)`.
- `src/server/events/storage.ts` persists runs under the `signal-atlas:runs` localStorage key.
- `src/app/App.tsx` currently renders only one active conversation view.
- `src/components/layout/app-shell.tsx` already provides a shell where a sidebar can plausibly be introduced.

### Inference
- The existing run catalog is likely the simplest substrate for session records.
- Additional state handling may be needed so blank draft state and live run state both remain isolated per session.

## Technical Context Findings
- The app has a single active session view even though persisted catalog data already exists.
- Run metadata already includes session-friendly fields such as `runId`, `title`, `task`, `phase`, and `lastEventAt`.
- Current task input and draft-agent selection are not yet modeled as per-session state in the visible UI.

## Condensed Transcript
- Round 1: Session means a Codex-like isolated environment with independent history.
- Round 2: V1 must support create, switch, rename, and delete/archive.
- Round 3: Non-goals are search, folders/projects, and advanced session features.
- Round 4: Create and switch are immediate; simplify v1 to delete only.
- Round 5: Rename is inline; delete requires confirmation.
- Round 6: New sessions must start blank.
- Round 7: Completion is defined by blank creation, correct restoration on switch, and isolated confirmed deletion.

## Handoff Readiness
- Non-goals: explicit
- Decision boundaries: explicit
- Pressure pass: complete
- Residual risk: low
