# Signal Atlas UI/UX Rewrite — Consensus Plan

## ADR: Architecture Decision Record

**Decision:** Full UI rewrite with preserved event-sourcing core, React Flow interactive graph, shadcn/ui components, and view adapter layer.

**Drivers:**
- User wants a complete visual/interaction overhaul (deep interview: 18% ambiguity)
- Current monolithic App.tsx (499 lines) is unmaintainable
- Custom CSS (406 lines) doesn't achieve the desired Linear/Vercel polish
- Static SVG graph needs to become interactive (drag roles from palette to canvas)

**Alternatives Considered:**
| Option | Verdict | Reason |
|--------|---------|--------|
| A: React Flow + shadcn/ui + adapters (chosen) | Selected | Best balance of polish, interactivity, and architecture preservation |
| B: Custom SVG + shadcn/ui | Rejected | Months of interaction plumbing (drag, connect, zoom, pan) for inferior result |
| C: Flat ConversationMessage model | Rejected | Destroys event-sourcing benefits: replay, validation, testability (Architect finding) |

**Consequences:**
- +50KB bundle size (React Flow) — acceptable for desktop-first app
- New contributor must understand event → projection → adapter → UI pipeline
- Existing `projectRun.test.ts` tests pass unchanged

---

## Principles
1. **Chat-primary interaction** — Conversation log is the primary interface for observing and interacting
2. **Palette-to-graph role assignment** — Users drag predefined roles from a palette onto the graph canvas (NOT freeform node creation)
3. **Linear/Vercel aesthetic** — Clean, minimal, generous whitespace, professional polish
4. **Event-driven core preserved** — RunEvent[] → projectRun() → RunProjection remains the source of truth
5. **Progressive disclosure** — Essential info at a glance, details on demand

---

## Architecture

### Data Flow (unchanged core + new adapter layer)
```
                                                              → toFlowNodes(p)  → React Flow
RunEvent[] → projectRun() → RunProjection ─┤
             (PRESERVED)                    → toMessages(p, events) → Conversation Panel
```
Note: `events` comes from `runMap[activeRunId]` — threaded through App.tsx wiring in Phase 4.

**Replay:** Explicitly deferred. The deep interview spec confirmed "No replay functionality required (droppable feature)." The event-sourcing core is preserved, so replay can be re-added later by slicing events at a cursor — the architectural foundation remains intact.

### Files Preserved (no changes)
- `src/shared/contracts/types.ts` — Event types, projections, PREDEFINED_ROLES
- `src/server/events/projectRun.ts` — Pure projection reducer (242 lines)
- `src/server/events/storage.ts` — Append + persist + validation (84 lines)
- `src/server/orchestrator/scenario.ts` — Scenario builder (227 lines)

### New Files
```
src/
├── lib/
│   ├── adapters.ts              # toFlowNodes(), toMessages() — view adapters
│   └── utils.ts                 # cn() utility for shadcn/ui
├── hooks/
│   ├── use-run-store.ts         # Persistent: runMap, activeRunId, commitRunSnapshot
│   └── use-live-drain.ts        # Ephemeral: liveRunId, queue, appendNextLiveEvent timer
├── components/
│   ├── layout/
│   │   └── app-shell.tsx        # 2-panel resizable (react-resizable-panels)
│   ├── graph/
│   │   ├── flow-graph.tsx       # React Flow canvas with custom node type
│   │   ├── agent-node.tsx       # Custom React Flow node: role icon, label, status
│   │   └── role-palette.tsx     # Draggable predefined role chips (5 roles)
│   └── conversation/
│       ├── conversation-panel.tsx  # Message list + scroll-to-bottom
│       ├── message-bubble.tsx      # Agent message with role avatar & color
│       ├── handoff-message.tsx     # Agent-to-agent handoff visual
│       ├── approval-card.tsx       # Inline Approve/Reject card
│       ├── system-message.tsx      # System events (run started/completed)
│       └── task-input.tsx          # Task description + "Start dispatch" button
├── app/
│   └── App.tsx                  # <100 lines, wiring only
└── main.tsx                     # Entry point (unchanged)
```

### Surface Mapping (4 current surfaces → 2 panels)

| Current Surface | New Location | How |
|----------------|-------------|-----|
| Task Console (left rail) | Conversation panel — `task-input.tsx` at top | Task textarea + dispatch button above the message stream |
| Live Flow Graph (center) | Graph panel — `flow-graph.tsx` | Interactive React Flow canvas with `role-palette.tsx` toolbar |
| Head Agent Panel (right rail) | Conversation panel — messages | Head agent decisions appear as messages in the conversation stream |
| Trace Timeline (bottom) | Conversation panel — messages | Timeline events become the conversation message stream itself |
| Approval Card | Conversation panel — `approval-card.tsx` | Inline interactive card in the message stream |

