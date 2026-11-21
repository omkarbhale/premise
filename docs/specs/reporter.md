# Reporter specification

Status: specification. Built so far: the report view with its short default and more detail, reports written and kept with their triggers, milestone reports, release-note drafts, a mocked cost section ([0164](../decisions/0164-how-the-reporter-is-built.md)). Not built yet: the reporter agent's wording, `facts_read` and `report_submit`, notices, more detail on one item, release notes committed. Being built ([0130](../decisions/0130-the-build-starts-and-covers-all-of-premise.md)). Related: [intake and reporting](../architecture/intake-and-reporting.md), [page](page.md), [agent tools](agent-tools.md), [storage](storage.md), [models and cost](../architecture/models-and-cost.md).

## 1. Purpose

The reporter writes reports from recorded facts. Reporting is part of the line, with a product default: what was decided, what is running, and what is needed and from whom; more detail when asked ([0012](../decisions/0012-reporting-with-a-product-default.md)). It reports honestly, including what failed and what it could not check ([VISION.md](../../VISION.md)).

## 2. Responsibilities and non-responsibilities

Responsible for:

- the report view, always current, for each software;
- a short report each time a change reaches running ([0098](../decisions/0098-report-when-a-change-reaches-running.md));
- notices when someone is needed ([0099](../decisions/0099-notices-in-the-session.md));
- answering requests for more detail;
- drafting release notes from the record items a change served.

Not responsible for:

- the facts themselves: they come from the check, the work queue, the gate, the runner and usage-ledger;
- reports to the owner about building premise itself, which the builders write per milestone (5.6).

## 3. Interfaces

| Operation | Caller | Inputs | Outputs | Errors |
|---|---|---|---|---|
| Report | Line engine (change reached running; line ended at "do not build"; work stopped on an item) | Software, trigger | A `report` job; the report in `reports`; a notice if someone is needed | none |
| More detail | Page (a "more" control on any record item or report line), intake (a triaged question) | Software, item or line | An answer in the session, each line with its evidence link | `UNKNOWN_ITEM` |
| Release notes | Runner (after merge) | Software, commit, items served | Drafted notes, handed to the runner | none |
| Report view | Page | Software | The current view (5.2) | none |

The reporter agent works only through `facts_read` and `report_submit` ([agent tools](agent-tools.md)).

## 4. Data owned

`reports` ([storage](storage.md)).

## 5. Behaviour

### 5.1 Facts only

- Reports are built from recorded facts only: check verdicts, job outcomes, gate decisions, usage-ledger figures. Every line links to its evidence. No agent's account of its own work is a source ([0097](../decisions/0097-reports-from-recorded-facts.md)).
- A false report is on the floor ([0056](../decisions/0056-what-is-on-the-floor.md)); self-reports were the source of the prior art's false reports.
- `report_submit` refuses a line with no evidence link, or with a link to no recorded fact.
- The reporter agent, at the fast tier ([0104](../decisions/0104-model-tier-by-role.md)), only words and orders the facts. Counts and statuses come from the database, not from the agent.

### 5.2 The report view

Always current, for each software ([0012](../decisions/0012-reporting-with-a-product-default.md)):

| Section | Holds |
|---|---|
| Decided | Record items and decisions since the last report |
| Running | What runs, which commit, and where to open it |
| Needed | What is needed and from which role, each with exactly what to do |
| Failed or not checked | Every item not met or not checked |
| Cost | From usage-ledger, once it is usable (milestone 2). Until then: "Cost is not tracked yet." |

It is in lists ([0029](../decisions/0029-lists-over-long-paragraphs.md)), and states the known limit that the checker shares the builder's model ([0091](../decisions/0091-checker-same-provider-strongest-tier.md)).

### 5.3 When reports are written

