# 0090. The checker's scenarios live where builders cannot read them

- Status: Accepted
- Scope: The plan
- Date: 2026-11-21
- Decided by: The builders, in the plan of 2026-11-21. The owner did not make this choice.
- Source: Old docs/plan.md, P24 (section 5, "Check").

## Context
- "Agents game the checks they can touch" ([0030](0030-independent-check.md)).

## Decision
The checker writes its scenarios from the record into premise's data folder, where builders cannot read them.

## Reason
Agents game the checks they can touch ([0030](0030-independent-check.md)).

## Alternatives considered
| Alternative | Why rejected |
| --- | --- |
| Scenarios kept in the software's repository | The builder could read and game them. |

## Consequences
- Taste items that can be checked go into the checker's scenarios.
- Builders' reads of the scenarios are denied by confinement ([0087](0087-agents-run-confined.md)).
- Carried in [build, check and run](../architecture/build-check-run.md); implemented by the [agent tools](../specs/agent-tools.md) (`scenario_write`) and [storage](../specs/storage.md) specs.

## Related
[0089](0089-checker-in-a-fresh-session.md), [0102](0102-taste-proposals-before-building.md).
