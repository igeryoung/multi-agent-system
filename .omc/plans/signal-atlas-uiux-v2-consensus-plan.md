# Signal Atlas UI/UX v2 — Consensus Plan

## Metadata
- Spec: `.omc/specs/deep-interview-signal-atlas-uiux-v2.md`
- Pipeline: deep-interview (18% ambiguity) → ralplan consensus → autopilot
- Consensus: Planner ✓ → Architect (conditional approve, 3 gaps addressed) → Critic (accept-with-reservations, 2 majors addressed)
- Status: APPROVED (all feedback incorporated)

## RALPLAN-DR Summary

### Principles
1. **Minimal surface change** — Modify existing components; preserve event-sourcing pipeline untouched
2. **Progressive disclosure** — Compact by default, detail on demand (node → drawer)
3. **Pre-run / live separation** — CRUD actions pre-run only; live run is read-only
4. **Leverage React Flow APIs** — Use built-in drag, onNodeClick, onNodesChange

### Decision Drivers
1. Pre-run state: separate `useCanvasAgents` hook (not in useRunStore)
2. Drawer: CSS absolute overlay on right panel with auto-dismiss rules
3. Bridge: explicit `canvasAgentsToRoleIds()` function
4. Node IDs: `draft-${roleId}` (pre-run) vs existing IDs (live)

### ADR: Pre-run Agent State Location

**Decision:** New `useCanvasAgents` hook manages ephemeral pre-run agent state separately from `useRunStore`.

**Drivers:** Event-sourcing pipeline must not change; draft canvas state is ephemeral and should not persist to localStorage.

**Alternatives considered:**
- Extend `useRunStore` with draftAgents — rejected: mixes ephemeral UI state with persisted append-only event data
- useReducer local to FlowGraph — rejected: state needed by App.tsx for drawer and handleStartRun bridge

**Why chosen:** Clean separation matching existing pattern (useRunStore = persistent, useLiveDrain = ephemeral). New hook follows the same ephemeral pattern.

**Consequences:** Two sources of truth for "which agents exist" during pre-run phase. Mitigated by explicit bridge function and transition rules.

**Follow-ups:** Future iteration could model pre-run as draft events within event-sourcing pipeline (additive, not mutative) to eliminate two-world problem.

---

## Implementation Plan

### Phase 1: Compact Node + Draggable (Priority)

**1.1 — `src/components/graph/agent-node.tsx`**
- Remove the "Head/Role" label row (lines 27-35)
- Change `line-clamp-2` → `truncate` on task text (line 49) for single-line display
- Reduce vertical padding: `py-3` → `py-2`
- Head agent differentiator: `border-width: kind === "head" ? 2 : 1` (replaces removed label)
- Keep: role-colored dot, status badge, agent label, truncated task

**1.2 — `src/components/graph/flow-graph.tsx`**
- Change `nodesDraggable={false}` → `nodesDraggable={true}`
- Add `onNodesChange` prop and handler for React Flow drag state management
- Add `onNodeClick?: (nodeId: string) => void` prop, wire to React Flow's `onNodeClick`
- Keep: `nodesConnectable={false}`, zoom/pan settings

### Phase 2: Side Drawer

**2.1 — NEW `src/components/graph/agent-drawer.tsx`**
- Slide-in drawer component, positioned absolute over right panel
- Width: 100% of right panel (replaces conversation visually when open)
- Content: agent label (with hue dot), role name, status badge
- History section: list of per-agent events, each collapsed by default
  - Collapsed: 1-line summary (event type + truncated content)
  - Expanded on click: full text content
- "Remove Agent" button at bottom (disabled when `isLive`)
- Close button (X) in header; also closes on Escape key
- Animation: slide-in from right via CSS transition (transform translateX)

**2.2 — `src/lib/adapters.ts`**
- Add `toAgentHistory(agentId: string, events: RunEvent[], agents: AgentProjection[]): AgentHistoryItem[]`
- Return type `AgentHistoryItem`:
  ```ts
  interface AgentHistoryItem {
    id: string;
    timestamp: string;
    type: "handoff" | "output" | "status_change";
    summary: string;    // 1-line collapsed view
    content: string;    // full text for expanded view
  }
  ```
- Filters events where `actorId === agentId` or event references the agent
- Reuses existing `resolveAgent()` pattern from `toMessages()`

**2.3 — `src/components/layout/app-shell.tsx`**
- Accept new props: `drawerContent: ReactNode | null`
- Render drawer as absolute-positioned overlay inside the right ResizablePanel div
- When `drawerContent` is non-null, render it on top of conversation panel with z-10

**2.4 — `src/app/App.tsx`**
- Add `selectedAgentId` state (string | null)
- Wire `onNodeClick` → `setSelectedAgentId(nodeId)`
- Pass `selectedAgentId` to determine drawer content
- **State ownership:** App.tsx owns `selectedAgentId`. AppShell receives `drawerContent` as a rendered ReactNode.
- **Auto-dismiss rules (3 triggers):**
  1. When `projection.approval.status === "pending"` → close drawer (useEffect)
  2. When `isLive` transitions from false → true → close drawer (useEffect)
  3. When user clicks close button or presses Escape → close drawer

