# 0172. premise learns from corrections

- Status: Accepted
- Scope: The plan
- Date: 2026-11-21
- Decided by: The owner, on the assistant's seven suggestions: "I agree on 1, 2, 3. Put 4, 5, on later. I agree on 6, 7, and I agree on what you said to push later." (suggestion 3)
- Source: [The owner on scale, direction and order](../record/scale-and-direction-2026-11-21.md)

## Context

- People correct premise's drafts and results all the time (strikes, edits, intake). Nothing kept what those corrections teach.
- Taste is about people's own claims on a part of the software ([0022](0022-people-can-put-in-their-taste.md)); this is different: what premise learns from how it was corrected.

## Decision

- premise learns from corrections, as two short lists:
  - one per software: what that software's corrections taught;
  - one of the operator's taste that carries across softwares.
- Each line is tied to the correction it came from, so it can be checked.
- Each line can be deleted.
- Builders' note, inside this record: the per-software list belongs to the software's record; the operator's list is about a person, so it is kept in premise's own data and never in a software's repository ([0081](0081-nothing-about-people-in-the-repository.md)). This note is the builders', not the owner's.

## Reason

- Owner: "I agree on 1, 2, 3."
- Builders' note (not the owner's): tying lines to their source and letting people delete them keeps learning from becoming something premise believes without knowing why.

## Alternatives considered

| Alternative | Why rejected |
| --- | --- |
| Learn silently, with no list | A person could not see or undo what premise had picked up. |
| One long list for everything | The lists stay short ([0029](0029-lists-over-long-paragraphs.md)); taste differs from what one software taught. |

## Consequences

- A new part of the record and the page: the lists can be seen and deleted; the drafter reads them ([drafter prompt](../prompts/drafter.md)).
- Built with the measures, after thin intake and thin existing software ([roadmap](../product/roadmap.md)).

## Related

[0022](0022-people-can-put-in-their-taste.md), [0081](0081-nothing-about-people-in-the-repository.md), [0102](0102-taste-proposals-before-building.md), [0171](0171-premise-measures-its-own-return.md).
