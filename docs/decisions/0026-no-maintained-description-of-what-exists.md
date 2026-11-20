# 0026. A description of what exists is not maintained

- Status: Accepted
- Scope: The product
- Date: 2026-11-20
- Decided by: The owner, agreeing to the assistant's opinion: "I agree on your points."
- Source: [Conversation record](../record/conversation-2026-11-20.md); [shaping notes](../record/shaping-notes-2026-11-20.md); old docs/decisions.md entry 26.

## Context

- The owner had left open "whether or not to maintain documentation for technical architecture and code".

## Decision

- Technical architecture and code documentation are not maintained; they are written from the code when someone needs them.
- Only the why is kept.

## Reason

- Assistant: "The code is the truth about what exists, and an LLM can write a fresh description from it whenever someone needs one. A maintained copy only adds something that can go stale. What can't be recovered from code is why it's that way, so that's the part worth keeping."
- Owner: had been unsure ("what exists, I'm unsure whether needs maintaining"), then "I agree on your points."

## Alternatives considered

| Alternative | Why rejected |
| --- | --- |
| Maintaining a description of what exists | Can go stale; the code is the truth and a description can be written from it on demand. |

## Consequences

- Vision, The record: "A description of what exists is not maintained. It is written from the code when someone needs it."

## Related

[0025](0025-two-kinds-of-record.md), [the record](../architecture/the-record.md).