- A short report each time a change reaches running; an immediate notice only when someone is needed ([0098](../decisions/0098-report-when-a-change-reaches-running.md)). It is the rhythm the owner chose for premise's own building ([0054](../decisions/0054-reports-to-the-owner.md)). A report per task (noise) and reports only when asked were rejected.
- Also when the line ends at "do not build", when work on an item stops after three failed rounds (naming which role is needed and for what), and when a software is paused for its budget or the usage limit.

### 5.4 Notices

- The "needed" list in the session, grouped by role; a count in the browser tab; and browser notifications while the page is open ([0099](../decisions/0099-notices-in-the-session.md)).
- They need no outside account and send nothing in anyone's name. Email or chat messages were rejected for now.

### 5.5 More detail when asked

- More detail, in chat ("more on W-7") or from the page's "more" control, is answered from the record, the evidence and the working records ([0118](../decisions/0118-how-chat-messages-are-routed.md)).
- The same facts-only rule holds: each line links to what it rests on. A transcript may be linked as evidence of what was said; it is never taken as evidence that work was done.

### 5.6 Reports while premise is being built

The owner gets one short report per finished milestone, and an immediate message only when something needs the owner ([0054](../decisions/0054-reports-to-the-owner.md)). The builders write it, on the same facts-only rule, with: what was built; how it was shown running, with the evidence; what failed and what could not be checked; the decision records made or changed; from milestone 2 on, the cost. The [roadmap](../product/roadmap.md) adds each milestone's own items.

### 5.7 Cost

- Once usage-ledger is usable, the report reads usage per software, stage, change and record item from usage-ledger ([0064](../decisions/0064-cost-and-spending-limit-from-usage-ledger.md)).
- Because sessions carry their record items, rework shows up: an item that keeps failing its check shows its whole cost.
- Until usage-ledger is usable, reports say that cost is not tracked yet.

### 5.8 Release notes

Release notes for each change that reaches running are drafted from the record items it served ([0123](../decisions/0123-reporter-drafts-release-notes.md)). Only items whose check verdict was met are in them; items not met or not checked stay in "Failed or not checked". They describe what users can now do, in users' terms, and are handed to the runner, which commits them ([runner](runner.md)).

## 6. Configuration

| Key | Default | Meaning |
|---|---|---|
| `reports.max_lines` | 15 | Lines in a short report before the rest is behind "more" |
| `notices.browser` | on | Browser notifications while the page is open |

The report's default form stays with premise ([0012](../decisions/0012-reporting-with-a-product-default.md)); a level of detail the operator sets first was considered and not chosen.

## 7. Limits

- Reports only cover what was recorded. Anything not recorded is not reported as done.
- Notices reach people only while the page is open; the "needed" list waits for them otherwise.

## 8. Failure modes and recovery

| Failure | Detection | Effect | Recovery |
|---|---|---|---|
| The reporter agent fails | Job failure | No report wording | The report view still shows the facts unworded; the job is retried |
| A line without evidence | `report_submit` refuses it | Not in the report | The agent fixes it or drops it |
| usage-ledger unreachable | Call fails | No cost figures | The Cost section says the figures could not be read |

## 9. Security considerations

- Reports are shown only in the session; nothing is sent outside premise ([0099](../decisions/0099-notices-in-the-session.md)).
- Reports name roles; people's words from intake appear only in the session, never in the repository ([0081](../decisions/0081-nothing-about-people-in-the-repository.md)).

## 10. Observability

- Every report is stored with its lines and links.
- Milestone reports count what each milestone asks: questions per role (milestone 3), counts per route (milestone 4), points where setup needed a person (milestone 5), how much of the original record was recovered (milestone 6).

## 11. Milestones

- Milestone 1 step 2: a report each time a change reaches running; the report view; notices; more detail from the page's "more" control.
- Milestone 2 (against usage-ledger's mock until it exists, [0133](../decisions/0133-usage-ledger-is-mocked-until-it-exists.md)): the Cost section, usage per stage and per item.
- Milestone 4: more detail asked in chat, through triage.
- Milestone 7: a report per software and one summary across softwares.
