# 0036. Finding out whether real people want the software is out

- Status: Accepted
- Scope: The product
- Date: 2026-11-20
- Decided by: The owner: "No I think then item 2 is out. Intake is in, and those people can say their opinion through that ... So later it is."
- Source: [Conversation record](../record/conversation-2026-11-20.md); [shaping notes](../record/shaping-notes-2026-11-20.md); old docs/decisions.md entry 36.

## Context

- **How it got here:**
  - the assistant first put this as "later" (assumption 2);
  - the owner asked "Needing real people is not out in our product, right? Is this the entire prior work/research part of our product you mean by this?";
  - the assistant explained it was the narrower thing ("putting the software in front of the people it's meant for and learning whether they want it"), not the research step, and had put it in the vision as part of the product;
  - the owner then took it out.

## Decision

- The product does not find out on its own whether real people want the software.
- People's opinions arrive through intake, and the operator sees for themselves whether anybody uses it.
- When people don't want the software, the product goes back to Why with the operator: the wrong problem may have been solved, or there are other problems.

## Reason

- Owner: "Intake is in, and those people can say their opinion through that, and just saying that the operators can actually look in the real world whether anybody uses the software and decide what is the problem themselves."
- Assistant, agreeing: "It keeps the product from claiming to know something only the real world can show. It also keeps the part that is valuable: when the answer comes back 'nobody wants this', the product reopens the problem instead of polishing the build."

## Alternatives considered

| Alternative | Why rejected |
| --- | --- |
| Later (the assistant's assumption 2) | The owner said "out", then "So later it is"; see below. |
| In the vision as part of the product (the first vision statement) | The owner took it out. |

## Consequences

- **Ambiguity left visible:** the owner said both "out" and "So later it is". The assistant wrote it as out of the vision as it stands, with an active version at most a later idea, and asked to be told if the owner meant it the other way. No answer is recorded. It is an [open question](../open-questions.md); nothing in the plan depends on it.
- Vision: "Find out on its own whether real people want the software" is under "What the product does not do"; intake goes back to Why.

## Related

[0023](0023-looking-at-what-exists.md), [0033](0033-answers-to-the-ten-assumptions.md) item 2, [0062](0062-intake-goes-in-normally.md).
