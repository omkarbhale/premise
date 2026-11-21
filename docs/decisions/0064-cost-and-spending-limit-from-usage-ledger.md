# 0064. Cost tracking and the spending limit come from usage-ledger

- Status: Partly superseded by [0133](0133-usage-ledger-is-mocked-until-it-exists.md): usage-ledger being usable as milestone 2's prerequisite; its output is mocked until it exists
- Supersedes: [0058](0058-cost-tracking-inside-premise.md)
- Scope: The plan
- Date: 2026-11-21
- Decided by: The owner: "Usage ledger built and we only use it."
- Source: Old docs/decisions.md entry 64, which quotes the owner from the assistant's notes of the 2026-11-21 conversations; those notes are not kept in this repository.

## Context

- [0063](0063-premise-may-depend-on-other-tools.md) reopened [0058](0058-cost-tracking-inside-premise.md).

## Decision

- usage-ledger ([github.com/omkarbhale/usage-ledger](https://github.com/omkarbhale/usage-ledger)) is built as its own project, outside premise.
- premise only uses it, for cost tracking and the spending limit, and builds none of its own.

## Reason

- No reason was recorded. Owner: "Usage ledger built and we only use it."

## Alternatives considered

| Alternative | Why rejected |
| --- | --- |
| Cost tracking built inside premise ([0058](0058-cost-tracking-inside-premise.md)) | The owner: usage-ledger is built and premise only uses it. |

## Consequences

- **Changes** [0058](0058-cost-tracking-inside-premise.md). The owner's first suggestion ([0048](0048-a-spending-limit.md)) stands.
- **In the plan:** usage-ledger being usable is a prerequisite of premise's cost and spending-limit milestone (milestone 2); building usage-ledger is not premise work ([models and cost](../architecture/models-and-cost.md), [roadmap](../product/roadmap.md)).

- **Partly superseded by** [0133](0133-usage-ledger-is-mocked-until-it-exists.md): premise mocks usage-ledger's output until it exists, so milestone 2 does not wait for it.

## Related

[0016](0016-coarse-cost-tracking.md), [0048](0048-a-spending-limit.md), [0063](0063-premise-may-depend-on-other-tools.md).
