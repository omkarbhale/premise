# 0129. The builders' reading of effort per software and milestone waits

- Status: Accepted, as the builders' reading; partly superseded by [0138](0138-priority-is-a-field-from-milestone-1.md): priority is a field from milestone 1, not milestone 7
- Scope: The plan
- Date: 2026-11-21
- Decided by: The builders. The owner did not make these choices. They read what the owner asked for in [0128](0128-effort-per-software-and-milestone-waits.md); the owner's words are in that record and nothing here is the owner's.
- Source: [0128](0128-effort-per-software-and-milestone-waits.md), the [subscription and sandbox test](../record/subscription-sandbox-test-2026-11-21.md), [0064](0064-cost-and-spending-limit-from-usage-ledger.md).

## Context

- The owner asked for effort per software and for milestones with waits, and said nothing about how. Each choice below is a builders' choice, to be corrected by the owner if it misses what they meant. Whether the reading is right is an [open question](../open-questions.md#open-with-the-owner).
- Words: a software's **milestones** are stops along the work on that software, not premise's own [roadmap](../product/roadmap.md) milestones.

## Decision

Each is a builders' choice, open to the owner's correction:

1. **Milestones are proposed by premise and edited by the operator.** premise proposes a software's milestones; the operator edits them.
2. **Each milestone ends at running software and a report.** Where a wait is set on a milestone, premise stops there until the operator says to go on.
3. **A wait is where the operator judges whether the software is fixing the right problem.** The stop comes with the way back to Why ([the line](../architecture/the-line.md)), as the line already gives when people do not want a software.
4. **Usage shares rely on usage-ledger** ([0064](0064-cost-and-spending-limit-from-usage-ledger.md)), as the spending limit does.
5. **The weekly usage figure is visible in Claude Code's own stream.** The first test saw the subscription's seven-day window and its utilization in the rate-limit events of every run ([test record](../record/subscription-sandbox-test-2026-11-21.md)).
6. **Priority orders the work queue between softwares.**

Where each is built, also a builders' choice:
- Milestone waits belong in milestone 1: they are cheap, and they are the guard the owner asked for.
- Effort by share or by priority comes with cost in milestone 2, and with several softwares in milestone 7.

## Reason

- Waits at running software and a report give the operator something to judge the software by, at a cost of one stop; milestone 1 already ends each change at running software and a report ([roadmap](../product/roadmap.md)).
- Shares need usage figures, which come from usage-ledger in milestone 2; priority only means something between several softwares, which is milestone 7.

## Alternatives considered

| Alternative | Why rejected |
| --- | --- |
| The operator writes the milestones alone | Against [0006](0006-llm-does-what-it-can.md): an LLM can propose them. Not put to the owner. |
| Effort shares in milestone 1 | They need usage figures from usage-ledger, which is milestone 2's prerequisite. |
| Premise counting its own usage for shares | [0064](0064-cost-and-spending-limit-from-usage-ledger.md): premise builds no cost tracking of its own. |

## Consequences

- Carried in the [work queue](../specs/work-queue.md), the [line engine](../specs/line-engine.md), [models and cost](../architecture/models-and-cost.md) and the [roadmap](../product/roadmap.md).
- If the owner corrects a point, a new record supersedes this one.

- **Partly superseded by** [0138](0138-priority-is-a-field-from-milestone-1.md): priority is a field on each software from milestone 1.

## Related

[0128](0128-effort-per-software-and-milestone-waits.md), [0064](0064-cost-and-spending-limit-from-usage-ledger.md), [0106](0106-per-software-and-with-premise.md), [0074](0074-two-agent-sessions-at-once.md).
