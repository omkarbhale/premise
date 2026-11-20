# 0089. The checker is a fresh session that never sees the builder's account

- Status: Accepted
- Scope: The plan
- Date: 2026-11-21
- Decided by: The builders, in the plan of 2026-11-21. The owner did not make this choice.
- Source: Old docs/plan.md, P23 (section 5, "Check").

## Context
- The check is a different agent from the builder, cannot be edited by it, and judges the running result against the intent, "not against the builder's account of what it did" ([0030](0030-independent-check.md)).

## Decision
The checker is a fresh session with its own working copy of the commit under check. It never sees the builder's transcript, summary or claims.

## Reason
It judges the running result against the intent, not the builder's account ([0030](0030-independent-check.md)).

## Alternatives considered
| Alternative | Why rejected |
| --- | --- |
| A review of the builder's diff and report | It would judge the builder's account, not the running result. |

## Consequences
- The checker builds and starts the software from `run.md` in its own copy and uses it as a user would; its verdict per item is met, not met, or could not check, each with evidence.
- Carried in [build, check and run](../architecture/build-check-run.md); implemented by the [agent runner](../specs/agent-runner.md) and [agent tools](../specs/agent-tools.md) specs.

## Related
[0090](0090-scenarios-out-of-the-builders-reach.md), [0091](0091-checker-same-provider-strongest-tier.md), [0097](0097-reports-from-recorded-facts.md).
