# 0330. Real sessions read the real usage-ledger

- Status: Accepted; points 5, 6, 8 and 9, and the handling of an incomplete budget in point 7, chosen for the owner, open to the owner's correction
- Partly supersedes: [0133](0133-usage-ledger-is-mocked-until-it-exists.md), where it says usage-ledger's output is mocked until it exists (it exists now); and [0270](0270-premises-own-figures-and-asks-that-cost-attention-honestly.md), where it shows premise's own count beside *mocked* usage-ledger figures and rejects replacing them because the owner wanted them mocked
- Scope: Making premise
- Date: 2026-11-24
- Decided by: The owner, that premise now uses the real usage-ledger: "Yes build entirety of tracking that we wanted to using usage-ledger brought in", and later "Go ham on this one"; then the owner had usage-ledger given the commands premise needed (this week's totals, a listing of many sessions, readings by hand, a budget per project for the week) and asked for them to be plugged in. How it is built is the builders' choice; the points marked chosen for the owner are the assistant's, open to correction ([0136](0136-open-questions-chosen-for-the-owner.md)).
- Source: A read-only study of usage-ledger as built and of premise's cost figures, which checked usage-ledger's figures against premise's own count of 88 real sessions (84 of 87 comparable sessions matched to the token and the cent). [0064](0064-cost-and-spending-limit-from-usage-ledger.md), [0133](0133-usage-ledger-is-mocked-until-it-exists.md), [0200](0200-how-cost-and-the-spending-limit-are-built.md), [0270](0270-premises-own-figures-and-asks-that-cost-attention-honestly.md).
- Numbered apart from the records being written at the same time by other tasks.

## Context

- usage-ledger exists. It is a command, not a library premise attaches to: it reads Claude Code's own logs for each session's tokens and cost (estimated at list prices), keeps a label per session (a task and a project), keeps readings of the account's weekly usage (`reading`, by hand, or from Claude Code's status line), lists many sessions in one answer (`sessions`), totals a week by project (`report --week`), and keeps budgets, including one per project for the current week in dollars or percent, used up at its limit (`budget set --project`, `budgets`). It answers in JSON.
- The weekly share of one session comes from the readings before and after it. The account's figure moves in steps of 1%, and a reading's rise is split among every session that ran in between, so a share for one step, change or item is mostly 0 and means little. A share for a whole software over a week is rough but real.
- usage-ledger's `budgets` says each budget is ok, used up, or incomplete (some use could not be counted, so what was counted is a lower bound); it never counts an incomplete one as used up.
- The mock paused real work on made-up figures: a mocked overrun put a software in `paused-budget`.
- A session carried on after a pause (the usage limit, a stop) ended its first leg without a result, so premise's own count lost that leg's tokens.

## Decision

