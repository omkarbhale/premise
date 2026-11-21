# 0168. A first pass need not be perfect: return over perfection

- Status: Accepted
- Scope: The product
- Date: 2026-11-21
- Decided by: The owner, answering the assistant's second caution (that writing specifications first was measured as slow and not defect-reducing): "I agree that perfection is not guarenteed in first pass, but if it saves time and the problems can be fixed with intake, then premise works. Again, ROI over value when work is done automatically. I mean, isn't that same for old fasioned way of programming anyway."
- Source: [The owner on scale, direction and order](../record/scale-and-direction-2026-11-21.md)

## Context

- The assistant cautioned against ceremony before running software: the prior art found spec-first work slow and not defect-reducing, and said running software with a wait after a milestone is the real guard ([assessment](../record/direction-assessment-2026-11-21.md)).
- Principle 1 already says small defects are acceptable when the speed gained is considerable.

## Decision

- A first pass need not be perfect.
- If premise saves time, and the problems that remain can be fixed through intake, premise works.
- Return decides, not perfection, as in programming by hand.
- This does not touch the floor: what is never traded for speed stays ([0056](0056-what-is-on-the-floor.md)).

## Reason

- Owner: "ROI over value when work is done automatically. I mean, isn't that same for old fasioned way of programming anyway."

## Alternatives considered

| Alternative | Why rejected |
| --- | --- |
| Aim for a defect-free first pass | The owner: perfection is not guaranteed in a first pass, and intake exists to fix what is found. |

## Consequences

- Stages stay short and run early ([0085](0085-stage-effort-budgets.md)); running software and the wait after a milestone ([0128](0128-effort-per-software-and-milestone-waits.md)) are where problems show.
- premise measures how often something it reported as working came back as a bug ([0171](0171-premise-measures-its-own-return.md)), which is how this is tested.

## Related

[0006](0006-llm-does-what-it-can.md), [0015](0015-a-floor-never-traded-for-speed.md), [0056](0056-what-is-on-the-floor.md), [0062](0062-intake-goes-in-normally.md), [0171](0171-premise-measures-its-own-return.md).
