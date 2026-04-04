# Deep Interview Spec: Signal Atlas UI/UX Total Renewal

## Metadata
- Interview ID: di-signal-atlas-uiux-2026-04-03
- Rounds: 11
- Final Ambiguity Score: 18%
- Type: brownfield (full rewrite)
- Generated: 2026-04-03
- Threshold: 20%
- Status: PASSED

## Clarity Breakdown
| Dimension | Score | Weight | Weighted |
|-----------|-------|--------|----------|
| Goal Clarity | 0.90 | 0.35 | 0.315 |
| Constraint Clarity | 0.70 | 0.25 | 0.175 |
| Success Criteria | 0.90 | 0.25 | 0.225 |
| Context Clarity | 0.70 | 0.15 | 0.105 |
| **Total Clarity** | | | **0.82** |
| **Ambiguity** | | | **18%** |

## Goal

Completely rewrite Signal Atlas as a **2-panel, chat-primary multi-agent command workspace** with a **clean modern SaaS aesthetic** (Linear/Vercel style). The left/main panel is an **interactive flow graph** where users create agent nodes, assign roles, and watch real-time collaboration. The right panel is an **agent conversation log** showing real-time agent messages, handoffs, and inline approval interactions. The core UX moment is **"it's alive"** — watching agents collaborate with messages flowing in the conversation log while the graph animates handoffs between nodes.

## Constraints
- **Full rewrite** — UI, data model, and architecture rebuilt from scratch
- **Tech stack**: React 19 + Vite + TypeScript (keep), add **shadcn/ui + Tailwind CSS** for polished SaaS components
- **2-panel layout**: Interactive flow graph (main) + Agent conversation log (side)
- **No replay functionality** required (droppable feature)
- **No external state management** library required (React hooks sufficient)
- **localStorage persistence** can be rebuilt or replaced as needed
- **Desktop-first** (no explicit mobile requirement stated)

## Non-Goals
- Mobile/responsive design (not discussed, not required)
- Replay/playback functionality (explicitly droppable)
- Dark mode (not requested — clean light SaaS aesthetic)
- Real backend/API integration (current app uses simulated scenarios)
- Multi-user/collaboration features

## Acceptance Criteria
- [ ] **Interactive flow graph**: User can create agent nodes, assign roles (CEO, Engineer, QA, Reviewer, Writer), and connect them visually. Nodes show real-time status (idle/active/completed) with smooth transitions and color-coded role indicators.
- [ ] **Live conversation flow**: After dispatch, agent messages appear in the conversation log with streaming feel. Each message shows the agent's role icon/color, content, and timestamp. Handoffs between agents are visible as distinct messages in the log.
- [ ] **Inline approval**: When an agent requests approval for a gated action, it appears as an interactive card in the conversation log with action details (label, impact, reason) and Approve/Reject buttons — no separate panel needed.
- [ ] **Polished SaaS aesthetic**: Consistent typography (clean sans-serif), generous whitespace, subtle shadows, professional color palette. Passes the "screenshot test" — looks like it belongs next to Linear or Vercel dashboard. Uses shadcn/ui components for buttons, cards, inputs, badges.
- [ ] **Information clarity**: Agent status, task progress, and handoffs are instantly understandable at a glance from both the graph and conversation panels. No cognitive overload.
- [ ] **Natural workflow**: The dispatch → observe → approve flow feels intuitive. Creating agents in the graph, starting a run, and interacting through the conversation log requires no explanation.

## Assumptions Exposed & Resolved
| Assumption | Challenge | Resolution |
|------------|-----------|------------|
| Current 3-column layout is the right structure | Asked if layout should change | User chose 2-panel (graph + chat) over keeping 3-column |
| Chatbox means a ChatGPT-style input | Challenged: chat linearizes parallel agent work | User confirmed chat is primary, but for agent conversation log, not task dispatch UI |
| All current features must survive | Simplifier mode: which features are actually necessary? | Flow graph and role assignment must stay; replay is droppable |
| UI-only redesign over existing data layer | Asked about scope depth | User chose full rewrite — UI, data model, and architecture |
| Scale requirement (10K users) assumed | Contrarian challenge on core assumptions | Not relevant — this is a local prototype/demo |
| Role chips are checkboxes | User clarified | Role assignment should be node creation in the graph, not checkboxes |

## Technical Context
### Current State (being replaced)
- React 19 + Vite + TypeScript SPA (~1,240 lines TS, 406 lines CSS)
- Custom CSS design system with frosted glass cards, teal/sand palette
- Event-driven architecture: 9 event types, projection system, localStorage
- SVG-based static flow graph (display only, not interactive)
- No external UI library

### Target State
- React 19 + Vite + TypeScript (keep toolchain)
- **shadcn/ui + Tailwind CSS** for component library and styling
- **Interactive flow graph** with node creation, role assignment, drag/connect
- **Conversation log panel** with streaming messages, inline approvals
- New data model supporting conversation-style events
- Clean modern SaaS aesthetic (light theme, whitespace, subtle shadows)

