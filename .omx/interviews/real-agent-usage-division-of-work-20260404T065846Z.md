# Deep Interview Transcript Summary

- Profile: standard
- Context type: brownfield
- Interview ID: 8F82C722-2786-44FB-A5F1-A8E60B64F9B1
- Final ambiguity: 0.091
- Threshold: 0.200
- Context snapshot: `.omx/context/real-agent-usage-division-of-work-20260404T065846Z.md`

## Summary

The user wants the existing v1 multi-agent demo to evolve toward real agent usage, but in a staged way. This milestone is not full multi-agent execution. It is a contract-first milestone where the head node becomes real enough to generate a structured plan, workflow pipeline, and context-engineered per-agent task packets from the session's selected canvas agents, while remaining the only user-facing node.

Internal collaboration rules are intentionally more flexible than the current scripted sequential demo. Agents may message each other directly, but the head node is still the single operator-facing surface. By default, the head receives only final outputs and explicit blockers, unless the plan marks some agents as required intermediate reporters. In this milestone, only the head node may use local Codex via `tmux`, and current subagents remain proof-of-concept task viewers rather than real executors.

## Condensed Transcript

### Round 1
- Q: Which milestone comes first: real execution, contract-first, or both?
- A: Contract-first comes first.

### Round 2
- Q: What must the head node produce in that milestone?
- A: Structured plan, per-agent task packet, explicit handoff chain, head-only user summary, agent discovery from current env, and agent-to-agent direct messaging.

### Round 3
- Q: If agents can message each other directly, what rule should apply?
- A: Agents may message each other directly, but only the head node may talk to the user.

### Round 4
- Q: What must the head still receive from direct collaboration?
- A: Typically only final outputs plus explicit blockers, unless the workflow plan requires some nodes to return intermediate results.

### Round 5
- Q: What is explicitly not in this milestone?
- A: No real subagent invocation, no auto-retry/failure recovery policy, no token/cost budgeting, and no approval gate redesign.

### Round 6
- Q: What proof signals make the milestone done?
- A: Local Codex via `tmux` is required now; submitting one task should produce a structured plan, workflow pipeline, and per-agent tasks; the task assignment format should follow context-engineering best practice; each subtask should be viewable as task input.

### Round 7
- Q: Resolve the contradiction between “no real subagent invocation” and “Codex via tmux required now.”
- A: Only the head node may run local Codex via `tmux`; subagents remain task-display PoC nodes.

### Round 8
- Q: What does “agent discovery from current env” mean in this app?
- A: Only the agents currently placed or selected on the canvas for this session.

## Pressure-Pass Finding

The biggest hidden contradiction was execution scope. The user initially excluded real subagent invocation, then later required local Codex via `tmux`. The clarified resolution is narrow and important: only the head node gets live local Codex `tmux` execution in this milestone, while subagents remain non-executing task viewers. That preserves the contract-first goal without turning this into full multi-agent runtime delivery.
