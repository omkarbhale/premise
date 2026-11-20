# 0113. Nine agent roles: the plan's seven plus reviewer and reader

- Status: Accepted
- Scope: The plan
- Date: 2026-11-21
- Decided by: The builders, in the documentation restructure of 2026-11-21. The owner did not make this choice.
- Source: The documentation restructure of 2026-11-21.

## Context
- The plan names seven agent roles: drafter, researcher, planner, builder, checker, triager, reporter (old `docs/plan.md`, section 1).
- The plan also asks for work none of them is named for:
  - "an agent compares every proposed record change with the whole record" against silent contradiction ([0014](0014-guard-against-further-big-mistakes.md));
  - foundation decisions get "a review by a second agent before building";
  - readings of held intake, listed among strongest-tier work ([0096](0096-when-held-items-are-read.md), [0104](0104-model-tier-by-role.md)).
- The plan sets no tier for the researcher.

## Decision
Agent roles are drafter, researcher, reviewer, planner, builder, checker, triager, reader, reporter.
- drafter: Why, Who, What and say-back drafts; corrections in chat during a stage; recovering the record of existing software.
- researcher: What exists, full and at smaller sizes.
- reviewer (new): compares every proposed record change with the whole record, and gives foundation decisions the second agent's review the plan asks for.
- planner, builder, checker, triager, reporter: as in the plan.
- reader (new): reads held intake items together and writes the short list for the operator.

Tiers: strongest for drafter, researcher, reviewer, planner, builder, checker, reader; fast for triager and reporter.

## Reason
- The plan needs an agent for the contradiction check and the foundation review, and lists readings among strongest-tier work, but names no role for either.
- An agent checking its own change is the self-check the prior art warns against: agents game checks they can touch ([0030](0030-independent-check.md)).
- Readings judge purpose, which triage at the fast tier should not.

## Alternatives considered
| Alternative | Why rejected |
| --- | --- |
| The proposing agent checks its own record change | A self-check; agents game checks they can touch. |
| The checker reviews record changes and foundations | It judges running software and must stay independent of the plan. |
| The triager does readings | The fast tier is for easy work ([0104](0104-model-tier-by-role.md)); readings judge purpose. |
| The researcher at the fast tier | "Do not build" is a costly outcome to get wrong. |

## Consequences
- Each role has one prompt file ([prompts](../prompts/README.md)) and only the tools its role needs ([agent tools](../specs/agent-tools.md)).
- Job kinds in the work queue include review and reading ([work queue](../specs/work-queue.md)).

## Related
[0073](0073-mcp-tools-with-session-tokens.md), [0104](0104-model-tier-by-role.md), [0114](0114-prompts-and-skills-as-files.md).
