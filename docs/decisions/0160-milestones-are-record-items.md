# 0160. A software's milestones are record items; its priority stays in the database

- Status: Accepted
- Scope: Making premise
- Date: 2026-11-22
- Decided by: The builders. The owner did not make this choice. It carries out the builders' reading in [0129](0129-builders-reading-of-effort-and-milestone-waits.md), which is open to the owner's correction.
- Source: [0128](0128-effort-per-software-and-milestone-waits.md), [0129](0129-builders-reading-of-effort-and-milestone-waits.md), [0138](0138-priority-is-a-field-from-milestone-1.md).

## Context

- A software's milestones are to be proposed by premise and edited by the operator, each with a wait the operator can set. They are part of what the software is meant to become, so they belong with its record.

## Decision

- Milestones are items `M-n` in `premise/milestones.md`, one per line, in order. A wait is the mark `wait` on the line.
- They go through the same checks, say-back rules and trailers as every other item. Milestones are not sent to the say-back when replaced.
- The software's priority and its share of weekly usage stay in premise's database, because they are premise's own settings about how it spends effort and not a fact about the software ([0138](0138-priority-is-a-field-from-milestone-1.md)). The record keeper reads them together with the milestones as one effort plan, for the page.

## Reason

- A milestone's text and place in the order are a fact about the software, and survive premise. A priority is how much of premise's attention the software gets, and would be wrong the day the owner changes it.

## Alternatives considered

| Alternative | Why rejected |
| --- | --- |
| Milestones in premise's database | The record would not hold what the software is meant to become; the software's own repository would not say. |
| Priority in the record | It is premise's setting, not the software's. |

## Consequences

- `milestones.md` is one more file in the record, with the kind `M`.
- Reaching a milestone is not marked in the record yet; it is a fact for the line engine's events.

## Related

[0128](0128-effort-per-software-and-milestone-waits.md), [0129](0129-builders-reading-of-effort-and-milestone-waits.md), [0138](0138-priority-is-a-field-from-milestone-1.md), [0159](0159-how-the-record-keeper-is-built.md).