### Adapter Type Contracts

```typescript
// adapters.ts

import type { Node, Edge } from "@xyflow/react";
import type { RunProjection, AgentProjection } from "../shared/contracts/types";

interface AgentNodeData {
  label: string;
  role: string;
  status: AgentStatus;
  hue: string;
  currentTask: string;
  isActive: boolean;
}

// Converts projection agents + handoffs into React Flow nodes and edges
function toFlowNodes(projection: RunProjection): {
  nodes: Node<AgentNodeData>[];
  edges: Edge[];
}

type MessageType = "system" | "agent_output" | "handoff" | "approval_request" | "approval_response";

interface ConversationMessage {
  id: string;
  timestamp: string;
  type: MessageType;
  agentId: string;
  agentLabel: string;
  agentHue: string;
  content: string;
  metadata?: Record<string, unknown>; // approval details, handoff info, etc.
}

// Converts projection events into a chronological message stream
// Sources: outputs → agent_output, handoffs → handoff, approval → approval_request/response
// System messages: run_created, plan_created, run_completed
function toMessages(projection: RunProjection, events: RunEvent[]): ConversationMessage[]
```

### Hook Boundaries

```typescript
// use-run-store.ts — PERSISTENT state (localStorage-backed)
// Owns: runMap, activeRunId
// Exposes: commitRunSnapshot(runId, events), handleSelectRun(runId), catalog
// Dependencies: none

// use-live-drain.ts — EPHEMERAL state (live run lifecycle)
// Owns: liveRunId, queue
// Exposes: handleStartRun(task, roleIds), handleResolveApproval(decision)
// Dependencies: takes commitRunSnapshot from use-run-store
// Contains: LIVE_TICK_MS timer, appendNextLiveEvent logic
```

---

## Implementation Phases

### Phase 1: Project Setup (~30 min)
**Files:** `package.json`, `tailwind.config.ts`, `postcss.config.js`, `src/lib/utils.ts`, `components.json`

1. `npm install tailwindcss @tailwindcss/vite` + configure in `vite.config.ts`
2. `npx shadcn@latest init` — sets up components.json, utils.ts, CSS variables
3. `npm install @xyflow/react react-resizable-panels`
4. Install shadcn/ui components: `npx shadcn@latest add button card badge input textarea scroll-area separator tooltip avatar`
5. Remove `src/styles.css`, replace with Tailwind globals in `src/index.css`
6. Configure custom theme: Inter font, neutral/slate palette, indigo-600 accent

**Verification:** `npm run build` passes. `npm run dev` shows blank app with Tailwind working.

### Phase 2: Adapters + Hook Refactoring (~1 hour)
**Files:** `src/lib/adapters.ts`, `src/hooks/use-run-store.ts`, `src/hooks/use-live-drain.ts`

1. Write `toFlowNodes(projection)` — maps agents to React Flow nodes with auto-layout, handoffs to edges
2. Write `toMessages(projection, events)` — maps events to ConversationMessage[] chronologically
3. Extract `use-run-store.ts` from App.tsx lines 74-78, 83, 165-171, 207-212
4. Extract `use-live-drain.ts` from App.tsx lines 79-81, 96-127, 173-205
5. Write unit tests for both adapter functions

**Verification:** 
- `toFlowNodes` test: given a RunProjection with 3 agents and 2 handoffs, returns 3 nodes and 2 edges with correct data
- `toMessages` test: given events from `buildRunScenario`, returns messages in sequence with correct types
- Existing `projectRun.test.ts` still passes unchanged

### Phase 3: Components (parallel tracks)

**Track A: Graph Components (~2 hours)**
Files: `src/components/graph/flow-graph.tsx`, `agent-node.tsx`, `role-palette.tsx`

1. `agent-node.tsx` — Custom React Flow node: shadcn Card with role avatar (colored circle), label, status Badge, current task text
2. `role-palette.tsx` — Horizontal toolbar with 5 draggable role chips from `PREDEFINED_ROLES`. Drag a chip onto the canvas to "assign" that role. Uses React Flow's drag-to-add pattern.
3. `flow-graph.tsx` — React Flow canvas consuming `toFlowNodes()` output. Auto-layout with dagre or elkjs. Animated edges during active handoffs. Zoom/pan enabled.

