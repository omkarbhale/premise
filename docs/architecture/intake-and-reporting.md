# Intake, reporting and taste

Carved from section 6 of the plan (the floor, from the same section, is in [the floor and the gate](the-floor-and-the-gate.md)). Part of the [architecture](overview.md). Specs: [intake](../specs/intake.md), [reporter](../specs/reporter.md), [page](../specs/page.md), [line engine](../specs/line-engine.md). Prompts: [triager](../prompts/triager.md), [reader](../prompts/reader.md), [reporter](../prompts/reporter.md).

## Intake sources

- Whoever is in the session: something said in chat that is not an answer to a current question becomes an intake item, and premise says so in one line ("Taken as I-14"). How chat is told apart from answers and corrections: [0118](../decisions/0118-how-chat-messages-are-routed.md).
- The software's users: a feedback page per software. premise gives its link to the operator; giving it to users is the operator's act.
- The software's GitHub issues, read by the server on a timer.
- premise itself: check failures, errors in a running software's logs, dependency advisories, budget warnings from usage-ledger.
- Everything that comes in is data for the agents that read it, never instructions ([0116](../decisions/0116-outside-content-is-data.md)).

## Triage and routes

- [0094](../decisions/0094-triager-reads-every-item.md) (P28): a triager agent reads every item against the record: its kind (bug, wish, change of purpose, question, opinion, duplicate, noise), the items it touches, its rough size, and whether it touches the floor.
  - Why: routing by what an item touches needs the record, which an LLM can read; no person is needed for it.
  - Rejected: people sorting intake by hand.
- Routes ([0062](../decisions/0062-intake-goes-in-normally.md): intake goes in normally; only what needs holding is held):
  - **In normally, the default:** bugs and wishes that fit the record become changes on the line. A bug on something the record already requires is built, checked and run straight away; a wish that changes what the software must do is confirmed once at What, then planned and built ([0192](../decisions/0192-effort-in-proportion-to-what-was-asked.md)). A say-back only for a change of purpose.
  - **Asked at once:** an item that touches purpose, a claimed area, or the floor is asked in the session, under the role whose call it is.
  - **Held:** only the items that need holding ([0095](../decisions/0095-what-is-held.md)).
  - **Merged or closed:** duplicates join their item; noise is closed with its reason. Both are counted in reports.
- [0095](../decisions/0095-what-is-held.md) (P29): held means only items that mean little one at a time and something together:
  - opinions on whether the software is wanted or useful;
  - wishes that pull against the record's purpose or users;
  - one user's request that conflicts with what other users asked;
  - ideas whose worth is unclear without more like them.
  - Why: these are where patterns show what people want ([0041](../decisions/0041-intake-can-be-held.md)); acting on each alone would pull the software back and forth.
  - Rejected: holding by default ([0062](../decisions/0062-intake-goes-in-normally.md)); acting on every item at once.
- [0096](../decisions/0096-when-held-items-are-read.md) (P30): held items are read together when a software has ten held, when two weeks have passed with at least one held, or when the operator asks.
  - Why: enough items to see a pattern, without leaving senders unanswered for long.
  - Rejected: readings only when someone asks (they would not happen while nobody is watching).
- A reading ends in a short list for the operator: what people seem to want, what keeps coming up, and whether the software's purpose or users should change. Readings are done by the reader agent ([0113](../decisions/0113-agent-roles.md)).
  - The operator decides any change of purpose.
  - When people do not want the software, premise goes back to Why with the operator ([0036](../decisions/0036-finding-out-if-people-want-it-is-out.md)).
- Senders are told where their item stands (taken, held, done, closed): in the session, for items said there. A comment on a GitHub issue is public and in the owner's name, so it goes through the gate ([0101](../decisions/0101-the-gate-asks-in-the-session.md)).

## Reporting

- [0097](../decisions/0097-reports-from-recorded-facts.md) (P31): reports are built from recorded facts only: check verdicts, job outcomes, gate decisions, usage-ledger figures. Every line links to its evidence. No agent's account of its own work is a source.
  - Why: a false report is on the floor ([0056](../decisions/0056-what-is-on-the-floor.md)), and self-reports were the source of the prior art's false reports.
  - Rejected: reports written from agents' summaries.
- The report view, always current, for each software ([0012](../decisions/0012-reporting-with-a-product-default.md)):
  - **Decided:** record items and decisions since the last report.
  - **Running:** what runs, which commit, and where to open it.
  - **Needed:** what is needed and from which role, each with exactly what to do.
  - **Failed or not checked:** every item not met or not checked.
  - **Cost:** from usage-ledger, once it is usable ([models and cost](models-and-cost.md)).
- [0098](../decisions/0098-report-when-a-change-reaches-running.md) (P32): a short report each time a change reaches running; an immediate notice only when someone is needed.
  - Why: it is the rhythm the owner chose for premise's own building ([0054](../decisions/0054-reports-to-the-owner.md)).
  - Rejected: a report per task (noise); reports only when asked.
- [0099](../decisions/0099-notices-in-the-session.md) (P33): notices: the "needed" list in the session, grouped by role, a count in the browser tab, and browser notifications while the page is open.
  - Why: it needs no outside account and sends nothing in anyone's name.
  - Rejected for now: email or chat messages (an outside account, and messages sent outside premise).
- More detail when asked, in chat ("more on W-7"), answered from the record, the evidence and the working records ([0118](../decisions/0118-how-chat-messages-are-routed.md)).

## Taste ([0022](../decisions/0022-people-can-put-in-their-taste.md))

- An area is claimed in the session under a role, in its own words ("the look of the main screen", "the API's naming").
- [0102](../decisions/0102-taste-proposals-before-building.md) (P36): before a claimed area is built, a proposal is shown in the session under the claiming role: a screenshot of a quick prototype, or a short list. It is decided there; other tasks go on.
  - Why: something to look at is the cheapest way to catch a mismatch ([0013](../decisions/0013-mismatch-of-intent-is-the-mistake-that-matters.md)). Review points exist only where someone claimed an area ([0022](../decisions/0022-people-can-put-in-their-taste.md)).
  - Rejected: a written description to approve; review of every area by default ([0022](../decisions/0022-people-can-put-in-their-taste.md)).
  - How the prototype is made and captured: [0115](../decisions/0115-taste-prototypes-on-a-throwaway-branch.md). As built for now, the proposal is one or two described options written by the planner before the milestone's tasks start, and only the tasks that build the area wait ([0196](../decisions/0196-roles-and-taste-in-one-session.md)).
- What they say becomes `T` items. Those that can be checked go into the checker's scenarios.
- Small wishes come in as intake.
