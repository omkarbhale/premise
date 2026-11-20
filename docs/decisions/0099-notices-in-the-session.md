# 0099. Notices in the session, the tab count and browser notifications

- Status: Accepted
- Scope: The plan
- Date: 2026-11-21
- Decided by: The builders, in the plan of 2026-11-21. The owner did not make this choice.
- Source: Old docs/plan.md, P33 (section 6, "Reporting").

## Context
- Everything is open in one session; roles are labels on what is asked ([0065](0065-one-open-session.md)).
- Acting publicly in someone's name and spending money are on the floor ([0056](0056-what-is-on-the-floor.md)).

## Decision
Notices are the "needed" list in the session, grouped by role, a count in the browser tab, and browser notifications while the page is open.

## Reason
It needs no outside account and sends nothing in anyone's name.

## Alternatives considered
| Alternative | Why rejected |
| --- | --- |
| Email or chat messages (rejected for now) | An outside account, and messages sent outside premise. |

## Consequences
- Carried in [intake and reporting](../architecture/intake-and-reporting.md); implemented by the [page](../specs/page.md) and [reporter](../specs/reporter.md) specs.

## Related
[0098](0098-report-when-a-change-reaches-running.md), [0101](0101-the-gate-asks-in-the-session.md).
