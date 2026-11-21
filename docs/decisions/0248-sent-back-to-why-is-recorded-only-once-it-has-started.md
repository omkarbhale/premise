# 0248. "Sent back to Why" is recorded only once it has started

- Status: Accepted
- Scope: Milestone 4
- Date: 2026-11-21
- Decided by: The builders; chosen for the owner by the assistant during validation, open to the owner's correction.
- Source: Validation of readings of held items ([0242](0242-readings-name-their-items-and-the-operator-decides-each-line.md)), [0185](0185-how-intake-in-a-thin-form-is-built.md) point 14.

## Context

- After a reading of held items the operator can choose to go back to Why. If the record said "sent back" the moment the button was pressed, and the return then failed to begin, the page would say something that did not happen and the operator could not try again.

## Decision

1. **The reading is marked as sent back only once going back to Why has actually started.** The mark is made when the return begins, and is removed again if it did not begin.
2. **If it did not begin,** the conversation says so in plain words, that the Why conversation did not start, and the operator can try again from the Intake tab.
3. **A reading can be sent back once.** Pressing again after it started says it was already done.

## Reason

- Builders' note: a record that says an action happened must be about an action that happened ([0097](0097-reports-from-recorded-facts.md)).
- Chosen for the owner: it costs the operator nothing, and the alternative is a silent dead end.

## Alternatives considered

| Alternative | Why rejected |
| --- | --- |
| Mark it when the button is pressed and leave it | A failure would leave a false mark and no way to try again. |

## Consequences

- The Intake tab's "sent back" is always true.

## Related

[0185](0185-how-intake-in-a-thin-form-is-built.md), [0242](0242-readings-name-their-items-and-the-operator-decides-each-line.md), [intake spec](../specs/intake.md).
