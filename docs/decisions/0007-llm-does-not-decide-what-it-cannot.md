# 0007. If an LLM cannot reliably do it, it does not decide it

- Status: Accepted
- Scope: The product
- Date: 2026-11-20
- Decided by: The owner, as a corollary of [0006](0006-llm-does-what-it-can.md): "if something can't be done by LLMs it shouldn't. ... So perhaps along with the operator if there are other people needed, we say so or maybe use LLMs with that considered". Refined by the owner: "Perhaps it only suggests and tries its best."
- Source: [Conversation record](../record/conversation-2026-11-20.md), the owner's replies to the assistant's first and second rounds of opinions; [shaping notes](../record/shaping-notes-2026-11-20.md); old docs/decisions.md entry 7.

## Context

- The owner added this while agreeing to the assistant's first opinions: "There's less of what LLMs can't do, but while thinking we also think of this."

## Decision

- Owner, as a corollary of entry 6: "if something can't be done by LLMs it shouldn't. ... So perhaps along with the operator if there are other people needed, we say so or maybe use LLMs with that considered".
- **Refined:** where an LLM cannot reliably decide, it still gives its best attempt and proposes; a person decides.

## Reason

- Owner: "LLMs can produce useful information regardless, with reasoning, so I do not know where to draw the line. Perhaps it only suggests and tries its best."

## Alternatives considered

| Alternative | Why rejected |
| --- | --- |
| None recorded | No alternative was put to the owner or recorded. |

## Consequences

- The assistant listed what an LLM cannot reliably do today: know an intent nobody has stated; act in the real world (accounts, payments, signatures); carry accountability; tell whether real users actually want the thing.
- The assistant proposed the product keeps that list explicitly and asks a named person, in their terms, and said the list will shrink over time. Owner: "Sure, and our product should know that."
- Vision principle 2: "If an LLM cannot reliably do it, it does not decide it. It still gives its best attempt and proposes; a person decides."
- Carried in the plan's table of who has the last word ([0084](0084-who-has-the-last-word.md)).

## Related

[0006](0006-llm-does-what-it-can.md), [0009](0009-everyone-needed-is-a-user.md), [roles and use cases](../product/roles-and-use-cases.md).
