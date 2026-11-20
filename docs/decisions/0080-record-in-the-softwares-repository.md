# 0080. The lasting record lives in the software's repository, in premise/

- Status: Accepted
- Scope: The plan
- Date: 2026-11-21
- Decided by: The builders, in the plan of 2026-11-21. The owner did not make this choice.
- Source: Old docs/plan.md, P14 (section 3, "Where it lives").

## Context
- Lasting records are kept current by the product as part of every change ([0025](0025-two-kinds-of-record.md)).
- Each software has its own repository ([0051](0051-each-software-in-its-own-repository.md)).

## Decision
Each software's lasting record lives in its own repository, in a `premise/` folder at the root.

## Reason
- It is versioned with the code; a change and its record land in one commit, so the record cannot fall behind ([0025](0025-two-kinds-of-record.md)).
- It outlives premise; the prior art found records lost when the tool holding them shut down.

## Alternatives considered
| Alternative | Why rejected |
| --- | --- |
| Keeping the record in premise's database | The plan gives no further reason beyond the one above: the record would not land with the code, and would be lost with the tool. |

## Consequences
- Working records (transcripts, plans, job logs, check evidence) stay in premise's data folder; they are kept, not maintained. Deleting them is losing data, so only a person does it.
- Carried in [the record](../architecture/the-record.md); implemented by the [record keeper](../specs/record-keeper.md) spec.

## Related
[0081](0081-nothing-about-people-in-the-repository.md), [0082](0082-record-as-markdown-with-ids.md), [0083](0083-trace-trailer-on-every-commit.md).
