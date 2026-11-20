# 0081. Nothing about real people goes into a software's repository

- Status: Accepted
- Scope: The plan
- Date: 2026-11-21
- Decided by: The builders, in the plan of 2026-11-21. The owner did not make this choice.
- Source: Old docs/plan.md, P15 (section 3, "Where it lives").

## Context
- The lasting record lives in the software's repository ([0080](0080-record-in-the-softwares-repository.md)).
- The visibility of each software's repository is chosen per software or is whatever it is on GitHub; premise enforces nothing ([0059](0059-repository-visibility-per-software.md)).

## Decision
- Nothing about real people goes into a software's repository.
- Conversations, and anything said in them about people, stay in premise's data folder.
- The record names roles, not people.

## Reason
Visibility is not premise's to enforce ([0059](0059-repository-visibility-per-software.md)), so the repository must be safe to make public.

## Alternatives considered
| Alternative | Why rejected |
| --- | --- |
| Conversation transcripts in the repository | The repository may be made public. |

## Consequences
- Intake items, which hold people's words, are stored in premise's database, not the repository.
- Carried in [the record](../architecture/the-record.md); implemented by the [record keeper](../specs/record-keeper.md) and [storage](../specs/storage.md) specs.

## Related
[0080](0080-record-in-the-softwares-repository.md), [0100](0100-floor-actions.md).
