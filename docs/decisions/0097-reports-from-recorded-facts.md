# 0097. Reports are built from recorded facts only

- Status: Accepted
- Scope: The plan
- Date: 2026-11-21
- Decided by: The builders, in the plan of 2026-11-21. The owner did not make this choice.
- Source: Old docs/plan.md, P31 (section 6, "Reporting").

## Context
- A false report is on the floor ([0056](0056-what-is-on-the-floor.md)); the product reports honestly, including what failed and what it could not check ([0014](0014-guard-against-further-big-mistakes.md)).

## Decision
- Reports are built from recorded facts only: check verdicts, job outcomes, gate decisions, usage-ledger figures.
- Every line links to its evidence.
- No agent's account of its own work is a source.

## Reason
A false report is on the floor ([0056](0056-what-is-on-the-floor.md)), and self-reports were the source of the prior art's false reports.

## Alternatives considered
| Alternative | Why rejected |
| --- | --- |
| Reports written from agents' summaries | Self-reports were the source of the prior art's false reports. |

## Consequences
- False reports are prevented by this rule rather than asked about at the gate ([0100](0100-floor-actions.md)).
- Carried in [intake and reporting](../architecture/intake-and-reporting.md); implemented by the [reporter](../specs/reporter.md) spec.

## Related
[0012](0012-reporting-with-a-product-default.md), [0089](0089-checker-in-a-fresh-session.md), [0098](0098-report-when-a-change-reaches-running.md).
