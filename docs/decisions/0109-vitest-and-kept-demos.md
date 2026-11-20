# 0109. Unit tests with Vitest; each milestone's demo kept as a scripted run

- Status: Accepted
- Scope: The plan
- Date: 2026-11-21
- Decided by: The builders, in the plan of 2026-11-21. The owner did not make this choice.
- Source: Old docs/plan.md, P43 (section 8, "Milestones").

## Context
- premise is written in TypeScript ([0047](0047-typescript.md)) as one package ([0075](0075-one-package.md)).
- Each milestone is shown running with a scripted operator ([0108](0108-scripted-operator-for-demos.md)).

## Decision
premise's own tests: unit tests with Vitest, and each milestone's demo kept in this repository as a scripted end-to-end run that can be run again.

## Reason
The demos are the proof that the line works; keeping them lets every later change be checked against them.

## Alternatives considered
| Alternative | Why rejected |
| --- | --- |
| Unit tests only | The demos are the proof that the line works. |

## Consequences
- Milestone 2 runs milestone 1's demos again with usage figures; milestone 5 runs them on a clean machine ([roadmap](../product/roadmap.md)).

## Related
[0108](0108-scripted-operator-for-demos.md), [0110](0110-two-sample-softwares.md).
