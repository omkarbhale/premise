# 0100. Floor actions

- Status: Accepted
- Scope: The plan
- Date: 2026-11-21
- Decided by: The builders, in the plan of 2026-11-21. The owner did not make this choice.
- Source: Old docs/plan.md, P34 (section 6, "The floor, and how premise slows down for it").

## Context
- A floor of things never traded for speed was accepted in principle ([0015](0015-a-floor-never-traded-for-speed.md)).
- The owner settled what is on it: losing data, security holes, spending money, acting publicly in someone's name, and false reports ([0056](0056-what-is-on-the-floor.md)). How premise slows down for each was left to the plan.

## Decision
Floor actions:
- losing data: deleting or overwriting anything outside a working copy, force-pushing, deleting repositories or branches with unmerged work, dropping a running software's stored data;
- security holes: handling credentials, exposing anything beyond localhost, changing who can get in;
- spending money: paid services, API keys, cloud resources, paid extra usage on a subscription;
- acting publicly in someone's name: making a repository public, publishing a package or release, posting comments or messages;
- false reports: prevented by P31 ([0097](0097-reports-from-recorded-facts.md)) rather than asked about.

Agents cannot take a floor action. They hold no credentials and run confined ([0087](0087-agents-run-confined.md)), and can only request one through their tool. Instructions are not access control; the prior art's destructive incidents all had credentials within reach.

## Reason
These are the owner's floor ([0056](0056-what-is-on-the-floor.md)), made concrete enough for the gate to recognise.

## Alternatives considered
| Alternative | Why rejected |
| --- | --- |
| Leaving it to each agent to judge what is risky | Not concrete enough for the gate to recognise; instructions are not access control. |

## Consequences
- Every first deployment to a public host is public-facing and may spend money, so it is asked (milestone 7, [roadmap](../product/roadmap.md)).
- Carried in [the floor and the gate](../architecture/the-floor-and-the-gate.md); implemented by the [gate](../specs/gate.md) spec and the-floor skill ([skills](../skills/README.md)).

## Related
[0101](0101-the-gate-asks-in-the-session.md), [0053](0053-when-work-stops-for-the-owner.md).
