# 0108. Demos use a scripted operator

- Status: Accepted
- Scope: The plan
- Date: 2026-11-21
- Decided by: The builders, in the plan of 2026-11-21. The owner did not make this choice.
- Source: Old docs/plan.md, P42 (section 8, "Milestones").

## Context
- Every milestone is "shown running": a recorded run with its evidence kept.
- People's attention is what the product spends least of ([0027](0027-spend-least-of-peoples-attention.md)); the first software is the owner's pick and does not hold up building premise ([0060](0060-first-software-does-not-hold-up-premise.md)).

## Decision
Demos use a scripted operator: answers written down before the run and fed in by a test script.

## Reason
The line runs end to end unattended, the same way each time, without spending the owner's attention ([0027](0027-spend-least-of-peoples-attention.md)).

## Alternatives considered
| Alternative | Why rejected |
| --- | --- |
| An LLM playing the operator | It tends to agree with premise's drafts, which would hide mismatches. |

## Consequences
- Carried in [roadmap](../product/roadmap.md); the demos are kept as scripted runs ([0109](0109-vitest-and-kept-demos.md)).

## Related
[0110](0110-two-sample-softwares.md).
