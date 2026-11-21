# 0246. An approved floor action that never finished is marked failed at start-up, and premise never repeats it

- Status: Accepted
- Scope: The plan
- Date: 2026-11-21
- Decided by: The builders; chosen for the owner by the assistant during validation, open to the owner's correction.
- Source: Validation of the gate ([0182](0182-how-the-gate-is-built.md), [0220](0220-approvals-and-verdicts-tell-the-truth.md)); [0056](0056-what-is-on-the-floor.md), [0100](0100-floor-actions.md).

## Context

- A person approves an action on the floor (for example, writing to their repository). premise then carries it out. If premise stops between the approval and the end, the request is left approved with no outcome, and nothing says whether the action happened.

## Decision

1. **At start-up, a request left approved with no outcome is marked failed.** Its outcome says premise stopped before this was carried out, that it may be partly done, and to check whether it happened.
2. **The person is told in the session** and asked whether to ask again.
3. **premise never repeats a floor action by itself.** Doing it again needs a new request and a new approval.

## Reason

- Builders' note: the floor is about things that cannot be undone ([0056](0056-what-is-on-the-floor.md)). Repeating one without being sure it did not already happen can do it twice; guessing that it succeeded would be a false report.
- Chosen for the owner: one more approval is a small cost against doing a floor action twice.

## Alternatives considered

| Alternative | Why rejected |
| --- | --- |
| Carry it out again at start-up | It may already have happened; repeating a floor action is exactly what the floor is there to prevent. |
| Mark it done | Nothing recorded says it was. |
| Leave it approved | It would look pending forever and the person would not know what to do. |

## Consequences

- After a crash the person sees a failed request with plain words and can ask again.

## Related

[0100](0100-floor-actions.md), [0101](0101-the-gate-asks-in-the-session.md), [0182](0182-how-the-gate-is-built.md), [gate spec](../specs/gate.md).
