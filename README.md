# Signal Atlas - Multi-Agent System

A multi-agent workflow orchestration system with a visual canvas interface. Atlas, the head agent, creates structured execution plans, delegates work to specialized role agents, and manages approval checkpoints for human-in-the-loop oversight.

## Tech Stack

- **Frontend:** React 19, TypeScript, TailwindCSS 4, XYFlow (graph visualization)
- **Build:** Vite 7
- **Testing:** Vitest, Testing Library
- **Planning Bridge:** Node.js scripts using Codex CLI + tmux

## Getting Started

```bash
npm install
npm run dev
```

To enable AI-powered planning (bridge mode), start the planner bridge in a separate terminal:

```bash
npm run planner:bridge
```

> **Note:** Bridge mode requires `codex` CLI and `tmux` to be installed. Without the bridge, runs will fail with a diagnostic popup explaining the setup steps.

## Scripts

| Command | Description |
|---------|-------------|
| `npm run dev` | Start Vite dev server |
| `npm run build` | Type-check and build for production |
| `npm run preview` | Preview production build |
| `npm run planner:bridge` | Start the head planner bridge server |
| `npm test` | Run tests |
| `npm run test:watch` | Run tests in watch mode |
| `npm run check` | Type-check only (no emit) |

## Architecture

### Agents

**Head Agent (Atlas):**
- Creates the execution plan, controls the run, and owns every approval checkpoint.
- Always visible on the canvas.

**Role Agents:**

| ID | Label | Responsibility |
|----|-------|----------------|
| `ceo-planner` | CEO Planner | Reframes task into sequenced workstreams |
| `engineer` | Engineer | Builds implementation path and resolves technical gaps |
| `qa` | QA Tester | Challenges output and highlights broken/missing evidence |
| `reviewer` | Reviewer | Turns work into clear recommendation with critique |
| `writer` | Writer | Transforms findings into user-facing narrative |

### Execution Flow

1. User creates a session, adds role agents to the canvas, and describes a task.
2. Atlas generates an execution plan (via bridge or fixture mode).
3. The plan defines task packets, steps, and workflow edges for each agent.
4. Agents execute in sequence with handoffs between lanes.
5. If the task implies an external side effect (publish, deploy, send), Atlas pauses for user approval.
6. The run completes after all agents finish and approvals are resolved.

### Run Phases

`draft` -> `planning` -> `dispatching` -> `waiting_on_agent` -> `awaiting_approval` -> `completed` / `failed` / `cancelled`

### Head Planner Modes

- **Bridge mode** (default): POSTs to a local HTTP bridge server (`http://127.0.0.1:4317/api/plan`) which spawns Codex to generate an AI-powered plan. Requires the bridge server to be running.
- **Fixture mode** (testing): Generates a deterministic synthetic plan locally. Automatically used in test environments (`VITEST`).

## Project Structure

```
src/
  app/           App entrypoint
  components/    UI components (layout, graph, conversation)
  hooks/         React hooks (run store, session store, live drain, canvas agents)
  lib/           Adapters and utilities
  server/
    events/      Event projection and storage
    orchestrator/ Head planner and scenario builder
  shared/
    contracts/   Type definitions
scripts/
  head-planner-bridge.mjs   HTTP bridge server
  head-planner-runner.mjs   Codex-powered plan generator
tests/           Vitest test files
```

## Environment Variables

| Variable | Default | Description |
|----------|---------|-------------|
| `VITE_HEAD_PLANNER_BRIDGE_URL` | `http://127.0.0.1:4317/api/plan` | Override bridge endpoint (client) |
| `SIGNAL_ATLAS_PLANNER_HOST` | `127.0.0.1` | Bridge server bind host |
| `SIGNAL_ATLAS_PLANNER_PORT` | `4317` | Bridge server bind port |
| `SIGNAL_ATLAS_PLANNER_TIMEOUT_MS` | `60000` | Bridge planning timeout (ms) |