### Phase 3: Canvas Agent CRUD (Pre-run)

**3.1 — NEW `src/hooks/use-canvas-agents.ts`**
```ts
interface UseCanvasAgents {
  canvasAgents: RoleDefinition[];
  addAgent: (roleId: string) => void;
  removeAgent: (roleId: string) => void;
  reset: () => void;
  roleIds: string[];          // canvasAgents.map(a => a.id) — the bridge
  availableRoles: RoleDefinition[];  // PREDEFINED_ROLES minus already-added
}
```
- Initializes empty (blank canvas until user adds agents)
- `addAgent`: looks up PREDEFINED_ROLES by id, appends to canvasAgents
- `removeAgent`: filters out by roleId. **Guard: head agent (`atlas-head`) cannot be removed** (head is always added automatically, not user-managed)
- `reset`: clears all canvas agents
- `roleIds`: computed getter — `canvasAgents.map(a => a.id)` — this is the bridge to `handleStartRun(task, roleIds)`

**3.2 — NEW `src/components/graph/add-agent-button.tsx`**
- "+" button rendered in React Flow `<Panel position="top-left">` overlay
- On click: opens a popover/dropdown listing `availableRoles` from the hook
- Each item shows role-colored dot + label + responsibility
- Clicking an item calls `addAgent(roleId)` and closes the popover
- Hidden when `isLive` (no adding agents during runs)

**3.3 — `src/components/graph/flow-graph.tsx`**
- Accept new props: `extraControls?: ReactNode`
- Render `extraControls` inside a React Flow `<Panel>` component
- App.tsx passes `<AddAgentButton>` as `extraControls` when not live

**3.4 — `src/lib/adapters.ts`**
- Add `toPreRunNodes(canvasAgents: RoleDefinition[]): { nodes: Node<AgentNodeData>[], edges: Edge[] }`
- Generates nodes with ID `draft-${role.id}`, type `agentNode`
- Layout: horizontal spread (same spacing logic as toFlowNodes but without head agent)
- Status: "idle", currentTask: role.responsibility, isActive: false
- Edges: none (no handoffs pre-run)

**3.5 — `src/components/conversation/task-input.tsx`**
- **Remove RolePalette** from TaskInput entirely. Canvas is now the sole role-selection mechanism.
- TaskInput retains: task textarea + "Start Dispatch" button only
- `handleSubmit` signature changes: calls `onStartRun(task)` — roleIds come from App.tsx via `useCanvasAgents.roleIds`
- **OR** keep `onStartRun(task, roleIds)` signature but App.tsx wraps it: `(task) => handleStartRun(task, canvasAgents.roleIds)`

**3.6 — `src/app/App.tsx`**
- Import and use `useCanvasAgents` hook
- Determine which nodes to show:
  - Pre-run (`!isLive && projection.phase === "draft"`): use `toPreRunNodes(canvasAgents)`
  - Live/completed: use `toFlowNodes(projection)` (existing)
- Pass `canvasAgents.roleIds` to handleStartRun
- Pass `addAgent`, `removeAgent` to relevant child components
- `onNodeClick` handler:
  - If `nodeId.startsWith("draft-")`: open drawer with role info + remove button
  - Else: open drawer with agent history from `toAgentHistory()`

### Phase 4: Test Updates

**4.1 — `tests/app.test.tsx`**
- Update ReactFlow mock to accept and ignore new props (`onNodeClick`, `onNodesChange`)
- Update `react-resizable-panels` mock if AppShell props changed
- **All 7 existing tests (4 projectRun + 3 app) must pass**
- Note: existing tests mock ReactFlow completely — they validate data flow, not graph interactions. New graph interaction tests are deferred (acknowledged tech debt).

---

## Acceptance Criteria
- [ ] Agent nodes on the canvas are draggable
- [ ] "+" button on canvas opens role selector from PREDEFINED_ROLES
- [ ] Selecting a role creates a new node (ID: `draft-${roleId}`)
- [ ] Clicking a node opens side drawer overlaying conversation panel
- [ ] Drawer shows: agent label, role, status, full history of steps/outputs
- [ ] History items collapsed by default; click expands to full text
- [ ] Drawer has "Remove Agent" action (disabled during live runs)
- [ ] Compact node: role-colored dot, label, status badge, 1-line task
- [ ] Node text truncated to single line
- [ ] Drawer auto-closes when approval is pending
- [ ] Drawer auto-closes when run starts (isLive transitions true)
- [ ] Dismissing drawer (close button/Escape) reveals conversation panel
- [ ] TaskInput no longer contains RolePalette (canvas is sole role selector)
- [ ] All 7 existing tests pass
- [ ] Build succeeds with no TypeScript errors

## Risk Mitigation
| Risk | Mitigation |
|------|-----------|
| Dual role-selection confusion | RolePalette removed from TaskInput; canvas is sole source |
| Drawer hides approval buttons | Auto-dismiss on approval pending |
| Stale drawer during run start | Auto-dismiss when isLive transitions |
| Pre-run/live node ID collision | Namespace: `draft-` prefix vs existing IDs |
| Head agent accidentally removed | Guard in useCanvasAgents prevents removal |
| Two-world state complexity | Acknowledged tech debt; future: draft events in pipeline |
