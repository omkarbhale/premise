# Usage and budgets specification

Status: specification, built ([0200](../decisions/0200-how-cost-and-the-spending-limit-are-built.md), [0330](../decisions/0330-real-sessions-read-the-real-usage-ledger.md)). Related: [usage-ledger contract](usage-ledger.md), [work queue](work-queue.md), [reporter](reporter.md), [page](page.md), [models and cost](../architecture/models-and-cost.md).

## 1. Purpose

premise shows what the work cost, per software, phase, step, change and record item, and lets the operator decide how much each software may use ([0128](../decisions/0128-effort-per-software-and-milestone-waits.md)). The figures come from usage-ledger, which reads Claude Code's own logs ([0330](../decisions/0330-real-sessions-read-the-real-usage-ledger.md)); scripted agents use nothing, so for them the figures are made up and labelled "Demo figures". premise counts nothing of that kind itself, except what each real session's own result says it used ([0270](../decisions/0270-premises-own-figures-and-asks-that-cost-attention-honestly.md)). That, and its own measured facts (agent sessions and the time they worked), sit beside usage-ledger's figures, before them. A figure that is not known is shown as not known, with why, never as zero. The code is `src/usage/`.

## 2. Responsibilities and non-responsibilities

Responsible for:

- keeping the session records usage-ledger reads ([contract](usage-ledger.md) section 2);
- telling usage-ledger when a session starts or ends, so it labels and reads it ([contract](usage-ledger.md) section 3);
- putting premise's own counts beside usage-ledger's figures, in the Usage view and in reports, with every demo figure labelled and every unknown one said to be unknown;
- each software's budget: storing what the operator set, telling usage-ledger, and acting on an overrun that was checked;
- the operator's three answers to an overrun.

Not responsible for: working out cost or an overrun (usage-ledger), pausing the subscription's usage limit (the work queue, [5.4](work-queue.md)), or ordering work between softwares (priority, [0138](../decisions/0138-priority-is-a-field-from-milestone-1.md)).

## 3. Interfaces

Page API (all need the session token):

| Route | Does |
|---|---|
| `GET /api/usage` | Where the figures come from (`source`, `mode`, the command), why they cannot be read (`problem`, null when they can), the week as the agents last reported it, the demo's made-up week (demo only), and every software's usage view. |
| `GET /api/softwares/:id/usage` | One software: total, by phase, step, change and record item; its budget and any overrun. |
| `POST /api/softwares/:id/budget` | Sets the budget: `{kind: "none"}`, `{kind: "share", percent}` or `{kind: "amount", usd}`. |
| `POST /api/softwares/:id/budget/answer` | The operator's answer to an overrun: `{answer: "raise", budget}`, `{answer: "finish-change"}` or `{answer: "leave-paused"}`. |

Errors are in plain words and say what to do (a bad number, nothing to answer, nothing to finish).

## 4. Data owned

- `softwares.weekly_share_percent` and `softwares.budget_usd`: the budget, one of the two (setting one clears the other). Defaults come from `softwares.default_weekly_share_percent` and `softwares.default_weekly_budget_usd`.
- `budget_overruns`: one row each time a software overran: when, the budget, what was spent on what at that time (with where the figures came from; rows from before 0330 say `mocked`), the operator's answer and when, and for "finish the change" the piece of work allowed to finish.
- `ledger_sessions`: what usage-ledger said of each real session (its label, its figures or that it was not in the logs, and when), and `usage_readings`: each reading of the week a real session's stream reported, with the time it was read and when it was given to usage-ledger ([contract](usage-ledger.md)).
- The session records are not a table of their own: they are read from `agent_sessions` joined to `jobs`, so there is one record of each session, kept over a restart ([storage](storage.md)).

## 5. Behaviour

### 5.1 What is shown

