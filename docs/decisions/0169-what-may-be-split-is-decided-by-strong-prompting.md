# 0169. What may be split is decided by strong prompting

- Status: Accepted
- Scope: The product
- Date: 2026-11-21
- Decided by: The owner, answering the assistant's third caution (that splitting work across several agents is the least proven, and breaks when the model changes): "Yeah, so we need stronger prompting in decidng what can get split. Completely separate parts or very long parts might, one heavy work doesn't necessarily."
- Source: [The owner on scale, direction and order](../record/scale-and-direction-2026-11-21.md)

## Context

- Splitting a software into pieces that go through the line separately is part of working at any scale ([0167](0167-any-piece-of-work-goes-through-the-same-line-at-its-own-size.md)).
- The assistant said multi-agent splitting is the least proven part of the field, costs more and breaks on model changes, and suggested building it thin ([assessment](../record/direction-assessment-2026-11-21.md)).

## Decision

- What may be split is decided by strong prompting: the instructions to the agent that sizes the work say what may and may not be split.
- Completely separate parts may be split. Very long parts may be split.
- One heavy piece of work is not by itself a reason to split.
- Builders' note, inside this record: there are no several agents per stage by default, and each split is recorded with its reason. This note is the builders', not the owner's.

## Reason

- Owner: "Completely separate parts or very long parts might, one heavy work doesn't necessarily."
- Builders' note (not the owner's): recording each reason lets a wrong split be seen and corrected, and keeps cost down while the approach is unproven.

## Alternatives considered

| Alternative | Why rejected |
| --- | --- |
| A fixed rule such as a size threshold | The owner asked for judgment by strong prompting, not a number. |
| Splitting whenever a piece is heavy | The owner: one heavy piece is not by itself a reason. |
| Several agents per stage by default | Builders' note: unproven, dearer, and tied to a model's behaviour. |

## Consequences

- The sizing prompt is written to this rule; each split and its reason are recorded with the work item. Splitting into child items is not built yet ([issue 58](https://github.com/omkarbhale/premise/issues/58)).
- Work sized per piece is in milestone 1 ([roadmap](../product/roadmap.md)).

## Related

[0113](0113-agent-roles.md), [0117](0117-size-classes-set-stage-budgets.md), [0167](0167-any-piece-of-work-goes-through-the-same-line-at-its-own-size.md).
