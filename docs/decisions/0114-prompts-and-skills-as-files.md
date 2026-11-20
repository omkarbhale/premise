# 0114. Prompts and skills ship as files; skills are appended in full to the role prompt

- Status: Accepted
- Scope: The plan
- Date: 2026-11-21
- Decided by: The builders, in the documentation restructure of 2026-11-21. The owner did not make this choice.
- Source: The documentation restructure of 2026-11-21.

## Context
- Agent instructions ship as files in premise's repository and are about the line and the records, not workarounds for one model ([0106](0106-per-software-and-with-premise.md), [0031](0031-the-product-is-general.md)).
- Several rules apply to more than one agent role: lists, the record format, asking the right role, the floor, honest reporting.

## Decision
- Each agent role has one prompt file with its system prompt and task brief templates.
- Skills are shared guidance files.
- The agent runner appends every skill a role lists, in full, after the role prompt, at session start. No skill is loaded on demand.
- [docs/prompts](../prompts/README.md) and [docs/skills](../skills/README.md) are their specification; the shipped files follow them.

## Reason
- The plan says instructions ship as files in premise's repository (P40).
- A rule that must hold on every turn cannot depend on an agent choosing to load it.
- One text per rule keeps roles from drifting apart.

## Alternatives considered
| Alternative | Why rejected |
| --- | --- |
| On-demand skills the agent loads itself | A rule may never be loaded. |
| Copying each rule into every role prompt | Copies drift. |

## Consequences
- Changing a skill changes every role that lists it, in one place.
- Implemented by the [agent runner](../specs/agent-runner.md) spec.

## Related
[0075](0075-one-package.md), [0113](0113-agent-roles.md).
