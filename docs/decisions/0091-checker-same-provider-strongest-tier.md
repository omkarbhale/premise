# 0091. The checker uses the same provider, a fresh session, the strongest tier

- Status: Accepted
- Scope: The plan
- Date: 2026-11-21
- Decided by: The builders, in the plan of 2026-11-21. The owner did not make this choice.
- Source: Old docs/plan.md, P25 (section 5, "Check").

## Context
- premise uses Claude through the owner's subscription first; other providers come later ([0046](0046-claude-through-the-owners-subscription.md)).
- The check must be independent of the builder ([0030](0030-independent-check.md)).

## Decision
- The checker uses the same provider, in a fresh session, with different instructions, at the strongest model tier.
- A checker that shares the builder's model is a known limit of every checker the prior art found. Reports say so.

## Reason
Claude through the owner's subscription is the only provider for now ([0046](0046-claude-through-the-owners-subscription.md)).

## Alternatives considered
| Alternative | Why rejected |
| --- | --- |
| A second provider | Another subscription or an API key, which spends money. |

## Consequences
- Reports state that the checker shares the builder's model.
- Carried in [build, check and run](../architecture/build-check-run.md); implemented by the [agent runner](../specs/agent-runner.md) and [reporter](../specs/reporter.md) specs.

## Related
[0089](0089-checker-in-a-fresh-session.md), [0104](0104-model-tier-by-role.md), [0107](0107-one-part-knows-the-runtime.md).
