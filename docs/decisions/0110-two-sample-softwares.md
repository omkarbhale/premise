# 0110. Two small softwares of different kinds shown running in milestone 1

- Status: Accepted
- Scope: Milestone 1
- Date: 2026-11-21
- Decided by: The builders, in the plan of 2026-11-21. The owner did not make this choice.
- Source: Old docs/plan.md, P44 (section 8, "Milestone 1", step 2 onward, "Shown running").

## Context
- premise is agnostic to the kind of software; there is no first kind ([0049](0049-any-kind-of-software.md)).
- The first software is the owner's pick, made when the owner wants; building premise does not wait for it ([0060](0060-first-software-does-not-hold-up-premise.md)).

## Decision
- Two small softwares of different kinds, each taken from a one-paragraph idea to running software with a scripted operator: a command-line utility and a small web app.
- In each run, one assumption is struck in the say-back and the record changes to match.
- In each run, the checker catches a defect planted in the build that it was not told about.
- After this, the owner can run their own first pick whenever they want ([0060](0060-first-software-does-not-hold-up-premise.md)).

## Reason
Two kinds keep the line from fitting one kind ([0049](0049-any-kind-of-software.md)).

## Alternatives considered
| Alternative | Why rejected |
| --- | --- |
| One sample | The line could fit one kind. |
| Waiting for the owner's pick | Building premise does not wait for it ([0060](0060-first-software-does-not-hold-up-premise.md)). |

## Consequences
- Carried in [roadmap](../product/roadmap.md).

## Related
[0108](0108-scripted-operator-for-demos.md), [0109](0109-vitest-and-kept-demos.md), [0034](0034-first-proof-new-software.md).
