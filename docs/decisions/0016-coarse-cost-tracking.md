# 0016. Coarse cost tracking is in

- Status: Accepted
- Scope: The product
- Date: 2026-11-20
- Decided by: The owner, agreeing to the assistant's proposal: "I agree."
- Source: [Conversation record](../record/conversation-2026-11-20.md); old docs/decisions.md entry 16.

## Context

- The assistant's fifth opinion, following from return on effort ([0006](0006-llm-does-what-it-can.md)).

## Decision

- The product knows what each piece of work costs.

## Reason

- Assistant: "If return on effort decides things, the factory has to measure cost. Otherwise the rule is a guess."
- Owner: "I agree."

## Alternatives considered

| Alternative | Why rejected |
| --- | --- |
| None recorded | No alternative was put to the owner or recorded. |

## Consequences

- Vision, also part of the product: "It knows what each piece of work costs."
- **Changed later:** premise gets cost tracking and its spending limit from usage-ledger, a separate project, and builds none of its own ([0064](0064-cost-and-spending-limit-from-usage-ledger.md)). That settles how; this record stands.

## Related

[0048](0048-a-spending-limit.md), [0058](0058-cost-tracking-inside-premise.md), [models and cost](../architecture/models-and-cost.md).
