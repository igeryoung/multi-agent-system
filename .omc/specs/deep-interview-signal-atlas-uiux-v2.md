# Deep Interview Spec: Signal Atlas UI/UX Update v2

## Metadata
- Interview ID: sa-uiux-v2-20260403
- Rounds: 5
- Final Ambiguity Score: 18%
- Type: brownfield
- Generated: 2026-04-03
- Threshold: 20%
- Status: PASSED

## Clarity Breakdown
| Dimension | Score | Weight | Weighted |
|-----------|-------|--------|----------|
| Goal Clarity | 0.95 | 0.35 | 0.333 |
| Constraint Clarity | 0.70 | 0.25 | 0.175 |
| Success Criteria | 0.75 | 0.25 | 0.188 |
| Context Clarity | 0.85 | 0.15 | 0.128 |
| **Total Clarity** | | | **0.823** |
| **Ambiguity** | | | **17.7%** |

## Goal
Enhance Signal Atlas's graph canvas with three interaction improvements: (1) make agent nodes draggable for user-defined layouts, (2) move agent creation/removal from the right-panel TaskInput to the graph canvas via an add button and node-click drawer, and (3) compact node cards to show only label + status + 1-line task summary, with full agent history accessible via a side drawer that overlays the conversation panel.

## Constraints
- **Pre-run only for CRUD**: Agent creation and removal happens before a run starts. No dynamic agent mutation during live runs.
- **Preserve existing layout**: 2-panel resizable layout (graph left, conversation right) stays. Drawer overlays the conversation panel temporarily.
- **Preserve event-sourcing architecture**: RunEvent[], projectRun(), RunProjection pipeline unchanged.
- **Preserve existing conversation panel**: It continues to show messages, approvals, system events. Drawer is an overlay, not a replacement.
- **During live runs**: Nodes are still clickable to open the drawer (read-only history view), but no add/remove actions.
- **Technology**: React Flow (@xyflow/react) already in use — leverage its built-in drag, selection, and node-click APIs.

## Non-Goals
- Dynamic agent creation/removal during a live run
- Replacing the conversation panel with the drawer
- Changing the event model or projection reducer
- Real AI agent integration (stays simulated)

## Acceptance Criteria
- [ ] Agent nodes on the canvas are draggable (user can reposition them freely)
- [ ] A "+" button exists on the graph canvas that opens a role selector (from PREDEFINED_ROLES)
- [ ] Selecting a role from the "+" menu creates a new agent node on the canvas
- [ ] Clicking an agent node opens a side drawer that overlays the conversation panel
- [ ] The side drawer shows: agent label, role, status, full history of steps/outputs
- [ ] Each history item in the drawer is collapsed by default; clicking expands to show full text
- [ ] The drawer includes a "Remove Agent" action (disabled during live runs)
- [ ] Compact node card shows: role-colored dot, agent label, status badge, and 1-line task summary
- [ ] Node summary text is truncated to a single line (no multi-line overflow)
- [ ] Dismissing the drawer (click outside or close button) reveals the conversation panel again
- [ ] All 3 existing app.test.tsx tests continue to pass
- [ ] Build succeeds with no TypeScript errors

## Assumptions Exposed & Resolved
| Assumption | Challenge | Resolution |
|------------|-----------|------------|
| Agent CRUD is during runs | "Pre-run or dynamic?" | Pre-run only — no event model changes |
| Detail view is inline on canvas | "Inline expand, drawer, or popover?" | Side drawer overlaying conversation panel |
| Conversation panel is replaced | "What happens to conversation when drawer opens?" | Conversation stays; drawer overlays it |
| Current node design is too verbose | "How compact?" | Label + status + 1-line task (down from 2-line) |
| All 3 features equally important | "If you could only ship one?" | Summarized blocks + detail drawer is #1 priority |

