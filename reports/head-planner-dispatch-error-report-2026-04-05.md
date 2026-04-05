# Head Planner Dispatch Pipeline Error Report

Date: 2026-04-05
Scope: frontend active-window progress, planner bridge lifecycle, popup behavior

## Summary

The current dispatch pipeline is not actually streaming planner progress to the active conversation window.

What the UI currently does:

- During `isStartingRun`, it injects two temporary placeholder messages only:
  - `Task received: ...`
  - `Atlas is generating the head plan...`
- It does not render bridge logs, Codex thinking/progress, or intermediate planner updates in the active window.
- Error details are collected into a modal path, so failures are visible, but normal planning activity is mostly silent.

What the bridge currently does:

- The frontend waits synchronously for `buildRunScenario(...)` to finish before it persists a run and attaches that run to the session.
- The bridge spawns a tmux session and waits for a single `response.json` result file.
- The bridge deletes the temp directory in `finally`, so the tmp `response.json` is expected to disappear after the request completes.

This matches the behavior you observed:

- frontend shows only the two startup placeholders, then no live planner thinking/progress
- server logs show planner activity
- the tmp `response.json` path is gone afterward

## Expected vs Actual

Expected:

- Normal planner progress should appear in the active window.
- Model thinking/progress and plan-building updates should be visible while planning is running.
- Popup/modal UI should be reserved for errors.

Actual:

- Only two hardcoded planning messages are shown in-window.
- Bridge and runner progress stay in server stdout or internal debug state, not in the conversation view.
- The tmp `response.json` is cleaned up immediately after the bridge finishes, so it cannot be inspected afterward.
- Popup/modal handling is already failure-oriented, but normal progress is not routed to the active window at all.

## Findings

### 1. Planning is synchronous and blocks run creation until the bridge fully returns

Evidence:

- [`src/hooks/use-live-drain.ts:155`](../src/hooks/use-live-drain.ts) sets `isStartingRun` and `planningTask`.
- [`src/hooks/use-live-drain.ts:162`](../src/hooks/use-live-drain.ts) awaits `buildRunScenario(task, roleIds)`.
- Only after that await resolves does it persist the run and link the session:
  - [`src/hooks/use-live-drain.ts:164`](../src/hooks/use-live-drain.ts)
  - [`src/hooks/use-live-drain.ts:166`](../src/hooks/use-live-drain.ts)

Impact:

- There is no live run record during planning.
- The active conversation cannot receive real planner events while planning is happening.
- The UI can only fake progress with local placeholder messages.

### 2. The active window only renders two temporary hardcoded planning messages

Evidence:

- [`src/app/App.tsx:196`](../src/app/App.tsx) appends planning messages only while `isStartingRun && planningTask`.
- The two injected messages are defined at:
  - [`src/app/App.tsx:200`](../src/app/App.tsx)
  - [`src/app/App.tsx:209`](../src/app/App.tsx)

Impact:

- The active window cannot show actual bridge steps, Codex progress, or planner reasoning.
- Once those placeholders are stale, the UI appears idle even though planning is still happening.

### 3. The codebase has a `planning_started` message type, but the real scenario never emits it

Evidence:

- Conversation adapters support `planning_started`:
  - [`src/lib/adapters.ts:171`](../src/lib/adapters.ts)
- Projection logic also supports `planning_started`:
  - [`src/server/events/projectRun.ts:113`](../src/server/events/projectRun.ts)
- But scenario generation jumps from `run_created` / `roles_assigned` straight to waiting for `createHeadPlan(...)`, then emits only `plan_created`:
  - [`src/server/orchestrator/scenario.ts:112`](../src/server/orchestrator/scenario.ts)
  - [`src/server/orchestrator/scenario.ts:137`](../src/server/orchestrator/scenario.ts)
  - [`src/server/orchestrator/scenario.ts:164`](../src/server/orchestrator/scenario.ts)

Impact:

- There is a UI/event contract for planning progress, but the bridge path never uses it.
- The app has no real planning-phase event stream.

### 4. Bridge progress is logged to stdout, not sent to the frontend

Evidence:

- Bridge logs planner lifecycle to stdout:
  - [`scripts/head-planner-bridge.mjs:67`](../scripts/head-planner-bridge.mjs)
  - [`scripts/head-planner-bridge.mjs:75`](../scripts/head-planner-bridge.mjs)
  - [`scripts/head-planner-bridge.mjs:78`](../scripts/head-planner-bridge.mjs)
  - [`scripts/head-planner-bridge.mjs:80`](../scripts/head-planner-bridge.mjs)