- This week: the share of the plan's weekly usage as a real session last reported it, with how long ago and when the week resets; "No reading yet" before any real session reported it. It counts everything on the plan, not only premise.
- Per software: a total (sessions and time; premise's own count; usage-ledger's cost and tokens; its share of this week), then groupings by phase (Understand, Build, Running, and other work), by step, by change (a piece of work, named by its title, or "the software, from the idea") and by record item. Each row has premise's own sessions, time worked and own count, and usage-ledger's dollars at list prices, with how many of its sessions that covers ("$1.20 (2 of 3 sessions)") and why the others have none.
- The share of the week is shown only for a whole software, as an estimate; a row's share is not known, and the page says why once above the table rather than in each row.
- A session on several record items counts in full for each item (sessions, time), while its dollars are shared among them; the page says so.
- Demo figures carry the "Demo figures" mark wherever they appear: the Usage view, the cost block of every report and the overrun notice. Real figures carry no mark. The sessions and time never do.
- When usage-ledger cannot be read, the Usage view says so first, with what to do (install it, or set `usage_ledger.command`); the figures already read stay shown.
- Reports: the Cost section names the total (or why it is not known), the share of this week, and the budget and, under a fold, the lines per step, change and item; an overrun is the first line under Needed.

### 5.5 premise's own count

- Every agent job names the work item it serves (and its milestone), so a session is attributed to the change it served. The contract's `workItem` is on every Build, Check and Run job as it is on those of the line engine. Only work that belongs to no change (such as reading an intake item) is "not part of a change".
- Each real session's result carries its turns, tokens (input, output, cache) and cost at list prices. They are kept on the session's own record (`agent_sessions.figures`). A session cut off without a result (a pause, a stop) keeps the tokens and turns its messages reported as it streamed, its cost not known ([0330](../decisions/0330-real-sessions-read-the-real-usage-ledger.md)), so a session carried on later loses no leg. A scripted agent has none.
- The Usage view and reports show these as "premise's own count": per software, per phase, per step and per change, before usage-ledger's figures. Where sessions have none, the row says "no figures for N sessions" and why (scripted agents report none; or the session ended without a result); a missing figure is never added as zero. This holds within a session too: when a result omitted its cost, tokens or turns, that part is left out of the sum and said to be "not reported" (by how many sessions), not shown as zero.
- The weekly window: each rate-limit event of a real session's stream carries the share of each window used. premise keeps the latest reading of each (`usage_windows`), and every reading with its time (`usage_readings`) to give to usage-ledger, and shows the weekly one on the Usage view, "when a real agent session last reported it", with how long ago it was read. Before any real session has reported it, the page says there is no reading yet. With demo figures, the demo's made-up week is shown apart from it, labelled.
- These are list prices, as the stream reports them, not what a subscription charges.

### 5.2 Setting a budget