## Technical Context (Brownfield)
- **Graph component**: `src/components/graph/flow-graph.tsx` — currently `nodesDraggable={false}`, needs to become `true`
- **Agent node**: `src/components/graph/agent-node.tsx` — 190px card, needs compacting to 1-line task
- **Role palette**: `src/components/graph/role-palette.tsx` — horizontal role chips, currently in TaskInput (right panel)
- **Adapters**: `src/lib/adapters.ts` — `toFlowNodes()` creates nodes from RunProjection, needs to support user-added pre-run nodes
- **Types**: `src/shared/contracts/types.ts` — PREDEFINED_ROLES array, AgentProjection interface
- **Scenario**: `src/server/orchestrator/scenario.ts` — `buildRunScenario()` currently receives roleIds from TaskInput
- **Hooks**: `use-run-store.ts` (persistent), `use-live-drain.ts` (ephemeral) — may need pre-run agent state
- **New components needed**: Side drawer component, "+" add-agent button/popover on canvas, collapsible history items in drawer

## Ontology (Key Entities)

| Entity | Type | Fields | Relationships |
|--------|------|--------|---------------|
| Agent Node | core domain | label, role, status, hue, currentTask, isActive, kind | Displayed on Graph Canvas; detail in Side Drawer |
| Graph Canvas | core UI | nodes[], edges[], draggable, zoomRange | Contains Agent Nodes; has Add Button |
| Node Summary | supporting | label, statusBadge, 1-line taskText | Compact view of Agent Node on canvas |
| Side Drawer | core UI | agentId, history[], isOpen, removeAction | Overlays Conversation Panel; shows Agent Node detail |
| Conversation Panel | core UI | messages[], scrollPosition | Right panel; overlaid by Side Drawer when open |

## Ontology Convergence
| Round | Entity Count | New | Changed | Stable | Stability Ratio |
|-------|-------------|-----|---------|--------|----------------|
| 1 | 4 | 4 | - | - | N/A |
| 2 | 5 | 1 | 1 | 3 | 80% |
| 3 | 5 | 0 | 0 | 5 | 100% |
| 4 | 5 | 0 | 0 | 5 | 100% |
| 5 | 5 | 0 | 0 | 5 | 100% |

## Interview Transcript
<details>
<summary>Full Q&A (5 rounds)</summary>

### Round 1
**Q:** Currently agents are created before a run starts (you pick roles in TaskInput, then hit 'Start Dispatch'). When you say 'create/remove agent in main area', do you mean moving that pre-run role selection onto the graph canvas, or do you want the ability to add/remove agents dynamically DURING a live run?
**A:** Pre-run only (move to canvas)
**Ambiguity:** 49% (Goal: 0.70, Constraints: 0.35, Criteria: 0.25, Context: 0.75)

### Round 2
**Q:** When a user clicks an agent block on the canvas to see its history/detail text, what should happen visually?
**A:** Side drawer / panel — Clicking a node opens a detail panel that slides over the conversation panel. The node stays compact on the canvas.
**Ambiguity:** 43% (Goal: 0.80, Constraints: 0.40, Criteria: 0.30, Context: 0.80)

### Round 3
**Q:** The right panel currently shows the conversation log (agent messages, approvals, system events). When the agent-detail side drawer opens, what happens to the conversation panel?
**A:** Drawer overlays conversation — Conversation stays. Drawer slides over it temporarily. Dismiss drawer to see conversation again.
**Ambiguity:** 34% (Goal: 0.85, Constraints: 0.60, Criteria: 0.35, Context: 0.85)

### Round 4 (Contrarian mode)
**Q:** If you could only ship ONE of these three features (drag, canvas CRUD, summarized blocks), which one matters most — and what specific moment in the UI would make you say 'yes, this is exactly what I wanted'?
**A:** Summarized blocks + detail — The moment I see a clean, compact node on the canvas and can click to reveal full agent history in a drawer.
**Ambiguity:** 25% (Goal: 0.88, Constraints: 0.65, Criteria: 0.60, Context: 0.85)

### Round 5
**Q:** On the compact agent node (before clicking to open the drawer), what should be visible?
**A:** Label + status + 1-line task — Agent name, status, and a single-line summary of current work.
**Ambiguity:** 18% (Goal: 0.95, Constraints: 0.70, Criteria: 0.75, Context: 0.85)

</details>
