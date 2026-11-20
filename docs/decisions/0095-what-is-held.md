# 0095. Held means only items that mean little alone and something together

- Status: Accepted
- Scope: The plan
- Date: 2026-11-21
- Decided by: The builders, in the plan of 2026-11-21. The owner did not make this choice.
- Source: Old docs/plan.md, P29 (section 6, "Triage and routes").

## Context
- Most intake goes into the line as first intended; only the items that need holding are held and read together later ([0062](0062-intake-goes-in-normally.md)).
- Which items need holding was left to the plan.

## Decision
Held means only items that mean little one at a time and something together:
- opinions on whether the software is wanted or useful;
- wishes that pull against the record's purpose or users;
- one user's request that conflicts with what other users asked;
- ideas whose worth is unclear without more like them.

## Reason
These are where patterns show what people want ([0041](0041-intake-can-be-held.md)); acting on each alone would pull the software back and forth.

## Alternatives considered
| Alternative | Why rejected |
| --- | --- |
| Holding by default | Corrected by the owner ([0062](0062-intake-goes-in-normally.md)). |
| Acting on every item at once | Acting on each alone would pull the software back and forth. |

## Consequences
- Carried in [intake and reporting](../architecture/intake-and-reporting.md); implemented by the [intake](../specs/intake.md) spec.

## Related
[0041](0041-intake-can-be-held.md), [0096](0096-when-held-items-are-read.md).
