# 0102. A proposal is shown before a claimed area is built

- Status: Accepted
- Scope: The plan
- Date: 2026-11-21
- Decided by: The builders, in the plan of 2026-11-21. The owner did not make this choice.
- Source: Old docs/plan.md, P36 (section 6, "Taste").

## Context
- People can put their own taste into parts of the software; by default the product decides, and a person claims the areas they want to see before they are built ([0022](0022-people-can-put-in-their-taste.md)).
- Seeing running software is the cheapest way to catch a mismatch ([0013](0013-mismatch-of-intent-is-the-mistake-that-matters.md)).
- An area is claimed in the session under a role, in its own words ("the look of the main screen", "the API's naming").

## Decision
- Before a claimed area is built, a proposal is shown in the session under the claiming role: a screenshot of a quick prototype, or a short list.
- It is decided there; other tasks go on.
- What they say becomes `T` items. Those that can be checked go into the checker's scenarios.
- Small wishes come in as intake.

## Reason
Something to look at is the cheapest way to catch a mismatch ([0013](0013-mismatch-of-intent-is-the-mistake-that-matters.md)). Review points exist only where someone claimed an area ([0022](0022-people-can-put-in-their-taste.md)).

## Alternatives considered
| Alternative | Why rejected |
| --- | --- |
| A written description to approve | Something to look at is the cheaper way to catch a mismatch. |
| Review of every area by default | Rejected by the owner's default ([0022](0022-people-can-put-in-their-taste.md)). |

## Consequences
- How the prototype is built and captured is [0115](0115-taste-prototypes-on-a-throwaway-branch.md).
- Carried in [intake and reporting](../architecture/intake-and-reporting.md); implemented by the [line engine](../specs/line-engine.md) and [page](../specs/page.md) specs.

## Related
[0084](0084-who-has-the-last-word.md), [0090](0090-scenarios-out-of-the-builders-reach.md).
