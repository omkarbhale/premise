# 0075. premise's code is one package in this repository

- Status: Accepted
- Scope: The plan
- Date: 2026-11-21
- Decided by: The builders, in the plan of 2026-11-21. The owner did not make this choice.
- Source: Old docs/plan.md, P9 (section 1, "The parts and how they talk").

## Context
- premise has a server, a page, agent instructions and, from milestone 1, scripted demo runs.

## Decision
premise's code lives in this repository as one package: server, page, agent instructions, and the scripted demo runs.

## Reason
- One thing to install and version.
- Agent instructions change together with the code that uses them.

## Alternatives considered
| Alternative | Why rejected |
| --- | --- |
| Several packages in one repository | Machinery before it is needed. |

## Consequences
- Agent instructions ship as files in this repository ([0106](0106-per-software-and-with-premise.md), [0114](0114-prompts-and-skills-as-files.md)).
- Carried in [architecture overview](../architecture/overview.md).

## Related
[0067](0067-one-process-agents-as-children.md), [0109](0109-vitest-and-kept-demos.md).
