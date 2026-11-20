# 0084. Who has the last word

- Status: Accepted
- Scope: The plan
- Date: 2026-11-21
- Decided by: The builders, in the plan of 2026-11-21. The owner did not make this choice.
- Source: Old docs/plan.md, P18 (section 3, "Keeping it true"); taken from the [scope page draft](../record/scope-page-draft-0.1.html) table "Who decides what", which was never discussed with the owner.

## Context
- If an LLM cannot reliably do it, it gives its best attempt and a person decides ([0007](0007-llm-does-not-decide-what-it-cannot.md)).
- People's attention is what the product spends least of ([0027](0027-spend-least-of-peoples-attention.md)).
- The table of who has the last word was raised on the scope page and handed to the builders.

## Decision
- Anything that follows from the record and is cheap to undo: premise decides and records why; nothing is asked unless the area is claimed.
- Purpose, users, priorities: premise drafts and suggests; the operator decides.
- An area claimed for taste: premise proposes; it is decided under the role that claimed it.
- What an LLM cannot reliably know or do (an intent nobody stated, real-world acts, accountability): premise gives its best attempt with its reasons; it is asked under the role that decides or acts.
- The floor: the gate asks.

## Reason
It spends people's attention only where being wrong is costly ([0027](0027-spend-least-of-peoples-attention.md)).

## Alternatives considered
| Alternative | Why rejected |
| --- | --- |
| Asking people about every record change | Spends attention where being wrong is cheap. |

## Consequences
- Carried in [the record](../architecture/the-record.md); implemented by the [line engine](../specs/line-engine.md) and [gate](../specs/gate.md) specs.

## Related
[0022](0022-people-can-put-in-their-taste.md), [0101](0101-the-gate-asks-in-the-session.md), [0102](0102-taste-proposals-before-building.md).
