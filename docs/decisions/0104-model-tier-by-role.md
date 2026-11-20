# 0104. Model tier by role

- Status: Accepted
- Scope: The plan
- Date: 2026-11-21
- Decided by: The builders, in the plan of 2026-11-21. The owner did not make this choice.
- Source: Old docs/plan.md, P38 (section 7, "Models").

## Context
- The mistake that matters is a mismatch of intent ([0013](0013-mismatch-of-intent-is-the-mistake-that-matters.md)).
- All agents share the owner's subscription limits ([0046](0046-claude-through-the-owners-subscription.md)).

## Decision
- The strongest tier for conversation, plan, build, check and readings.
- A fast tier for triage and for drafting reports.

## Reason
A mistake in intent or in the build costs more rounds than the usage saved; triage and report drafting are easy work.

## Alternatives considered
| Alternative | Why rejected |
| --- | --- |
| One model for everything | Triage and report drafting are easy work. |
| A cheaper tier for building | More failed checks. |

## Consequences
- Tiers for the roles the plan does not name (researcher, reviewer, reader) are set in [0113](0113-agent-roles.md).
- Carried in [models and cost](../architecture/models-and-cost.md); implemented by the [agent runner](../specs/agent-runner.md) spec.

## Related
[0091](0091-checker-same-provider-strongest-tier.md), [0105](0105-tier-aliases.md).