### Key Files to Replace
| Current File | Lines | Action |
|-------------|-------|--------|
| `src/app/App.tsx` | 499 | Full rewrite — new 2-panel layout |
| `src/styles.css` | 406 | Replace with Tailwind + shadcn/ui theming |
| `src/shared/contracts/types.ts` | 160 | Rewrite — new data model for conversation + graph |
| `src/server/events/projectRun.ts` | 242 | Rewrite — new projection for conversation model |
| `src/server/events/storage.ts` | 84 | Rewrite or replace persistence layer |
| `src/server/orchestrator/scenario.ts` | 227 | Rewrite — scenarios produce conversation events |

## Ontology (Key Entities)

| Entity | Type | Fields | Relationships |
|--------|------|--------|---------------|
| Signal Atlas | core domain | name, version | Root app container |
| Agent Node | core domain | role, status (idle/active/completed), hue, position, currentTask | Created in Flow Graph, messages in Conversation Log |
| Task | core domain | description, phase, status | Dispatched to Agent Nodes |
| Flow Graph | core UI | nodes[], edges[], interactive (create/connect/animate) | Users build agent topology, shows real-time handoff animations |
| Agent Conversation Log | core UI | messages[], input field | Streams agent messages, user commands, inline approvals |
| Approval Gate | supporting | action, impact, reason, status (pending/approved/rejected) | Rendered as interactive card in Conversation Log |
| Timeline Event | supporting | sequence, timestamp, actor, type, summary | Underlies Conversation Log messages |

## Ontology Convergence

| Round | Entity Count | New | Changed | Stable | Stability Ratio |
|-------|-------------|-----|---------|--------|----------------|
| 1 | 6 | 6 | - | - | N/A |
| 2 | 6 | 0 | 0 | 6 | 100% |
| 4 | 7 | 1 | 0 | 6 | 86% |
| 7 | 7 | 0 | 1 | 5 | 86% |
| 8 | 7 | 0 | 1 | 6 | 100% |
| 11 | 7 | 0 | 0 | 7 | 100% |

Entities stabilized by Round 8 and remained fully converged through completion.

## Interview Transcript
<details>
<summary>Full Q&A (11 rounds)</summary>

### Round 1
**Q:** When you look at the current Signal Atlas UI and think "this sucks", what specifically frustrates you the most?
**A:** All of the above — visual aesthetics, layout, and interaction all need to change. Ground-up redesign.
**Ambiguity:** 77% (Goal: 0.30, Constraints: 0.10, Criteria: 0.10, Context: 0.50)

### Round 2
**Q:** What kind of visual feel should the new Signal Atlas have?
**A:** Clean & modern SaaS — like Linear, Vercel dashboard, or Notion. Light backgrounds, generous whitespace, subtle shadows.
**Ambiguity:** 68% (Goal: 0.50, Constraints: 0.10, Criteria: 0.20, Context: 0.50)

### Round 3
**Q:** Should we keep pure CSS or adopt a component library?
**A:** Don't care, you decide.
**Ambiguity:** 59% (Goal: 0.50, Constraints: 0.40, Criteria: 0.20, Context: 0.55)

### Round 4
**Q:** What should change about the 3-column layout and information architecture?
**A:** Simplify to 2-panel: main content area + chatbox.
**Ambiguity:** 54% (Goal: 0.65, Constraints: 0.40, Criteria: 0.20, Context: 0.55)

### Round 5 (Contrarian Mode)
**Q:** A chat interface linearizes parallel agent work. What role should the chatbox play?
**A:** Chat is primary — dispatch, see agent responses, approve actions all through conversation. Main area shows status/graph as secondary context.
**Ambiguity:** 49% (Goal: 0.75, Constraints: 0.40, Criteria: 0.25, Context: 0.60)

### Round 6 (Simplifier Mode)
**Q:** Which current features MUST survive the redesign?
**A:** SVG flow graph and role chip selection must stay — but role selection should be node creation/assignment in the main area graph. Chatbox concept doesn't meet expectations yet.
**Ambiguity:** 42% (Goal: 0.75, Constraints: 0.55, Criteria: 0.50, Context: 0.60)

### Round 7
**Q:** The main area is an interactive flow graph. What should the second panel actually do?
**A:** Agent conversation log — real-time messages from agents as they work, user can type commands/approvals. Like a group chat between agents.
**Ambiguity:** 40% (Goal: 0.70, Constraints: 0.55, Criteria: 0.50, Context: 0.60)

### Round 8
**Q:** What should the chatbox/second panel actually be?
**A:** Agent conversation log — real-time messages, commands, approvals.
**Ambiguity:** 34% (Goal: 0.85, Constraints: 0.55, Criteria: 0.50, Context: 0.65)

### Round 9 (Ontologist Mode)
**Q:** What's the ONE core moment that must feel perfect?
**A:** Watching agents collaborate — messages flowing in the conversation log while the graph animates handoffs. The "it's alive" moment.
**Ambiguity:** 29% (Goal: 0.85, Constraints: 0.55, Criteria: 0.70, Context: 0.65)

### Round 10
**Q:** Is this a UI-only redesign or should the data architecture change too?
**A:** Full rewrite — rebuild everything from scratch.
**Ambiguity:** 25% (Goal: 0.85, Constraints: 0.70, Criteria: 0.70, Context: 0.70)

### Round 11
**Q:** Which concrete acceptance criteria capture "done"?
**A:** All four: interactive graph, live conversation flows, inline approval in chat, polished SaaS aesthetic.
**Ambiguity:** 18% (Goal: 0.90, Constraints: 0.70, Criteria: 0.90, Context: 0.70)

</details>
