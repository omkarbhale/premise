# 0048. A spending limit

- Status: Accepted
- Scope: The plan
- Date: 2026-11-21
- Decided by: The owner, agreeing to the assistant's recommendation (call 6) and suggesting how: "Spending limit: maybe we build usage-ledger and depend on it to make it easier."
- Source: Old docs/decisions.md entry 48, which quotes the owner from the assistant's notes of the 2026-11-21 conversations; those notes are not kept in this repository.

## Context

- The assistant asked fourteen numbered calls (records 0043–0056), each with a recommendation, so that premise can be built without the owner ([0042](0042-plan-top-down-settle-owner-calls-first.md)).
- The owner's whole answer: "1, 2, 3, I agree / 4, 5, 6, I agree. My susbcription can be used. Spending limit: maybe we build usage-ledger and depend on it to make it easier. / 7: no, because premise is agnostic to what we are building completely. Could be webapps, servers, desktop apps, utilities, or even Aras customizations, anything that's not dependent on setup too much. / 8, 9, I agree. Public or private. / 10, 11, 12, I agree. / 13, License all rights reserved. / 14, I agree."
- The reasons the assistant gave with its recommendations were not kept, so the records the owner agreed to say "No reason was recorded."

## Decision

- premise has a spending limit.
- The owner agreed and suggested how: "Spending limit: maybe we build usage-ledger and depend on it to make it easier."

## Reason

- No reason was recorded beyond the owner's "to make it easier". The recommendation's own text was not kept.

## Alternatives considered

| Alternative | Why rejected |
| --- | --- |
| None recorded | No alternative was put to the owner or recorded. |

## Consequences

- **Changed later:** [0058](0058-cost-tracking-inside-premise.md) built cost tracking inside premise instead; then [0064](0064-cost-and-spending-limit-from-usage-ledger.md): premise uses usage-ledger for its spending limit. The owner's first suggestion stands.
- How the limit works: [models and cost](../architecture/models-and-cost.md).

## Related

[0016](0016-coarse-cost-tracking.md), [0058](0058-cost-tracking-inside-premise.md), [0064](0064-cost-and-spending-limit-from-usage-ledger.md).
