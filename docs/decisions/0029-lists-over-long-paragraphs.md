# 0029. Lists over long paragraphs

- Status: Accepted
- Scope: The product
- Date: 2026-11-20
- Decided by: The owner: "I also think (for now, my opinion only) long paragraphs of information is harder to deal with for humans than a list of things. Be it code or anything."
- Source: [Conversation record](../record/conversation-2026-11-20.md); old docs/decisions.md entry 29.

## Context

- Said while agreeing to [0027](0027-spend-least-of-peoples-attention.md).

## Decision

- The product speaks to people in lists.

## Reason

- Owner: "I also think (for now, my opinion only) long paragraphs of information is harder to deal with for humans than a list of things. Be it code or anything."
- The assistant agreed: "a list can be corrected item by item."
- Recorded as the owner's opinion for now.

## Alternatives considered

| Alternative | Why rejected |
| --- | --- |
| None recorded | No alternative was put to the owner or recorded. |

## Consequences

- Vision principle 6: "It speaks in lists, not long paragraphs."
- The record is one item per list line ([0082](0082-record-as-markdown-with-ids.md)); every stage output is a short list ([the line](../architecture/the-line.md)).

## Related

[0027](0027-spend-least-of-peoples-attention.md), [0028](0028-say-back-as-assumptions-to-strike.md).
