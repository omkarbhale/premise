# 0247. A take-on that is still copying, or whose copy failed, takes nothing in

- Status: Accepted
- Scope: Milestone 6
- Date: 2026-11-21
- Decided by: The builders; chosen for the owner by the assistant during validation, open to the owner's correction.
- Source: Validation of taking on existing software ([0189](0189-how-taking-on-existing-software-is-built.md)), [0188](0188-existing-softwares-record-and-hand-edits.md).

## Context

- Bringing in existing software starts by making premise's own copy. Until the copy is whole, what is in it is not the software.

## Decision

1. **While the copy is still being made, or after it failed, nothing is taken in:** no record is recovered, no question is asked about it, no work is started on it, and nothing is written to the person's repository.
2. **A failed copy says why in plain words** and offers trying again.
3. **If premise stops while copying,** it copies again from the start when it next starts, and says so.

## Reason

- Builders' note: a recovered record built from half a copy would say untrue things about the software and the person would be asked to strike out statements about files that were never read.
- Chosen for the owner: stopping at a visible failure is cheaper in attention than a wrong record.

## Alternatives considered

| Alternative | Why rejected |
| --- | --- |
| Recover from whatever was copied | The record would describe an incomplete software. |
| Remove the failed take-on | The person would lose the reason and have to start over without knowing what went wrong. |

## Consequences

- A take-on is either complete and in, or visibly not yet.

## Related

[0189](0189-how-taking-on-existing-software-is-built.md), [line spec](../specs/line-engine.md).
