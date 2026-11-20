# 0092. Security defaults for every software

- Status: Accepted
- Scope: The plan
- Date: 2026-11-21
- Decided by: The builders, in the plan of 2026-11-21. The owner did not make this choice.
- Source: Old docs/plan.md, P26 (section 5, "Check").

## Context
- The operator may only know what the software is for ([0008](0008-operator-knows-the-purpose.md)).
- Security holes are on the floor ([0056](0056-what-is-on-the-floor.md)).
- "Security defaults for an operator who cannot judge them" was handed to the builders (old decisions.md, "Open or parked").

## Decision
Security defaults for every software, applied in the plan and checked by the checker:
- no secrets in the repository; secrets in a local file that git ignores;
- anything that listens on a network binds to localhost unless the operator decided otherwise (a gated act);
- anything other people can reach has a lock on it, decided in the plan;
- dependencies from the main registries, pinned by a lock file, checked for known advisories;
- input from people validated; database queries parameterized;
- stored data backed up before any change that migrates it.

## Reason
When the operator cannot judge security, the defaults are the security (the prior art's insecure-defaults failure).

## Alternatives considered
| Alternative | Why rejected |
| --- | --- |
| Leaving security to each software's plan | An operator who cannot judge security would be left with whatever each plan chose. |

## Consequences
- The planner applies them at the Plan stage; the checker checks that they hold on every change.
- Carried in [the floor and the gate](../architecture/the-floor-and-the-gate.md); implemented by the [line engine](../specs/line-engine.md) and the security-defaults skill ([skills](../skills/README.md)).

## Related
[0100](0100-floor-actions.md), [0089](0089-checker-in-a-fresh-session.md).
