# 0106. What is set per software, and what stays with premise

- Status: Accepted
- Scope: The plan
- Date: 2026-11-21
- Decided by: The builders, in the plan of 2026-11-21. The owner did not make this choice.
- Source: Old docs/plan.md, P40 (section 7, "Models").

## Context
- The owner: "What needs to be updated runtime per software and what stays with the product can be decided." The product has all its prompts and logic already decided ([0031](0031-the-product-is-general.md)).
- The assistant's split, which it called "the one I'm least sure of", was left open; the question was handed to the builders.

## Decision
- Per software: its record; its `run.md` and build setup, written by the builder in its repository and regenerated when needed; its people and claimed areas; its approvals.
- With premise: the line, the agent instructions, the record format, the roles and their models, the floor and the gate.
- Agent instructions ship as files in premise's repository. They are about the line and the records, not workarounds for one model ([0031](0031-the-product-is-general.md)).

## Reason
The line and the record are general; a software's build setup is specific to it ([0031](0031-the-product-is-general.md)).

## Alternatives considered
| Alternative | Why rejected |
| --- | --- |
| Per-software instructions | The plan gives no further reason beyond the one above: the line and the record are general. |
| Changes to the line per software | The plan gives no further reason beyond the one above. |

## Consequences
- How the instructions ship is [0114](0114-prompts-and-skills-as-files.md).
- Carried in [models and cost](../architecture/models-and-cost.md); implemented by the [agent runner](../specs/agent-runner.md) and [record keeper](../specs/record-keeper.md) specs.

## Related
[0075](0075-one-package.md), [0105](0105-tier-aliases.md).
