# 0025. Two kinds of record

- Status: Accepted
- Scope: The product
- Date: 2026-11-20
- Decided by: The owner, changing the assistant's proposal: "I agree for all but one part. Things that need to be updated, sure, yes, but things such as planning and whatnot, which is intended to be used right away can be detailed and thorough."
- Source: [Conversation record](../record/conversation-2026-11-20.md); old docs/decisions.md entry 25.

## Context

- The first of four points the prior-art research raised: the record must be kept by the product, never by a person. The research found 81.5% of spec files are never updated.

## Decision

- **Lasting records** (purpose, users, what it must do, decisions with their reasons, rejected alternatives) are kept current by the product as part of every change.
- **Working records** (plans and the like) can be as detailed and thorough as the work needs and are not maintained afterwards.

## Reason

- Assistant: "Written specs rot because someone has to remember to update them." Updating the record should be "part of every change the line makes, so it can't fall behind."
- Owner, changing the assistant's proposal: "things such as planning and whatnot, which is intended to be used right away can be detailed and thorough. ... why what decisions are made is also needed long term."

## Alternatives considered

| Alternative | Why rejected |
| --- | --- |
| The assistant's "keep it small ... No implementation detail" applied to every record | The owner: working records such as plans, used right away, can be detailed and thorough. |

## Consequences

- Vision, The record: lasting and working records.
- A software's lasting record lives in its repository and changes in the same commit as the code ([0080](0080-record-in-the-softwares-repository.md), [the record](../architecture/the-record.md)).
- premise's own old plan was a working record; its choices are now decision records.

## Related

[0026](0026-no-maintained-description-of-what-exists.md), [0011](0011-opinionated-about-conversation-and-records.md).