- Those logs are returned neither as incremental HTTP data nor as stored run events.

Impact:

- The server terminal shows activity.
- The active window stays uninformed.

### 5. Runner suppresses Codex live output and waits for one final structured file

Evidence:

- Runner invokes `codex exec ... -o outputFile`:
  - [`scripts/head-planner-runner.mjs:116`](../scripts/head-planner-runner.mjs)
- Child stdio is piped, but only `stderr` is accumulated for failures:
  - [`scripts/head-planner-runner.mjs:128`](../scripts/head-planner-runner.mjs)
  - [`scripts/head-planner-runner.mjs:132`](../scripts/head-planner-runner.mjs)
- Success path reads only the final `output.json` after process exit:
  - [`scripts/head-planner-runner.mjs:137`](../scripts/head-planner-runner.mjs)
  - [`scripts/head-planner-runner.mjs:144`](../scripts/head-planner-runner.mjs)

Impact:

- Even if Codex prints meaningful progress/thinking, this pipeline does not forward it anywhere.
- The runner is architected as request in / final file out, not as a live-progress channel.

### 6. Missing tmp `response.json` after completion is expected with the current cleanup

Evidence:

- Bridge creates `response.json` under a temp dir:
  - [`scripts/head-planner-bridge.mjs:61`](../scripts/head-planner-bridge.mjs)
  - [`scripts/head-planner-bridge.mjs:65`](../scripts/head-planner-bridge.mjs)
- After responding, it always removes the entire temp directory:
  - [`scripts/head-planner-bridge.mjs:106`](../scripts/head-planner-bridge.mjs)
  - [`scripts/head-planner-bridge.mjs:108`](../scripts/head-planner-bridge.mjs)

Impact:

- Seeing no file at `/var/.../response.json` after the request completes is expected behavior, not a separate storage bug.
- That file is a transient handoff artifact, not a durable report/debug output.

### 7. Debug entries exist, but they are only surfaced through failure handling

Evidence:

- `useLiveDrain` records info/error debug entries:
  - [`src/hooks/use-live-drain.ts:63`](../src/hooks/use-live-drain.ts)
  - [`src/hooks/use-live-drain.ts:160`](../src/hooks/use-live-drain.ts)
  - [`src/hooks/use-live-drain.ts:163`](../src/hooks/use-live-drain.ts)
  - [`src/hooks/use-live-drain.ts:192`](../src/hooks/use-live-drain.ts)
- The app uses them only to enrich failure diagnostics:
  - [`src/app/App.tsx:115`](../src/app/App.tsx)
  - [`src/app/App.tsx:122`](../src/app/App.tsx)

Impact:

- There is already a lightweight internal progress signal.
- It is not rendered in the normal conversation panel.
- Normal info is effectively hidden unless something fails.

## Root Cause

This is primarily an architecture mismatch, not one isolated bug.

The dispatch pipeline is designed as:

1. Start dispatch locally.
2. Block on `buildRunScenario(...)`.
3. Let the bridge spawn tmux and wait for one final response file.
4. Persist the run only after the final plan exists.

That architecture prevents the frontend from showing real planning-time activity in the active window.

## Severity

Medium-high UX defect.

Reason:

- Core planner activity is invisible during the slowest part of dispatch.
- Users interpret the system as stuck or broken.
- Server logs expose useful state that the intended UI never receives.
- The disappearing temp file increases confusion during debugging.

## Recommended Fix Direction

### Minimum viable fix

- Emit a real `planning_started` event before `createHeadPlan(...)`.
- Persist/link the run before waiting for the bridge result.
- Render debug/progress entries in the active conversation window as status messages instead of reserving them for error diagnostics only.

### Better fix

- Change the bridge/runner contract from single final response to progress + final result.
- Stream planner lifecycle updates into the run event log, for example:
  - request accepted
  - tmux session created
  - Codex launched
  - planner still working
  - final structured plan received
- Keep modal/popup UI only for actual errors.

### Debuggability fix

- Do not rely on transient tmp `response.json` for post-run inspection.
- If debugging artifacts are needed, write a retained copy to a stable app-owned log/report location or gate temp cleanup behind a debug flag.

## Conclusion

The observed behavior is real and reproducible from the current implementation:

- normal planning progress is not wired into the active window
- popup/error flow is better supported than normal progress flow
- missing tmp `response.json` is expected because the bridge deletes it on completion

The main issue is that the planner pipeline is final-result oriented, while the expected UX requires streamed in-window progress.
