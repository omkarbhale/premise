# Usage and budgets specification

Status: specification, built ([0200](../decisions/0200-how-cost-and-the-spending-limit-are-built.md)). Related: [usage-ledger contract](usage-ledger.md), [work queue](work-queue.md), [reporter](reporter.md), [page](page.md), [models and cost](../architecture/models-and-cost.md).

## 1. Purpose

premise shows what the work cost, per software, phase, step, change and record item, and lets the operator decide how much each software may use ([0128](../decisions/0128-effort-per-software-and-milestone-waits.md)). The figures come from usage-ledger, mocked until it exists ([0133](../decisions/0133-usage-ledger-is-mocked-until-it-exists.md)); premise counts nothing of that kind itself, except what each real session's own result says it used ([0270](../decisions/0270-premises-own-figures-and-asks-that-cost-attention-honestly.md)). That, and its own measured facts (agent sessions and the time they worked), sit beside the ledger's figures, before them, and are never labelled mocked. The code is `src/usage/`.

## 2. Responsibilities and non-responsibilities

Responsible for:

- keeping the session records usage-ledger reads ([contract](usage-ledger.md) section 2);
- putting premise's own counts beside usage-ledger's figures, in the Usage view and in reports, with every ledger figure labelled while it is mocked;
- each software's budget: storing what the operator set, telling usage-ledger, and acting on an overrun;
- the operator's three answers to an overrun.

Not responsible for: working out cost or an overrun (usage-ledger), pausing the subscription's usage limit (the work queue, [5.4](work-queue.md)), or ordering work between softwares (priority, [0138](../decisions/0138-priority-is-a-field-from-milestone-1.md)).

## 3. Interfaces

Page API (all need the session token):

| Route | Does |
|---|---|
| `GET /api/usage` | The week so far, and every software's usage view. |
| `GET /api/softwares/:id/usage` | One software: total, by phase, step, change and record item; its budget and any overrun. |
| `POST /api/softwares/:id/budget` | Sets the budget: `{kind: "none"}`, `{kind: "share", percent}` or `{kind: "amount", usd}`. |
| `POST /api/softwares/:id/budget/answer` | The operator's answer to an overrun: `{answer: "raise", budget}`, `{answer: "finish-change"}` or `{answer: "leave-paused"}`. |

Errors are in plain words and say what to do (a bad number, nothing to answer, nothing to finish).

## 4. Data owned

- `softwares.weekly_share_percent` and `softwares.budget_usd`: the budget, one of the two (setting one clears the other). Defaults come from `softwares.default_weekly_share_percent` and `softwares.default_weekly_budget_usd`.
- `budget_overruns`: one row each time a software overran: when, the budget, what was spent on what at that time, the operator's answer and when, and for "finish the change" the piece of work allowed to finish.
- The session records are not a table of their own: they are read from `agent_sessions` joined to `jobs`, so there is one record of each session, kept over a restart ([storage](storage.md)).

## 5. Behaviour

### 5.1 What is shown

- Per software: a total, then groupings by phase (Understand, Build, Running, and other work), by step, by change (a piece of work, named by its title, or "the software, from the idea") and by record item. Each row has premise's own sessions and time worked, and usage-ledger's tokens, dollars at list prices and share of a week.
- A session on several record items counts in full for each item (sessions, time), while its dollars are shared among them; the page says so.
- Every ledger figure carries the Mocked mark wherever it appears: the Usage view, the cost block of every report and the overrun notice. The sessions and time do not.
- Reports: the Cost section names the total and the budget and, under a fold, the lines per step, change and item; an overrun is the first line under Needed.

### 5.5 premise's own count

- Every agent job names the work item it serves (and its milestone), so a session is attributed to the change it served. The contract's `workItem` is on every Build, Check and Run job as it is on those of the line engine. Only work that belongs to no change (such as reading an intake item) is "not part of a change".
- Each real session's result carries its turns, tokens (input, output, cache) and cost at list prices. They are kept on the session's own record (`agent_sessions.figures`). A scripted agent, or a session that ended without a result, has none.
- The Usage view and reports show these as "premise's own count": per software, per phase, per step and per change, before the mocked figures, and not marked mocked. Where sessions have none, the row says "no figures for N sessions" and why (scripted agents report none; or the session ended without a result); a missing figure is never added as zero. This holds within a session too: when a result omitted its cost, tokens or turns, that part is left out of the sum and said to be "not reported" (by how many sessions), not shown as zero.
- The weekly window: each rate-limit event of a real session's stream carries the share of each window used. premise keeps the latest reading of each (`usage_windows`) and shows the weekly one on the Usage view, "as the agents last reported it", with how long ago it was read. Before any real session has reported it, the page says there is no reading. It is premise's own reading and is not marked mocked; the mocked weekly figure is shown apart from it.
- These are list prices, as the stream reports them, not what a subscription charges.

