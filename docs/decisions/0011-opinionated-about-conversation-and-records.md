# 0011. The product is opinionated about the conversation and its records

- Status: Accepted
- Scope: The product
- Date: 2026-11-20
- Decided by: The owner: "Our product is opinionated here."
- Source: [Conversation record](../record/conversation-2026-11-20.md), the owner's push-back on "the conversation is the product"; old docs/decisions.md entry 11.

## Context

- Said in the same reply as [0010](0010-the-whole-line-is-the-product.md) and [0012](0012-reporting-with-a-product-default.md).

## Decision

- The product owns "how to separate and group out and write persisted records on the conversation, and where should the conversation start and go" (Owner).
- Examples from the owner:
  - if target users are not defined, the product writes plausible ones with the operator;
  - if the problem statement is not defined, the product clears that first.

## Reason

- Owner: "Our product is opinionated here." No further reason was recorded.

## Alternatives considered

| Alternative | Why rejected |
| --- | --- |
| None recorded | No alternative was put to the owner or recorded. |

## Consequences

- Vision principle 5: "The product has opinions. It decides where the conversation starts, where it goes, and how what is said is kept."
- The line starts at Why, then Who ([VISION.md](../../VISION.md)); the record format is premise's ([0082](0082-record-as-markdown-with-ids.md)).

## Related

[0010](0010-the-whole-line-is-the-product.md), [0025](0025-two-kinds-of-record.md), [the line](../architecture/the-line.md), [the record](../architecture/the-record.md).
