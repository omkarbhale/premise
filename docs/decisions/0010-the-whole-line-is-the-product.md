# 0010. The whole line is the product

- Status: Accepted
- Scope: The product
- Date: 2026-11-20
- Decided by: The owner, pushing back on the assistant: "Actually I push back on this. The pipeline is also our product."
- Source: [Conversation record](../record/conversation-2026-11-20.md); old docs/decisions.md entry 10.

## Context

- The assistant had given the opinion: "So the conversation is the product, not the build line. Getting agents to write code is the solved part."

## Decision

- The whole pipeline is the product, not only the conversation.
- No step exists where a person carries work to an LLM by hand.

## Reason

- Owner: "After this said conversation (if we have it), if somebody has to go to a chat interface and ask the LLM to do the coding, that is also something that can be automated but it isn't. The same thing can go for a lot of things in the entire pipeline."
- Assistant, agreeing: "Today's loop broke at exactly those hand-carried joins."

## Alternatives considered

| Alternative | Why rejected |
| --- | --- |
| The assistant's opinion "the conversation is the product, not the build line", because "Getting agents to write code is the solved part." | The owner pushed back. The assistant then said: "I was wrong to call the build line the solved part." |

## Consequences

- Vision principle 4: "The whole line is the product. There is no step where a person carries work to an LLM by hand."

## Related

[0011](0011-opinionated-about-conversation-and-records.md), [0012](0012-reporting-with-a-product-default.md), [the line](../architecture/the-line.md).
