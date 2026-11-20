# 0101. The gate asks in the session, under the role whose call it is

- Status: Accepted
- Scope: The plan
- Date: 2026-11-21
- Decided by: The builders, in the plan of 2026-11-21. The owner did not make this choice.
- Source: Old docs/plan.md, P35 (section 6, "The floor, and how premise slows down for it").

## Context
- Floor actions are listed in [0100](0100-floor-actions.md); every one passes the gate.
- For building premise itself, work stops for the owner only on destructive, security-sensitive, public-facing or money-spending actions ([0053](0053-when-work-stops-for-the-owner.md)).
- Everything is open in one session; roles are labels on what is asked ([0065](0065-one-open-session.md)).

## Decision
- The gate asks in the session, under the role whose call it is, saying exactly what will happen and why.
- Only the work that depends on the answer waits.
- The session can approve one action, or a named kind of action for one software, such as status comments on its issues.
- Approvals are recorded and can be withdrawn.
- Deleting data and spending money are always asked one at a time.

## Reason
The floor is slow on purpose; everything else proceeds and is reported. [0053](0053-when-work-stops-for-the-owner.md) holds the same rule for building premise.

## Alternatives considered
| Alternative | Why rejected |
| --- | --- |
| Asking for every action | Everything off the floor proceeds and is reported. |
| Approvals that cover every software | The plan gives no further reason. |

## Consequences
- A comment on a GitHub issue telling a sender where their item stands is public and in the owner's name, so it goes through the gate.
- Carried in [the floor and the gate](../architecture/the-floor-and-the-gate.md); implemented by the [gate](../specs/gate.md) and [page](../specs/page.md) specs.

## Related
[0084](0084-who-has-the-last-word.md), [0099](0099-notices-in-the-session.md).
