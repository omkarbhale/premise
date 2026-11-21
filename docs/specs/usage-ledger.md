# usage-ledger contract

Status: specification, built against a mock ([0133](../decisions/0133-usage-ledger-is-mocked-until-it-exists.md), [0200](../decisions/0200-how-cost-and-the-spending-limit-are-built.md)). Related: [usage and budgets](usage.md), [models and cost](../architecture/models-and-cost.md), [agent runner](agent-runner.md), [work queue](work-queue.md).

## 1. Purpose

premise builds no cost tracking of its own ([0064](../decisions/0064-cost-and-spending-limit-from-usage-ledger.md)); it only uses usage-ledger. This document is the contract usage-ledger has to meet. The code is `src/usage-ledger/usage-ledger.ts` (the interface), `mock-usage-ledger.ts` (the mock that stands in until usage-ledger exists) and `src/usage/session-tasks.ts` (premise's records). The real connection is the setting `usage_ledger.mode` set to `real`; premise refuses to start with it until it is built, saying so in plain words.

## 2. What premise gives usage-ledger

For every agent session, real or scripted, premise keeps one session record. usage-ledger reads them through a source premise hands it once at start (`attach`); it never needs to call premise per session. The record is the whole of what premise says; usage-ledger works the rest out from what the agent runtime recorded for the session id.

| Field | Meaning |
|---|---|
| `sessionId` | The agent runtime's own id for the session; premise's own `local-<n>` until the runtime confirms it. A resumed session keeps its id, so one id can appear on more than one record. |
| `softwareId` | The software the session worked for. |
| `workItem` | The piece of work (a change: the software from the idea, a milestone, a part) the software was on; null when the task belonged to none. |
| `stage` | The line stage the task served, such as `build`; null for tasks on no stage. |
| `taskKind` | The type of task: draft, research, review, plan, build, check, triage, reading, and so on. |
| `items` | The record items the task served, such as `W-1`, `M-2`. |
| `model`, `effort` | What the session was asked to use. |
| `started`, `ended` | ISO times; `ended` is null while the session runs. |
| `jobId` | The work queue's job, for cross-reference. |

premise also tells usage-ledger where its Claude Code sessions are recorded (the configuration folder in use, [0140](../decisions/0140-the-owners-existing-claude-code-login.md)); the mock does not need it.

## 3. What usage-ledger must answer

All answers are asynchronous and each figure carries `mocked`: `true` for the mock, `false` for the real thing. A caller never has to know which it has.

| Operation | Gives |
|---|---|
| `weeklyUsage()` | The share of the subscription's seven-day window used (0 to 1), when the window began and when it resets. |
| `softwareUsage(software)` | Sessions, input and output tokens, cost at list prices in dollars, and that cost as a share of a week's usage. |
| `usageBreakdown(software)` | The same figures for the software in total, and grouped by stage, by change (work item id), and by record item. Group key `none` holds sessions that named none. A session that served several record items shares its figures equally among them, so every grouping adds up to the total. |
| `setBudget(software, budget)` | Remembers a budget: a share of weekly usage (`percent`, 1 to 100) or an amount (`usd` a week at list prices); null removes it. premise sets every budget again each time it starts, so usage-ledger need not persist them (it may). |
| `budgetStatus(software)` | The budget, what the software used so far this week (dollars and share), and `overrun`: true once what was used reaches the budget. usage-ledger decides this; premise never works out an overrun from figures. |

## 4. Behaviour premise relies on

- A week is the subscription's own window, as `weeklyUsage` reports it. A budget is measured over the current window; the breakdown covers every recorded session.
- Figures for a session that has started but not ended may be partial. An overrun can be reported while a session is still running; premise then lets that session finish.
- Asking about a software with no sessions gives zeros, not an error.
- usage-ledger never sits between an agent and its model, and never changes what an agent does.

## 5. The mock

- `mock-fixed`: a session's figures depend only on its model tier, its effort and its type of task; every run gives the same figures.
- `mock-random`: figures also vary by session, drawn from `usage_ledger.seed`; the same seed gives the same figures. With no seed, a new one each start.
- The mock works from premise's own session records, so its figures change as the work goes, are the same over a restart, and add up across the groupings.
- `usage_ledger.mock_weekly_allowance_usd` (what a whole week's usage is worth) and `usage_ledger.mock_cost_scale` (a multiplier on every session) change the mock's figures; a large scale reaches a budget overrun quickly.
- For tests and the kept demo, `scriptOverrun(software, afterSessions)` makes the mock report an overrun once the software has that many recorded sessions, whatever the figures and whether or not a budget is set; `clearScriptedOverrun` removes it.
- Every result carries `mocked: true`.

## 6. Failure modes

| Failure | What premise does |
|---|---|
| usage-ledger cannot be read | Agent work carries on under the turn and time limits ([0088](../decisions/0088-turn-and-time-limits.md)); the page and the report say that the cost figures could not be read. Nothing is paused for want of an answer. |
| usage-ledger reports an overrun for a software | See [usage and budgets](usage.md). |
| `usage_ledger.mode` is `real` before it exists | premise does not start, and says why. |
