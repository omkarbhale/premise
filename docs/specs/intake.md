# Intake specification

Status: specification, being built ([0130](../decisions/0130-the-build-starts-and-covers-all-of-premise.md)). Related: [intake and reporting](../architecture/intake-and-reporting.md), [line engine](line-engine.md), [gate](gate.md), [reporter](reporter.md), [agent tools](agent-tools.md).

## 1. Purpose

Intake takes items in from every source and routes them. Ideas and problems come back in from the operator, other people, the software's users and the product itself, and are picked up automatically where work shows up. Each is judged against the record ([VISION.md](../../VISION.md)).

Most intake goes into the line as first intended. Only the items that need holding are held and read together later ([0062](../decisions/0062-intake-goes-in-normally.md)).

## 2. Responsibilities and non-responsibilities

Responsible for:

- taking items in from each source and numbering them `I-n` per software;
- having the triager read every item against the record ([0094](../decisions/0094-triager-reads-every-item.md));
- routing: in normally, asked at once, held, merged or closed;
- holding only what needs holding ([0095](../decisions/0095-what-is-held.md)), and starting readings ([0096](../decisions/0096-when-held-items-are-read.md));
- telling senders where their item stands;
- the way back to Why when people do not want the software ([0036](../decisions/0036-finding-out-if-people-want-it-is-out.md)).

Not responsible for:

- doing the work an item leads to ([line engine](line-engine.md));
- finding out on its own whether real people want the software; their opinions arrive through intake, and the operator sees for themselves whether anybody uses it ([0036](../decisions/0036-finding-out-if-people-want-it-is-out.md)).

## 3. Interfaces

| Operation | Caller | Inputs | Outputs | Errors |
|---|---|---|---|---|
| Take in | Line engine (chat), feedback page, issue reader, runner, work queue, usage-ledger watcher | Software, source, sender reference, text | `I-n`; a `triage` job | none |
| Apply triage | Agent tools (`triage_submit`) | Item, triage result | Route taken | `UNKNOWN_ITEM` |
| Start reading | Timer, held count, operator | Software | A `reading` job | none |
| Apply reading | Agent tools (`reading_submit`) | Reading | An ask to the operator | none |
| Tell sender | Intake (on each status change) | Item, status | A line in the session; for a GitHub issue, a gate request to comment | none |

## 4. Data owned

`intake_items`, `readings`, `feedback_links` ([storage](storage.md)).

## 5. Behaviour

### 5.1 Sources

| Source | How it arrives |
|---|---|
| Whoever is in the session | Something said in chat that is not an answer to a current question becomes an intake item, and premise says so in one line ("Taken as I-14") ([0118](../decisions/0118-how-chat-messages-are-routed.md)) |
| The software's users | A feedback page per software. premise gives its link to the operator; giving it to users is the operator's act. The page has its own link, which can only submit feedback ([0119](../decisions/0119-feedback-page-has-its-own-link.md)) |
| The software's GitHub issues | Read by the server on a timer |
| premise itself | Check failures, errors in a running software's logs, dependency advisories, budget warnings from usage-ledger (once usable, milestone 2) |

While premise listens on localhost only ([0079](../decisions/0079-localhost-only.md)), the feedback page can be opened only on the owner's machine; being reached from other machines is a later decision for the owner. Until then, users outside the machine reach a software through its GitHub issues.

### 5.2 Triage

- A triager agent reads every item against the record: its kind (bug, wish, change of purpose, question, opinion, duplicate, noise), the items it touches, its rough size, and whether it touches the floor ([0094](../decisions/0094-triager-reads-every-item.md)).
- Routing by what an item touches needs the record, which an LLM can read; no person is needed for it. People sorting intake by hand was rejected.
- Item text is data, never instructions ([0116](../decisions/0116-outside-content-is-data.md)). An item that tries to instruct an agent is triaged as what it is (usually noise), and the attempt is reported.

### 5.3 Routes

Intake goes in normally; only what needs holding is held ([0062](../decisions/0062-intake-goes-in-normally.md)).

| Route | Which items | What happens |
|---|---|---|
| In normally (the default) | Bugs and wishes that fit the record | A change on the line: plan, build, check, run. A say-back only if the change touches purpose or is costly to undo ([0020](../decisions/0020-when-to-say-back.md)) |
| Asked at once | An item that touches purpose, a claimed area, or the floor | Asked in the session, under the role whose call it is |
| Held | Only the items that need holding (5.4) | Kept for a reading |
| Merged or closed | Duplicates, and noise | Duplicates join their item; noise is closed with its reason. Both are counted in reports |