**Verification:** Render graph with mock RunProjection. Nodes display with correct colors. Dragging a role from palette adds it to the canvas.

**Track B: Conversation Components (~2 hours)**
Files: `src/components/conversation/*.tsx`

1. `message-bubble.tsx` — Role avatar (colored dot + label), content, timestamp. Uses shadcn Card.
2. `handoff-message.tsx` — Compact "CEO Planner → Engineer" with arrow icon, uses muted styling
3. `approval-card.tsx` — shadcn Card with warning border, action label, impact, reason, Approve/Reject Buttons
4. `system-message.tsx` — Centered, muted text for run lifecycle events
5. `task-input.tsx` — Textarea + role checkboxes (simplified) + "Start dispatch" Button
6. `conversation-panel.tsx` — ScrollArea containing message list, auto-scrolls on new messages

**Verification:** Render conversation panel with mock messages. All 5 message types display correctly. Approval card buttons are clickable.

**Track C: Layout Shell (~30 min)**
Files: `src/components/layout/app-shell.tsx`

1. `react-resizable-panels` with two panels: graph (default 60%) + conversation (default 40%)
2. Minimal header: "Signal Atlas" text + phase Badge + approval status Badge
3. Clean white background, subtle panel borders

**Verification:** Panels render side-by-side. Drag handle resizes them. Header shows app name.

### Phase 4: Integration + Polish (~1 hour)
**Files:** `src/app/App.tsx` (rewrite)

1. Wire App.tsx: use-run-store + use-live-drain → adapters → components (<100 lines)
2. Add CSS transitions: message fade-in-up on append (Tailwind `animate-in`)
3. React Flow edge animation: `animated: true` on edges during active handoffs
4. Node pulse: ring animation on active agent node
5. Conversation auto-scroll: `scrollIntoView({ behavior: 'smooth' })` on new messages
6. Empty states: graph shows "Drag roles from the palette to build your agent team", conversation shows "Submit a task to start"

**Verification:** Full end-to-end flow works:
1. Type a task in conversation panel
2. Drag roles onto graph from palette
3. Click "Start dispatch"
4. Messages stream into conversation, graph animates handoffs
5. Approval card appears, click Approve
6. Run completes

### Phase 5: Test Migration + Final Verification
**Files:** `tests/app.test.tsx` (rewrite), adapter tests

1. Rewrite `app.test.tsx` for new component structure. Preserve intent of existing tests:
   - Task input and dispatch button exist and are functional
   - Role assignment works
   - Approval panel shows and resolves correctly
   - Agent status displays correctly
2. `projectRun.test.ts` — passes unchanged (core preserved)
3. Verify all 6 acceptance criteria with manual walkthrough

**Acceptance Criteria Verification:**
| Criterion | How to verify |
|-----------|--------------|
| Interactive flow graph | Drag CEO role from palette → node appears on canvas with teal border + "idle" badge |
| Live conversation flow | Start dispatch → messages appear one-by-one with 550ms intervals, role avatars match PREDEFINED_ROLES hues |
| Inline approval | During awaiting_approval phase, amber-bordered card appears in conversation with working Approve/Reject buttons |
| Polished SaaS aesthetic | Screenshot comparison: consistent Inter font, >=16px base size, neutral palette, shadcn components throughout |
| Information clarity | Graph shows agent topology at a glance. Conversation shows chronological detail. No panel exceeds 5 distinct visual elements. |
| Natural workflow | New user can complete dispatch → observe → approve without instructions (self-test: hide all labels, is flow still clear?) |

---

## Risk Mitigation

| Risk | Mitigation |
|------|-----------|
| React Flow bundle size (~50KB) | Acceptable for desktop-first. Lazy-load if needed later. |
| React Flow styling conflicts with shadcn/ui | Use React Flow's `className` API + Tailwind overrides. Test early in Phase 1. |
| Existing tests break during rewrite | Phase 5 explicitly migrates tests. `projectRun.test.ts` is untouched. Work on a branch. |
| Timer-based drain (550ms) doesn't feel "streaming" | Keep current timer approach — it already works. Future: replace with real SSE/WebSocket when backend exists. |
| Role palette UX unclear | Use React Flow's documented [drag-and-drop example](https://reactflow.dev/examples/interaction/drag-and-drop) as reference implementation. |

---

## Rollback Plan
All work on a feature branch. Current `main` remains functional. If rewrite fails mid-execution, abandon branch and return to main. No destructive changes to existing files until Phase 4 integration.
