# 0071. Agents are Claude Code run headless, as child processes

- Status: Accepted
- Scope: The plan
- Date: 2026-11-21
- Decided by: The builders, in the plan of 2026-11-21. The owner did not make this choice.
- Source: Old docs/plan.md, P5 (section 1, "The parts and how they talk").

## Context
- premise uses Claude through the owner's subscription first ([0046](0046-claude-through-the-owners-subscription.md)).
- premise may be built on other tools underneath, as long as nobody has to use them alongside it ([0063](0063-premise-may-depend-on-other-tools.md)).
- Each agent has a role, instructions that ship with premise, and only the tools its role needs.

## Decision
- Agents are Claude Code run headless (`claude -p` with streamed JSON output), as child processes of the server.
- The server reads each agent's streamed JSON events.

## Reason
- It is Claude Code's documented way to be scripted, and it runs on the owner's own subscription login.
- One process per agent makes limits, confinement and stopping simple.

## Alternatives considered
| Alternative | Why rejected |
| --- | --- |
| The Claude Agent SDK package | Its documentation says products built on it should not offer claude.ai login unless approved, and should use API keys, which spend money. Revisit with P37 ([0103](0103-subscription-only-for-the-owner.md)). |
| Calling the Messages API directly | Needs an API key, and premise would rebuild tools Claude Code already has. |

## Consequences
- The Agent SDK choice is to be revisited together with [0103](0103-subscription-only-for-the-owner.md).
- Milestone 1, step 1 proves this works unattended on the owner's subscription; if it cannot be proven, work stops for the owner ([roadmap](../product/roadmap.md)).
- Carried in [architecture overview](../architecture/overview.md); implemented by the [agent runner](../specs/agent-runner.md) spec.

## Related
[0067](0067-one-process-agents-as-children.md), [0076](0076-own-claude-code-configuration.md), [0107](0107-one-part-knows-the-runtime.md).