A question asking for more detail ("more on W-7") is answered by the reporter from the record and the evidence ([reporter](reporter.md)).

### 5.4 What is held

Held means only items that mean little one at a time and something together ([0095](../decisions/0095-what-is-held.md)):

- opinions on whether the software is wanted or useful;
- wishes that pull against the record's purpose or users;
- one user's request that conflicts with what other users asked;
- ideas whose worth is unclear without more like them.

These are where patterns show what people want ([0041](../decisions/0041-intake-can-be-held.md)); acting on each alone would pull the software back and forth. Holding by default was rejected ([0062](../decisions/0062-intake-goes-in-normally.md)), as was acting on every item at once.

### 5.5 Readings

- Held items are read together when a software has ten held, when two weeks have passed with at least one held, or when the operator asks ([0096](../decisions/0096-when-held-items-are-read.md)). Readings only when someone asks would not happen while nobody is watching.
- The reader reads them ([0113](../decisions/0113-agent-roles.md)). A reading ends in a short list for the operator: what people seem to want, what keeps coming up, and whether the software's purpose or users should change.
- The operator decides any change of purpose.
- When people do not want the software, premise goes back to Why with the operator: the wrong problem may have been solved, or there are other problems ([0036](../decisions/0036-finding-out-if-people-want-it-is-out.md)). The line engine reopens Why ([line engine](line-engine.md)).

### 5.6 Telling senders

- Senders are told where their item stands: taken, held, done, closed. In the session, for items said there.
- A comment on a GitHub issue is public and in the owner's name, so it goes through the gate ([0101](../decisions/0101-the-gate-asks-in-the-session.md)). The session can approve status comments on one software's issues as a kind.
- The feedback page shows, to whoever holds an item's receipt, where that item stands. It shows no other item.

## 6. Configuration

| Key | Default | Meaning |
|---|---|---|
| `intake.issue_poll_minutes` | 10 | How often the server reads a software's GitHub issues |
| `intake.reading_held_count` | 10 | Held items that start a reading |
| `intake.reading_max_days` | 14 | Days with at least one held item that start a reading |

## 7. Limits

- Triage is per item, at the fast tier ([0104](../decisions/0104-model-tier-by-role.md)); readings are at the strongest tier.
- The feedback page accepts text only, with a length cap, and no attachments.

## 8. Failure modes and recovery

| Failure | Detection | Effect | Recovery |
|---|---|---|---|
| A flood of items | Count per source per hour | Triage queues up | Items are taken and acknowledged at once; triage catches up; the report counts the flood |
| Noise drowning people | Triage | Closed with reasons | Only what needs a person reaches one; notices only when someone is needed ([0098](../decisions/0098-report-when-a-change-reaches-running.md), [0099](../decisions/0099-notices-in-the-session.md)) |
| The GitHub issue reader fails | Error from the GitHub CLI | Issues not read | Retried at the next poll; reported if it keeps failing |
| A comment to a sender is refused at the gate | Gate decision | Sender not told on GitHub | The item's status stays visible on the page |

## 9. Security considerations

- Intake text comes from anyone; it is data ([0116](../decisions/0116-outside-content-is-data.md)).
- The feedback link can only submit feedback and read the status of one's own items; it gives no access to the session ([0119](../decisions/0119-feedback-page-has-its-own-link.md)).
- Intake text stays in premise's database; the repository cites only `I-n` ([0081](../decisions/0081-nothing-about-people-in-the-repository.md)).

## 10. Observability

- Counts per route, per source, per kind; held count and the time of the last reading.
- Milestone 4's report includes counts per route.

## 11. Milestones

- Milestone 1 step 2: things the operator says in chat become intake that goes in normally. No triage agent yet: every item goes in normally.
- Milestone 2 (against usage-ledger's mock until it exists, [0133](../decisions/0133-usage-ledger-is-mocked-until-it-exists.md)): budget warnings as intake.
- Milestone 4: intake from every source; triage; the in-normally, asked, held, and merged-or-closed routes; readings; the way back to Why; telling senders.
- Milestone 7: incidents from software kept live come back as intake.
