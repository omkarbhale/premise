# 0079. premise listens on localhost only

- Status: Accepted
- Scope: The plan
- Date: 2026-11-21
- Decided by: The builders, in the plan of 2026-11-21. The owner did not make this choice.
- Source: Old docs/plan.md, P13 (section 2, "Reach").

## Context
- premise runs on the owner's machine first ([0043](0043-runs-on-the-owners-machine-first.md)).
- Work stops for the owner on security-sensitive actions ([0053](0053-when-work-stops-for-the-owner.md)); security holes are on the floor ([0056](0056-what-is-on-the-floor.md)).

## Decision
- premise listens on localhost only.
- Being reached from other machines is a later decision for the owner, because it is security-sensitive. Until then, premise is used only at the owner's machine.

## Reason
Anything reachable from outside the machine is security-sensitive ([0053](0053-when-work-stops-for-the-owner.md), [0056](0056-what-is-on-the-floor.md)).

## Alternatives considered
| Alternative | Why rejected |
| --- | --- |
| Listening on every network interface by default | Anything reachable from outside the machine is security-sensitive. |

## Consequences
- Built software runs on the same machine.
- Hosting premise itself comes with milestone 5; accounts are decided then ([0045](0045-a-link-per-person-no-accounts.md), [roadmap](../product/roadmap.md)).
- Carried in [where it runs](../architecture/where-it-runs.md); implemented by the [page server](../specs/page-server.md) spec.

## Related
[0078](0078-session-token-and-header-checks.md), [0065](0065-one-open-session.md).