- By share of a week's usage (1 to 100) or by an amount in dollars a week at list prices (at least one cent), from the Usage view, or the settings for a new software. Setting one replaces the other; "no budget" removes it.
- premise tells usage-ledger at once, and again for every software each time it starts.
- With real figures, the budget is a project budget in usage-ledger for the current week, and usage-ledger says whether it is ok, incomplete or used up ([contract](usage-ledger.md) section 4, [0330](../decisions/0330-real-sessions-read-the-real-usage-ledger.md)). **Incomplete** (some of the week's use could not be counted, such as a share of the week not known yet) never pauses work: the Usage view says "Budget incomplete" and what could not be counted. When usage-ledger cannot be read, the budget is not checked: it never pauses or resumes work, and the Usage view says "Budget not checked" and why. Beside it, what was used this week, from usage-ledger.

### 5.3 An overrun

1. After any change to a job (a session starting or ending), premise asks usage-ledger for the software's budget status. While it asks, the work queue starts nothing for that software, so one more job cannot slip through.
2. When usage-ledger says a checked budget is overrun and the software is active, its state becomes `paused-budget`, a row is added to `budget_overruns` with what was spent on what (by step and by change), and an event is recorded so open pages update.
3. No new agent job starts for it. A session already running finishes. Its questions stay answerable. Other softwares are not touched and keep running in priority order.
4. The operator is told plainly, in the software's status line, on its page, on the Usage view and in its report: what it used, what the budget was, what it went on, that the figures were made up when they were (demo figures, or the mock used before 0330), and the three answers.
5. The answers:
   - **Raise the budget.** A new budget, as a share or an amount. It must be above what was used, as usage-ledger judges it; otherwise the old budget stays, the software stays paused, and the error says how much was used. When accepted, the software is active again and its queue starts.
   - **Let it finish the current change.** The piece of work being worked on (the running job's, else the oldest waiting or queued one) and its parts are allowed to finish: only jobs of that piece start. When none are left, the software stays paused. With nothing being worked on, the error says so.
   - **Leave it paused.** Nothing changes except that the answer is kept; the notice stays until the budget is raised, even when the week resets.
6. The software becomes `paused-budget` only from `active`; one waiting at a milestone is looked at again when it goes on.

### 5.4 Restarts

The paused state, the budget and the operator's answer are in the database, so a restart keeps a paused software paused. At start premise tells usage-ledger every budget and looks for any overrun before the queue starts work. An overrun not yet answered is still asked.

When the week resets and a software paused for its budget is within it again, it resumes by itself and says so in its conversation ("The week reset; <name> is within its budget again and has resumed"), unless the operator chose to leave it paused. Chosen for the owner, open to correction. Paused softwares are looked at again at start and every five minutes.

A software paused on made-up figures, once premise reads real ones and usage-ledger says it is within its budget (or it has none), resumes and says so in its conversation ("... was paused because made-up figures said its budget was used up. usage-ledger's real figures say it is within its budget ..."), unless the operator chose to leave it paused.

## 6. Configuration

| Key | Default | Meaning |
|---|---|---|
| `usage_ledger.mode` | `auto` | Where usage figures come from: usage-ledger for real agents, demo figures for scripted ones. |
| `usage_ledger.command` | `usage-ledger` | The usage-ledger program, or a path to its `cli.js`. |
| `usage_ledger.database` | none | usage-ledger's database file; none means its own default. |
| `usage_ledger.timeout_seconds` | 60 | How long one usage-ledger command may take. |
| `usage_ledger.read_after_seconds` | 15 | How long after a session ends premise asks what it used. |
| `usage_ledger.recheck_minutes` | 10 | How often premise asks again about shares not known yet, and retries after a failure. |
| `usage_ledger.catch_up_days` | 30 | How far back premise reads past sessions usage-ledger has not seen, at start. |
| `usage_ledger.seed` | none | Seed for `demo-random`. |
| `usage_ledger.demo_weekly_allowance_usd` | 100 | The demo's worth of a whole week's usage. |
| `usage_ledger.demo_cost_scale` | 1 | The demo's multiplier on every session's cost. |
| `softwares.default_weekly_share_percent` | none | Budget of a new software as a share of a week's usage. |
| `softwares.default_weekly_budget_usd` | none | Budget of a new software as dollars a week; used if both are set. |

Which model and effort each type of task uses, and how many sessions run at once, are `agents.tasks.<kind>.*` and `queue.max_agent_sessions` ([configuration](../reference/configuration.md)).

## 7. Limits

- Figures are only as good as usage-ledger's; demo figures are made up and say so. A session that used a second, cheaper model on the side may be priced a little low by usage-ledger, whose log of the main session leaves it out; premise's own count, from the result, includes it.
- A share of the week is rough (the account's figure moves in steps of 1%, and is shared with other work at the same time) and is not known below a software or for sessions from before 0330.
- Budgets are weekly. A budget in dollars is at list prices, which is not what a subscription charges.
- premise does not stop a running session for an overrun; the turn and time limits ([0088](../decisions/0088-turn-and-time-limits.md)) do that.

## 8. Failure modes and recovery

| Failure | Effect | Recovery |
|---|---|---|
| usage-ledger cannot be read | Nothing is paused; the Usage view says the cost figures could not be read and what to do; the setup check notes it | Install usage-ledger, or set `usage_ledger.command`; premise tries again every few minutes. Work carries on under the turn and time limits |
| premise stops while paused | The software stays paused | Start premise; the notice is still there |
| A raised budget is still below use | Refused, old budget kept | Raise it higher, or choose another answer |