### 5.2 Setting a budget

- By share of a week's usage (1 to 100) or by an amount in dollars a week at list prices (at least one cent), from the Usage view, or the settings for a new software. Setting one replaces the other; "no budget" removes it.
- premise tells usage-ledger at once, and again for every software each time it starts.

### 5.3 An overrun

1. After any change to a job (a session starting or ending), premise asks usage-ledger for the software's budget status. While it asks, the work queue starts nothing for that software, so one more job cannot slip through.
2. When usage-ledger says overrun and the software is active, its state becomes `paused-budget`, a row is added to `budget_overruns` with what was spent on what (by step and by change), and an event is recorded so open pages update.
3. No new agent job starts for it. A session already running finishes. Its questions stay answerable. Other softwares are not touched and keep running in priority order.
4. The operator is told plainly, in the software's status line, on its page, on the Usage view and in its report: what it used, what the budget was, what it went on, that the figures are mocked while they are, and the three answers.
5. The answers:
   - **Raise the budget.** A new budget, as a share or an amount. It must be above what was used, as usage-ledger judges it; otherwise the old budget stays, the software stays paused, and the error says how much was used. When accepted, the software is active again and its queue starts.
   - **Let it finish the current change.** The piece of work being worked on (the running job's, else the oldest waiting or queued one) and its parts are allowed to finish: only jobs of that piece start. When none are left, the software stays paused. With nothing being worked on, the error says so.
   - **Leave it paused.** Nothing changes except that the answer is kept; the notice stays until the budget is raised, even when the week resets.
6. The software becomes `paused-budget` only from `active`; one waiting at a milestone is looked at again when it goes on.

### 5.4 Restarts

The paused state, the budget and the operator's answer are in the database, so a restart keeps a paused software paused. At start premise tells usage-ledger every budget and looks for any overrun before the queue starts work. An overrun not yet answered is still asked.

When the week resets and a software paused for its budget is within it again, it resumes by itself and says so in its conversation ("The week reset; <name> is within its budget again and has resumed"), unless the operator chose to leave it paused. Chosen for the owner, open to correction. Paused softwares are looked at again at start and every five minutes.

## 6. Configuration

| Key | Default | Meaning |
|---|---|---|
| `usage_ledger.mode` | `mock-fixed` | Where usage figures come from; `real` is not built. |
| `usage_ledger.seed` | none | Seed for `mock-random`. |
| `usage_ledger.mock_weekly_allowance_usd` | 100 | The mock's worth of a whole week's usage. |
| `usage_ledger.mock_cost_scale` | 1 | The mock's multiplier on every session's cost. |
| `softwares.default_weekly_share_percent` | none | Budget of a new software as a share of a week's usage. |
| `softwares.default_weekly_budget_usd` | none | Budget of a new software as dollars a week; used if both are set. |

Which model and effort each type of task uses, and how many sessions run at once, are `agents.tasks.<kind>.*` and `queue.max_agent_sessions` ([configuration](../reference/configuration.md)).

## 7. Limits

- Figures are only as good as usage-ledger's; the mock's are made up and say so.
- Budgets are weekly. A budget in dollars is at list prices, which is not what a subscription charges.
- premise does not stop a running session for an overrun; the turn and time limits ([0088](../decisions/0088-turn-and-time-limits.md)) do that.

## 8. Failure modes and recovery

| Failure | Effect | Recovery |
|---|---|---|
| usage-ledger cannot be read | Nothing is paused; the page and report say the cost figures could not be read | Work carries on under the turn and time limits |
| premise stops while paused | The software stays paused | Start premise; the notice is still there |
| A raised budget is still below use | Refused, old budget kept | Raise it higher, or choose another answer |
