# 0094. A triager agent reads every intake item against the record

- Status: Accepted
- Scope: The plan
- Date: 2026-11-21
- Decided by: The builders, in the plan of 2026-11-21. The owner did not make this choice.
- Source: Old docs/plan.md, P28 (section 6, "Triage and routes").

## Context
- Ideas and problems come back in from many sources and are each judged against the record ([VISION.md](../../VISION.md), the line, step 11).
- "How automatic intake works" was handed to the builders.

## Decision
A triager agent reads every item against the record: its kind (bug, wish, change of purpose, question, opinion, duplicate, noise), the items it touches, its rough size, and whether it touches the floor.

## Reason
Routing by what an item touches needs the record, which an LLM can read; no person is needed for it.

## Alternatives considered
| Alternative | Why rejected |
| --- | --- |
| People sorting intake by hand | No person is needed for it. |

## Consequences
- Routes follow from triage: in normally (the default), asked at once, held, merged or closed ([0062](0062-intake-goes-in-normally.md)).
- Carried in [intake and reporting](../architecture/intake-and-reporting.md); implemented by the [intake](../specs/intake.md) spec.

## Related
[0095](0095-what-is-held.md), [0104](0104-model-tier-by-role.md), [0116](0116-outside-content-is-data.md).
