# 0096. When held items are read together

- Status: Accepted
- Scope: The plan
- Date: 2026-11-21
- Decided by: The builders, in the plan of 2026-11-21. The owner did not make this choice.
- Source: Old docs/plan.md, P30 (section 6, "Triage and routes").

## Context
- Held items are read together from time to time ([0062](0062-intake-goes-in-normally.md), [0095](0095-what-is-held.md)).

## Decision
- Held items are read together when a software has ten held, when two weeks have passed with at least one held, or when the operator asks.
- A reading ends in a short list for the operator: what people seem to want, what keeps coming up, and whether the software's purpose or users should change.
- The operator decides any change of purpose.
- When people do not want the software, premise goes back to Why with the operator ([0036](0036-finding-out-if-people-want-it-is-out.md)).

## Reason
Enough items to see a pattern, without leaving senders unanswered for long.

## Alternatives considered
| Alternative | Why rejected |
| --- | --- |
| Readings only when someone asks | They would not happen while nobody is watching. |

## Consequences
- Readings are done by the reader agent role ([0113](0113-agent-roles.md)).
- Carried in [intake and reporting](../architecture/intake-and-reporting.md); implemented by the [intake](../specs/intake.md) and [work queue](../specs/work-queue.md) specs.

## Related
[0095](0095-what-is-held.md), [0041](0041-intake-can-be-held.md).
