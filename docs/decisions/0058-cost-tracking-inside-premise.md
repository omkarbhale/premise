# 0058. Cost tracking inside premise

- Status: Superseded by [0064](0064-cost-and-spending-limit-from-usage-ledger.md)
- Scope: The plan
- Date: 2026-11-21
- Decided by: The owner (follow-up A): "A: your recommendation."
- Source: Old docs/decisions.md entry 58, which quotes the owner from the assistant's notes of the 2026-11-21 conversations; those notes are not kept in this repository.

## Context

- The assistant asked four follow-ups on the fourteen calls (records 0057–0060).
- The owner's whole answer: "On 7, the exception doesn't go in the vision, because vision doesn't separate mvp-1 from built product, or from simply just the plan. / A: your recommendation. / B: Yes, or whatever is on gh. No enforcement from premise. / C: I'll decide. Premise doesn't need to need me to pick one anyway, it should work for any that I pick."
- The reasons the assistant gave with its recommendations were not kept.

## Decision

- Cost tracking is built inside premise.
- usage-ledger is not a dependency; if it is still wanted, it is a separate thing, later.

## Reason

- No reason was recorded. Owner: "A: your recommendation."

## Alternatives considered

| Alternative | Why rejected |
| --- | --- |
| Building usage-ledger and depending on it (the owner's suggestion in [0048](0048-a-spending-limit.md)) | Not taken: the owner accepted the assistant's recommendation. No reason was recorded. |

## Consequences

- **Changed later:** reopened by [0063](0063-premise-may-depend-on-other-tools.md) and settled the other way in [0064](0064-cost-and-spending-limit-from-usage-ledger.md).

## Related

[0048](0048-a-spending-limit.md), [0064](0064-cost-and-spending-limit-from-usage-ledger.md), [0016](0016-coarse-cost-tracking.md).
