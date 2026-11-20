# 0105. Models named by tier aliases, not pinned versions

- Status: Accepted
- Scope: The plan
- Date: 2026-11-21
- Decided by: The builders, in the plan of 2026-11-21. The owner did not make this choice.
- Source: Old docs/plan.md, P39 (section 7, "Models").

## Context
- The product is general; a better model makes it better without a rewrite ([0031](0031-the-product-is-general.md)).

## Decision
Models are named by Claude Code's tier aliases, not pinned versions.

## Reason
A better model makes premise better without a change ([0031](0031-the-product-is-general.md)).

## Alternatives considered
| Alternative | Why rejected |
| --- | --- |
| Pinned model versions | A better model would need a change to premise. |

## Consequences
- Carried in [models and cost](../architecture/models-and-cost.md); implemented by the [agent runner](../specs/agent-runner.md) spec.

## Related
[0104](0104-model-tier-by-role.md), [0107](0107-one-part-knows-the-runtime.md).
