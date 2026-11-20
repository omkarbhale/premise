# 0107. The agent runner is the only part that knows the runtime and provider

- Status: Accepted
- Scope: The plan
- Date: 2026-11-21
- Decided by: The builders, in the plan of 2026-11-21. The owner did not make this choice.
- Source: Old docs/plan.md, P41 (section 7, "Models").

## Context
- Claude through the owner's subscription first; other model providers come later ([0046](0046-claude-through-the-owners-subscription.md)).

## Decision
- The agent runner is the only part that knows which agent runtime and provider are used.
- Other parts ask for "an agent with these tools, in this working copy".
- When the subscription's usage limit is reached, Claude Code reports rate-limit retries. The agent runner pauses the queue until the limit resets, and the report says so. premise never turns on paid extra usage.

## Reason
Other providers come later ([0046](0046-claude-through-the-owners-subscription.md)); adding one then changes only the runner.

## Alternatives considered
| Alternative | Why rejected |
| --- | --- |
| Claude Code details spread through premise | Adding a provider would change more than the runner. |

## Consequences
- Milestone 5 adds each person's own model access and other providers if needed, through this part ([roadmap](../product/roadmap.md)).
- Carried in [models and cost](../architecture/models-and-cost.md); implemented by the [agent runner](../specs/agent-runner.md) spec.

## Related
[0071](0071-headless-claude-code-agents.md), [0103](0103-subscription-only-for-the-owner.md).