1. **Real sessions read the real usage-ledger** for sessions premise starts from now on, and past ones it can (point 6). The setting `usage_ledger.mode` is `auto` by default: the usage-ledger command when agents are real, made-up demo figures when they are scripted. `real` always uses the command. The old mock is kept only for scripted agents and the kept demos, renamed **demo figures** and labelled so wherever it shows; with real agents premise never makes figures up. The old setting values (`mock-fixed`, `mock-random`) and names (`usage_ledger.mock_*`) still work.
2. **How premise talks to it.** premise runs the command (`usage_ledger.command`, default `usage-ledger` on the PATH, or a path to its `cli.js`) directly, never through a shell, always with `--json`, with a time limit (`usage_ledger.timeout_seconds`), its database (`usage_ledger.database`) and Claude Code's log folder (`agents.claude_config_folder`) passed in its environment. Commands run one at a time in the background, in rounds; a page never waits on one. Each round: give new readings (`reading`), give budgets changed since the last round, label new sessions, read every session that ended since the last read in one listing (`sessions --since`), and, when anything changed, read this week's totals per software (`report --week --by project`) and the budgets (`budgets`). premise keeps what usage-ledger said of each session (`ledger_sessions`), so a restart does not ask again. An older usage-ledger that lacks a command premise needs is named as such, with "update usage-ledger".
3. **Each session is labelled** as soon as it has an id: task `<software>|<stage>|<work item>|<record items>` (at most 200 characters), project `<software>`. A session carried on keeps one label and is counted once.
4. **The week's readings are given to usage-ledger** with the time each was read, as hand readings (`reading --percent --resets-at --at`): every rate-limit reading of the stream, kept with its time (`usage_readings`), and one more when a session ends saying the figure is still what was last read (the stream reports again at each step of 1%), so usage-ledger can close the session's window. premise's own latest reading stays the figure the page shows for the week.
5. **A figure can be "not known"** (chosen for the owner). Cost, tokens and shares are null when not known, never zero, with why in plain words: scripted agent, still running, not read yet, not in Claude Code's logs, no price, usage-ledger could not be read. A share of the week, and what was used this week, are shown only for a whole software over the current week, from usage-ledger's week report, "estimated" and "at least" when some sessions are not known yet; for a step, change or item it is not known, and the page says why once rather than in every row.
6. **Past sessions are caught up** (chosen for the owner): at start, real sessions from the last `usage_ledger.catch_up_days` (30) days that usage-ledger has not seen are labelled and read, newest first, if Claude Code still has their logs. Their shares of the week stay not known: their readings were never kept with a time.
7. **Budgets are usage-ledger's.** premise sets each software's budget in usage-ledger as a project budget for the current week (`budget set --project <software> --dollars <n>` or `--percent <p>`, removing the old one first), and again for every software at start. Before deciding to pause or resume, premise asks again (`budgets`) and acts on usage-ledger's answer: **used up** pauses the software as before; **ok** goes on (and resumes one that was paused); **incomplete** never pauses (chosen for the owner, as usage-ledger's own rule says): the page says "Budget incomplete" and what could not be counted, and work carries on. A budget that could not be checked (usage-ledger could not be read) never pauses work, and never resumes a paused software either; the page says so. A software that was paused on mocked figures resumes once usage-ledger says it is within its budget, and says so in its conversation, unless the operator had chosen to leave it paused. Who decides an overrun is unchanged: usage-ledger ([0064](0064-cost-and-spending-limit-from-usage-ledger.md), [0200](0200-how-cost-and-the-spending-limit-are-built.md)).
8. **When usage-ledger cannot be run** (chosen for the owner), work carries on as before; the Usage page says the figures could not be read and what to do (install it, or set `usage_ledger.command`), and premise tries again every `usage_ledger.recheck_minutes`. The setup check (`npm run doctor`, the Settings page) notes a missing usage-ledger without stopping premise from starting.
9. **A leg cut off without a result keeps its tokens** (chosen for the owner): premise adds up the tokens each model message reported as the session streamed, and keeps them as that leg's own count, cost not known. With usage-ledger, the whole session is read by its id.
10. **The Mocked labels, notices and unused API fields are removed**: the overview's weekly figure and per-software usage, and a software's detail usage, which no page showed. Old overrun records keep saying their figure was made up.

## Reason

- The owner built usage-ledger for this. Its figures match premise's own count where both exist, and are more complete where premise's are missing (a session killed, crashed or paused without a result).
- Running the command, rather than reading usage-ledger's database, keeps usage-ledger the owner of its data and its rules; labelling at start replaces the contract's `attach`, which usage-ledger does not offer.
- One command at a time, with answers kept, and many sessions in one listing, because each command scans every log (a few seconds), and the page must stay fast.
- A share per step from 1% steps split among overlapping sessions is noise; showing it as a number would mislead. Saying "not known" is honest.
- usage-ledger decides when a budget is used up, as 0064 and 0200 say; premise only asks. An incomplete answer is not a used-up one, and a budget premise cannot check must not stop work.

## Alternatives considered

- **Ask usage-ledger per page load**: rejected; each command takes a second or more.
- **Ask usage-ledger about each session on its own** (`session <id>`): rejected once `sessions` existed; one listing reads them all in the time of one.
- **premise decides an overrun from the real cost it has**: rejected; it reverses 0064 and 0200.
- **Treat an incomplete budget as used up, to be safe**: rejected; usage-ledger says never to, and it would pause work on what is not known.
- **A share of the week per row from cost** (this row's cost over the week's cost times the week's percent): rejected; it assumes the limit follows list price, which usage-ledger itself marks as assumed, not checked.
- **Keep the mock for real agents behind a setting**: rejected; the owner's words supersede it for real sessions.

## Consequences

- A newcomer sees real dollars and tokens for real work, a clear "not known" where there is none, and one place to fix it when usage-ledger is missing.
- Budgets work with real figures: a software pauses when usage-ledger says its budget for the week is used up, and the operator answers as before. A budget of a share of the week often stays incomplete, since shares are not known until a reading follows each session; the page says so.
- premise needs a usage-ledger with these commands; an older one is named on the page with "update usage-ledger".
- Sessions that spawn a side model (such as a smaller model for a quick task) may be priced a little low by usage-ledger, whose logs for the main session do not include it; premise's own count, from the result, does.
- **Related:** [usage-ledger contract](../specs/usage-ledger.md), [usage](../specs/usage.md), [configuration](../reference/configuration.md).
