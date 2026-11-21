# 0200. How cost and the spending limit are built

- Status: Accepted
- Scope: Milestone 2
- Date: 2026-11-21
- Decided by: The builders; the points marked "chosen for the owner" are the owner's to correct.
- Source: [0016](0016-coarse-cost-tracking.md), [0048](0048-a-spending-limit.md), [0064](0064-cost-and-spending-limit-from-usage-ledger.md), [0128](0128-effort-per-software-and-milestone-waits.md), [0133](0133-usage-ledger-is-mocked-until-it-exists.md), the [roadmap's milestone 2](../product/roadmap.md#milestone-2-cost-and-the-spending-limit-through-usage-ledger), and the task that built it.

## Context

- The plan says premise records which task each session did, reads usage per software, stage, change and item from usage-ledger, sets budgets, and pauses a software that overruns. It does not say how a session record is kept, what a budget is, what "overrun" asks of the operator, or how the mock is made to overrun on purpose.

## Decision

1. **One record of each session, read, not pushed.** The session records usage-ledger reads are the work queue's existing `agent_sessions` rows joined to their jobs (session id, software, work item, stage, type of task, record items, model, effort, start and end), for every real and scripted session. premise hands usage-ledger a way to read them (`attach`) once; there is no second copy to keep in step, and the records survive a restart with the database. The contract is [usage-ledger.md](../specs/usage-ledger.md).
2. **The mock works from those records.** Figures are worked out per session from its model tier, effort and a seed (`mock-random`), so they change as the work goes, add up across stage, change and item, and are the same after a restart. A session on several record items shares its cost among them equally. Every result is marked mocked.
3. **A budget is a share of weekly usage or an amount in dollars a week at list prices.** Setting one clears the other; if both come from settings the amount is used. The operator sets it in plain words on the Usage view; new softwares take `softwares.default_weekly_share_percent` or `softwares.default_weekly_budget_usd`. Chosen for the owner (the owner said "share of weekly usage or by priority", [0128](0128-effort-per-software-and-milestone-waits.md)): an amount is offered too, because a share means little without knowing what a week is worth, and the mock's week is a setting (`usage_ledger.mock_weekly_allowance_usd`).
4. **usage-ledger decides what an overrun is; premise acts on it.** After any change to a job premise asks for the software's budget status; the work queue starts nothing for that software while it asks, so no extra job slips through. On an overrun the software becomes `paused-budget`: no new agent job starts, a running session finishes, other softwares carry on.
5. **Three answers, always offered together.** Raise the budget (it must be above what was used, otherwise it is refused and the old budget stays); let it finish the current change (only jobs of the piece of work being worked on, and its parts, start; then it stops again); leave it paused (kept as an answer, the notice stays). Chosen for the owner: "the current change" is the piece of work of the running job, or else the oldest waiting or queued one, because that is what the operator sees as "what it is on".
6. **Told in every place the operator looks.** The software's status line and page, the Usage view, and the first line under Needed in its report, each saying what was spent on what (by step and by change), that the figures are mocked while they are, and the three answers.
7. **Measured beside mocked.** Every group shows premise's own sessions and time worked, which are not labelled mocked, next to usage-ledger's tokens, dollars and share of a week, each labelled. A session on several items counts in full for each (sessions, time) while its dollars are shared; the page says so.
8. **A deliberate overrun is scriptable.** The mock can be told to report an overrun after a number of sessions (`scriptOverrun`), and `usage_ledger.mock_cost_scale` makes every session cost more, so a small budget is overrun by the first session. The kept demo uses a small budget.
9b. **A new week lifts the pause.** Chosen for the owner, open to correction: a software paused for its weekly budget resumes by itself when the week rolls over and it is within budget again, saying in its conversation "The week reset; <name> is within its budget again and has resumed". One the operator chose to leave paused stays paused until the operator resumes it by raising the budget. Paused softwares are looked at again at start and every five minutes.
9. **Unreadable means unlimited, and says so.** When usage-ledger cannot be read, nothing is paused for want of an answer, work carries on under the turn and time limits ([0088](0088-turn-and-time-limits.md)), and the page and report say the figures could not be read.

## Reason

- Builders' note: reading the records the queue already keeps avoids a second source of truth and makes a restart harmless. Holding a software's jobs while its budget is looked at is what makes "pauses when overrun" exact rather than "one job later". Offering three answers together follows the owner's [0128](0128-effort-per-software-and-milestone-waits.md): the operator decides how much effort a software gets.

## Alternatives considered

| Alternative | Why rejected |
|---|---|
| premise pushes a record to usage-ledger as each session starts and ends | A second copy to keep in step, lost in the mock on restart. |
| premise works out the overrun from the figures | Against [0064](0064-cost-and-spending-limit-from-usage-ledger.md): usage-ledger decides. |
| Stop a running session at the overrun | A cut-off session wastes what it used; the turn and time limits already bound a session. |
| Budgets as a share only | A share needs a known week; an amount is plain to anyone. |
| Pause all work for one software's overrun | The owner wants a software's effort set per software ([0128](0128-effort-per-software-and-milestone-waits.md)). |

## Consequences

- New migration 12: `softwares.budget_usd` and the `budget_overruns` table ([storage](../specs/storage.md)); new settings `usage_ledger.mock_weekly_allowance_usd`, `usage_ledger.mock_cost_scale` and `softwares.default_weekly_budget_usd` ([configuration](../reference/configuration.md)).
- The usage-ledger interface changes: `recordSession` is replaced by `attach`, and breakdown and budget operations are added ([contract](../specs/usage-ledger.md)). New specification [usage and budgets](../specs/usage.md); the [work queue](../specs/work-queue.md) section 5.5 is made concrete.
- The Usage view gains budgets, breakdowns and the overrun notice; reports gain per-step, change and item lines.

## Related

[0016](0016-coarse-cost-tracking.md), [0048](0048-a-spending-limit.md), [0064](0064-cost-and-spending-limit-from-usage-ledger.md), [0128](0128-effort-per-software-and-milestone-waits.md), [0133](0133-usage-ledger-is-mocked-until-it-exists.md), [0138](0138-priority-is-a-field-from-milestone-1.md).
