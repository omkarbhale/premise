# usage-ledger contract

Status: specification, built against the real usage-ledger ([0330](../decisions/0330-real-sessions-read-the-real-usage-ledger.md)); made-up demo figures for scripted agents ([0133](../decisions/0133-usage-ledger-is-mocked-until-it-exists.md), [0200](../decisions/0200-how-cost-and-the-spending-limit-are-built.md)). Related: [usage and budgets](usage.md), [models and cost](../architecture/models-and-cost.md), [agent runner](agent-runner.md), [work queue](work-queue.md).

## 1. Purpose

premise builds no cost tracking of its own ([0064](../decisions/0064-cost-and-spending-limit-from-usage-ledger.md)); it uses usage-ledger, a separate command that reads Claude Code's own logs for each session's tokens and cost and keeps labels and readings of the week. This document is how premise uses it. The code is `src/usage-ledger/`:

- `usage-ledger.ts`: the interface the rest of premise uses (the seam), and the figure types;
- `real-usage-ledger.ts`: the real one, run as a command; `ledger-command.ts` runs it;
- `demo-usage-ledger.ts`: made-up demo figures for scripted agents, which use nothing;
- `fold.ts`: adding sessions' figures up into a software's total and its groups;
- `create.ts`: which one premise uses;
- and, outside it, `src/usage/session-tasks.ts` (premise's session records) and `src/storage/ledger-sessions.ts` (what usage-ledger said, kept).

Which one: `usage_ledger.mode`. `auto` (the default) uses the command for real agents and demo figures for scripted ones; `real` always uses the command; `demo-fixed` and `demo-random` choose the demo figures for scripted agents (real agents still use the command). The old values `mock-fixed` and `mock-random` mean the two demo modes.

## 2. What premise keeps of each session

For every agent session, real or scripted, premise keeps one session record, read from what the work queue already stores. A session carried on after a pause has one record per leg, all with the same session id.

| Field | Meaning |
|---|---|
| `sessionId` | The agent runtime's own id for the session; premise's own `local-<n>` until the runtime confirms it. |
| `runtime` | `claude` for a real session, `scripted` for a scripted agent. Scripted sessions are never given to usage-ledger. |
| `softwareId` | The software the session worked for. |
| `workItem` | The piece of work (a change: the software from the idea, a milestone, a part) the software was on; null when the task belonged to none ([0270](../decisions/0270-premises-own-figures-and-asks-that-cost-attention-honestly.md)). |
| `stage` | The line stage the task served, such as `build`; null for tasks on no stage. |
| `taskKind` | The type of task: draft, research, review, plan, build, check, triage, reading, and so on. |
| `items` | The record items the task served, such as `W-1`, `M-2`. |
| `model`, `effort` | What the session was asked to use. |
| `started`, `ended` | ISO times; `ended` is null while the session runs. |
| `jobId` | The work queue's job, for cross-reference. |

## 3. What premise asks the usage-ledger command

premise runs the command (`usage_ledger.command`) directly, never through a shell, with `--json` added, a time limit (`usage_ledger.timeout_seconds`), `USAGE_LEDGER_DB` set to `usage_ledger.database` when set, and `USAGE_LEDGER_LOGS` set to `agents.claude_config_folder` when set (otherwise usage-ledger reads Claude Code's default folders, where premise's sessions are). A command given as a path to a `.js` file runs with premise's own Node.js. Commands run one at a time, in rounds, in the background; a round starts soon after a session starts or ends, at start, and every `usage_ledger.recheck_minutes`.

Each round, in order:

| Command | When | What premise does with the answer |
|---|---|---|
| `reading --percent <p> --resets-at <time> --at <time>` | For each reading of the week not given yet, oldest first: every rate-limit reading a real session's stream reported, at the time premise read it, and one when the session ended saying the figure is still the highest read this week. | Marks the reading given. A reading with no reset time, or one usage-ledger refuses, is set aside, not given again. |
| `budget remove --project=<software>`, then `budget set --project=<software> --dollars <n>` or `--percent <p>` | For each software whose budget changed since the last round, and for every software at start. | A budget usage-ledger refuses ends the round, and the page says so. |
| `label <id> --task "<software>\|<stage>\|<work item>\|<items>" --project=<software>` | Once for each real session with an id (a session carried on is labelled once), within the catch-up window. The task is cut to 200 characters; `-` stands for none. | Keeps the label, so it is not given again. |
| `sessions --since <time>` | Once a round, when any session is due: ended and `usage_ledger.read_after_seconds` passed; again when its share of the week was not known and a reading came after it (up to a week and a day after it ended); again for a day when it was not in the logs. `--since` is the earliest due session's start, less an hour. | Keeps each due session's tokens (input, output, cache), cost (null when usage-ledger has no price), models and share of the week (null when not known, with why). A due session not in the listing is kept as "not in Claude Code's logs". |
| `report --week --by project` | When anything changed (a reading, a budget, a session started, ended or read), or every `usage_ledger.recheck_minutes`. | This week's sessions, cost, tokens and share per software, as last read. |
| `budgets` | The same, when any software has a budget. Exit 1 (one used up) and 3 (one incomplete) come with the answer; only an error does not. | Each software's budget standing: ok, incomplete (with what could not be counted) or used up. |

At start the catch-up takes past real sessions from the last `usage_ledger.catch_up_days` days that usage-ledger has not seen (null: all; 0: none), newest first.

A command that cannot be run (not found, not allowed, too slow, or broke without an answer), or that an older usage-ledger does not know, ends the round; premise says why and what to do (install or update usage-ledger, or set `usage_ledger.command`), forgets the budgets' standing until a round succeeds, and tries again at the next round. Nothing is paused for want of an answer.

## 4. What the seam answers

All answers are asynchronous. A figure that is not known is null, never zero; `why` and `weeklyWhy` say why in plain words. Every answer carries `source`: `ledger` or `demo`.

| Operation | Gives |
|---|---|
| `softwareUsage(software)` | Sessions; how many have a cost (`priced`); cost at list prices in dollars, input, output and cache tokens (sums over the sessions that have them); why the others have none; and the software's share of this week. |
| `usageBreakdown(software)` | The same in total, and grouped by phase, stage, change (work item id) and record item. Key `none` holds sessions that named none. A session on several record items shares its figures equally among them, so every grouping adds up to the total. |
| `weeklyUsage()` | The demo's made-up week; null for the real one, whose week is premise's own latest reading. |
| `setBudget(software, budget)` | Keeps a budget: a share of weekly usage (`percent`, 1 to 100) or an amount (`usd` a week at list prices); null removes it. premise sets every budget again each time it starts. |
| `budgetStatus(software, {fresh})` | The budget; what the software used this week (dollars and share, null when not known); `checked`, whether usage-ledger judged it, with `why` when not; `incomplete`, checked but some use could not be counted, with `why`; and `overrun`, true once usage-ledger says it is used up, never when not checked or only incomplete. usage-ledger decides this; premise never works it out from figures. `fresh` asks usage-ledger again first (before pausing or resuming); without it, what was last read (for the page). |
| `nudge()`, `start()`, `close()`, `idle()` | Ask for a round soon; start and stop the background rounds; wait for one in flight. |
| `problem()` | Why figures cannot be read right now, with what to do; null when they can. |

### How the real figures are worked out

- **Cost and tokens:** usage-ledger's figures for each session, added up. A session carried on is counted once, under its first leg; later legs count as sessions with nothing more to add.
- **Why a session has none:** scripted agent, uses nothing; no session id; still running; not read from usage-ledger yet; usage-ledger could not be read; not in Claude Code's logs; no price.
- **Share of this week, per software:** from usage-ledger's week report: the week is usage-ledger's (the seven days before the latest reading's reset, or the last seven days before any reading, which the page then says). It is an estimate (readings move in steps of 1%, and a rise is shared with other work at the same time) and the page says so; when some sessions are not known yet it is "at least" that; when none is, it is not known, with why.
- **Share per phase, step, change or item:** not known, with why; it would be noise.
- **Used this week, for a budget:** the software's cost this week, from the same report.

### Budgets

Each software's budget is a project budget in usage-ledger for the current week, in dollars or percent, used up at its limit. Before pausing or resuming a software, premise asks again; the page shows what was last read.

| usage-ledger says | premise |
|---|---|
| `used-up` | Pauses the software, as in [usage](usage.md) 5.3. |
| `ok` | Carries on; resumes a software paused for its budget (unless left paused on purpose). |
| `incomplete` | Carries on, and resumes as for ok; the page says "Budget incomplete" and what could not be counted. Never treated as used up. |
| no answer (could not be read, or not given yet) | Carries on; never pauses, and never resumes a paused software; the page says "Budget not checked" and why. |

## 5. Behaviour premise relies on

- A week is the subscription's own window, as the stream reports it.
- Labelling needs no logs; a session can be labelled while it runs.
- Every command that reads usage scans every log folder and takes a few seconds; premise asks in rounds, many sessions in one listing, never per page.
- Asking about a software with no sessions gives "nothing yet", not an error.
- usage-ledger never sits between an agent and its model, and never changes what an agent does.

## 6. Demo figures

- `demo-fixed`: a session's figures depend only on its model tier, its effort and its type of task; every run gives the same figures.
- `demo-random`: figures also vary by session, drawn from `usage_ledger.seed`; the same seed gives the same figures. With no seed, a new one each start.
- They work from premise's own session records, so they change as the work goes, are the same over a restart, and add up across the groupings. Their week is made up too (42% in `demo-fixed`).
- `usage_ledger.demo_weekly_allowance_usd` (what a whole week's usage is worth) and `usage_ledger.demo_cost_scale` (a multiplier on every session) change them; a large scale reaches a budget overrun quickly. Demo budgets are checked, so the kept budget demo shows an overrun.
- For tests and the kept demo, `scriptOverrun(software, afterSessions)` reports an overrun once the software has that many recorded sessions, whatever the figures; `clearScriptedOverrun` removes it.
- Every answer carries `source: "demo"`, and the page labels them "Demo figures".

## 7. Failure modes

| Failure | What premise does |
|---|---|
| The command is not found or not allowed | Agent work carries on under the turn and time limits ([0088](../decisions/0088-turn-and-time-limits.md)); budgets are not checked, so nothing is paused or resumed for them. The Usage page says the figures could not be read, and to install usage-ledger or set `usage_ledger.command`. The setup check notes it. premise tries again every few minutes. |
| The command breaks or is too slow | The same; the figures already read stay shown. |
| usage-ledger is older than premise needs (a command it does not know) | The same, saying to update usage-ledger. |
| Claude Code's log folder is not found | The same, naming `agents.claude_config_folder`. |
| A session is not in the logs | That session's cost is "not known: not in Claude Code's logs"; it is looked for again for a day. |
| A software was paused on made-up figures | Once usage-ledger says it is within its budget (or it has none), it resumes, and says so in its conversation, unless the operator chose to leave it paused. |
