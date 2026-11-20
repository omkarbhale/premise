# 0098. A short report each time a change reaches running

- Status: Accepted
- Scope: The plan
- Date: 2026-11-21
- Decided by: The builders, in the plan of 2026-11-21. The owner did not make this choice.
- Source: Old docs/plan.md, P32 (section 6, "Reporting").

## Context
- Reporting has a product default ([0012](0012-reporting-with-a-product-default.md)).
- For premise's own building, the owner chose one short report per finished milestone and an immediate message only when something needs the owner ([0054](0054-reports-to-the-owner.md)).

## Decision
A short report each time a change reaches running; an immediate notice only when someone is needed.

## Reason
It is the rhythm the owner chose for premise's own building ([0054](0054-reports-to-the-owner.md)).

## Alternatives considered
| Alternative | Why rejected |
| --- | --- |
| A report per task | Noise. |
| Reports only when asked | The plan gives no further reason. |

## Consequences
- The report view is always current: decided, running, needed, failed or not checked, cost.
- Carried in [intake and reporting](../architecture/intake-and-reporting.md); implemented by the [reporter](../specs/reporter.md) spec.

## Related
[0097](0097-reports-from-recorded-facts.md), [0099](0099-notices-in-the-session.md).
