# 0072. premise keeps its own state in SQLite in a data folder

- Status: Accepted
- Scope: The plan
- Date: 2026-11-21
- Decided by: The builders, in the plan of 2026-11-21. The owner did not make this choice.
- Source: Old docs/plan.md, P6 (section 1, "The parts and how they talk").

## Context
- Storage is premise's own database and data folder on the owner's machine, plus each software's repository on GitHub ([0051](0051-each-software-in-its-own-repository.md)).
- The work queue must survive a restart.

## Decision
premise keeps its own state in SQLite, in a data folder in the user's home directory (configurable).

## Reason
One file, no database server to run, and transactions keep the work queue safe across crashes.

## Alternatives considered
| Alternative | Why rejected |
| --- | --- |
| JSON files | No transactions. |
| A database server | Setup that a local-first product should not need. |

## Consequences
- Agents cannot read the data folder ([0087](0087-agents-run-confined.md)).
- Carried in [architecture overview](../architecture/overview.md); implemented by the [storage](../specs/storage.md) and [work queue](../specs/work-queue.md) specs.

## Related
[0080](0080-record-in-the-softwares-repository.md), [0081](0081-nothing-about-people-in-the-repository.md).
