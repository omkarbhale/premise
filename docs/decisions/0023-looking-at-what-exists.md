# 0023. Looking at what already exists is a step of the line

- Status: Accepted
- Scope: The product
- Date: 2026-11-20
- Decided by: The owner: "similar to how we are doing prior work, this should also be in product I think." and "For maybe both, new or existing software." The shape is the assistant's, agreed and now in the vision.
- Source: [Conversation record](../record/conversation-2026-11-20.md); [shaping notes](../record/shaping-notes-2026-11-20.md); old docs/decisions.md entry 23.

## Context

- The owner said it while the prior-art research for premise was running.

## Decision

- Like the prior-art research done for premise, looking at what exists is part of the product, "For maybe both, new or existing software" (Owner).
- **Shape** (Assistant, now in the vision):
  - it sits after Why and Who, before What;
  - one step serves both motives; the product can tell which from the Why;
  - three outcomes: don't build, use what exists; build on top of something that exists; build something different because there's a real gap ("You said 'some or full', so I take it the product is allowed to say 'don't build this'");
  - it repeats at smaller sizes, before a large feature or a big technical choice; for existing software it also asks whether something has appeared that makes part of it unnecessary;
  - depth follows the return-on-effort rule.

## Reason

- Owner: "For me, I build what I want to use, so it can avoid effort, some or full. For somebody else, that might amount to finding what others are missing or market research."

## Alternatives considered

| Alternative | Why rejected |
| --- | --- |
| None recorded | No alternative was put to the owner or recorded. |

## Consequences

- The scope page's edge item "finds out whether real users want it" split in two: what exists and what's missing is LLM work and goes in as this step; whether real people want it still needs real people (later settled as out, [0036](0036-finding-out-if-people-want-it-is-out.md)).
- Vision line, step 3 (What exists); the stage is in [the line](../architecture/the-line.md).

## Related

[0006](0006-llm-does-what-it-can.md), [0024](0024-no-other-tools-unless-they-match-the-vision.md).
