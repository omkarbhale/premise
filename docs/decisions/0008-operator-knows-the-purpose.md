# 0008. Target operator: a person who knows what the software is for

- Status: Accepted
- Scope: The product
- Date: 2026-11-20
- Decided by: The owner: "even a single person who knows what the purpose of building a sofware is, should be able to"; agreeing to the assistant's reading: "I agree though on the target user." Refined by the owner: "One operator ONLY isn't strict, I was just saying that."
- Source: [Conversation record](../record/conversation-2026-11-20.md); old docs/decisions.md entry 8.

## Context

- The owner said it in the answer to the root question; the assistant called it "the most important thing you said".

## Decision

- "even a single person who knows what the purpose of building a sofware is, should be able to" (Owner). That is all the product requires of the operator.
- **Refined by the owner:** "the operator isn't strictly non-technical. Because at the end of the day, the goal is to get a properly built software. And for things LLMs can't reliably do, we need other people. One operator ONLY isn't strict, I was just saying that."

## Reason

- Assistant: "If the operator only knows the purpose, the factory must own every technical judgement. ... Every question it asks has to be about purpose ... I'd design for that operator even while you're the only user, because it stops the factory leaning on your engineering skill."
- Owner: "I agree though on the target user."

## Alternatives considered

| Alternative | Why rejected |
| --- | --- |
| None recorded | No alternative was put to the owner or recorded. |

## Consequences

- Vision, who it is for: "Someone who knows what the software is for. That is all the product requires of them." and "The operator may be one person or several, technical or not."

## Related

[0009](0009-everyone-needed-is-a-user.md), [0017](0017-the-line-ends-at-running-software.md), [roles and use cases](../product/roles-and-use-cases.md).
