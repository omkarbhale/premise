# 0103. The owner's subscription only through Claude Code, for the owner's own use

- Status: Accepted
- Scope: The plan
- Date: 2026-11-21
- Decided by: The builders, in the plan of 2026-11-21. The owner did not make this choice.
- Source: Old docs/plan.md, P37 (section 7, "Models").

## Context
- The owner approved use of the owner's subscription ([0046](0046-claude-through-the-owners-subscription.md)).
- All LLM work goes through the agent runner, which runs Claude Code on that subscription ([0071](0071-headless-claude-code-agents.md), [0076](0076-own-claude-code-configuration.md)).
- Other people setting premise up comes sooner than other later items ([0033](0033-answers-to-the-ten-assumptions.md), item 7).

## Decision
- The owner's subscription is used only through Anthropic's own Claude Code, logged in as the owner, on the owner's machine, for the owner's own use.
- premise never offers that login to anyone else.
- So other people who set premise up bring their own model access, such as an API key. On the owner's account that spends money, so it waits for the owner ([0053](0053-when-work-stops-for-the-owner.md)).

## Reason
The owner approved subscription use ([0046](0046-claude-through-the-owners-subscription.md)). Anthropic's Agent SDK documentation says products may not offer claude.ai login unless approved.

## Alternatives considered
| Alternative | Why rejected |
| --- | --- |
| Sharing the owner's login with other people's setups of premise | Products may not offer claude.ai login unless approved. |

## Consequences
- Milestone 1 step 1, point 8: the use stays within this record; if it cannot be proven, work stops for the owner ([roadmap](../product/roadmap.md)).
- [0071](0071-headless-claude-code-agents.md)'s rejection of the Agent SDK is revisited with this record.
- Carried in [models and cost](../architecture/models-and-cost.md); implemented by the [agent runner](../specs/agent-runner.md) spec.

## Related
[0107](0107-one-part-knows-the-runtime.md), [0100](0100-floor-actions.md).
