# 0185. How intake in a thin form is built: triage per item, work on the same line, status in plain words

- Status: Partly superseded by [0313](0313-several-pieces-of-one-software-at-once.md): point 9, intake work one item at a time; and by [0321](0321-the-queue-of-changes-says-where-each-stands.md): the order of intake work
- Scope: Making premise
- Date: 2026-11-21
- Decided by: The builders, while building intake in a thin form. Points 14 to 16 are chosen for the owner, open to correction. The owner did not make these choices.
- Source: [intake](../specs/intake.md), [intake and reporting](../architecture/intake-and-reporting.md), [0041](0041-intake-can-be-held.md), [0062](0062-intake-goes-in-normally.md), [0094](0094-triager-reads-every-item.md)–[0096](0096-when-held-items-are-read.md), [0118](0118-how-chat-messages-are-routed.md), [0168](0168-any-piece-of-work-goes-through-the-same-line-at-its-own-size.md), [0169](0169-a-first-pass-need-not-be-perfect.md), the roadmap's "intake, in a thin form".

## Context

- Until now, chat that was not an answer got "Taken as I-n" from a stand-in and nothing more happened to it.
- The specification fixes the sources, the triager, the routes and what is held. It leaves to the builders how an item becomes work on the line, what premise does when the triager is wrong or silent, how a question is answered, how fast small fixes are measured, and what the page shows.

## Decision

Each is a builders' choice, open to correction, unless marked as chosen for the owner:

1. **Intake is its own module** (`src/intake`). It meets the line engine through two small interfaces: `IntakeHooks` (chat that is intake, items premise raises, answers to intake's asks, and work items moving) and `IntakeLine` (put an item's work on the line). Build, Check, Run and Report stay behind `LaterStages`, which no longer takes intake.
2. **Sources in the thin form:** chat that is not an answer or a correction; the "Report a problem or a wish" box on each software's Intake tab; and premise itself, when a check stops without a verdict or a running software keeps crashing and the runner stops starting it. GitHub issues and the feedback page are sources the table accepts, but nothing reads them yet.
3. **Every item is numbered `I-n` per software and answered in one line at once** ("Taken as I-4 …"), then a `triage` job is queued for it. Intake text stays in premise's database (tables `intake_items` and `readings`, schema 7).
4. **The triager submits once, and premise routes the item at once.** `triage_submit` gives the kind, the record items touched (each with its reason), a rough size, whether it touches the floor, the route and a reason; a duplicate names the item it joins; a question carries its answer. A second submit is refused.
5. **premise holds the triager to rules it cannot break,** and says each change in the reason the page shows: a change of purpose, or anything that touches the floor, is asked of the operator; a question always goes in normally (it is answered, never asked or built); only opinions and wishes are held, so a bug is never held; only duplicates and noise are merged or closed; a duplicate must join another item of the same software; touched items must be live record items.
6. **A triager that gives no answer never stops intake.** When it fails, is stopped, or ends without submitting, the item goes in normally as a wish, premise's default ([0062](0062-intake-goes-in-normally.md)), and the reason says so.
7. **Triage is short by default:** fast tier, low effort, 20 turns and 5 minutes (`agents.tasks.triage.*`), like sizing, so a small fix starts quickly.
8. **In normally, an item becomes a work item of kind `intake`,** a child of the software's root item, sized by the sizer like any piece ([0168](0168-any-piece-of-work-goes-through-the-same-line-at-its-own-size.md)). Its work always goes through Build, Check, Run and Report, because a change runs and is reported ([0098](0098-report-when-a-change-reaches-running.md)); the sizer picks anything before Build (a wish usually gets What, and premise adds the say-back).
9. **Intake work is done one item at a time, after the software's own round.** An item taken in while the software is still on its way to Intake waits; when the software reaches Intake, waiting items start in the order they came; when one finishes, the next starts, and the line rests at Intake again.
10. **A question is answered from the record, and nothing is built.** The triager writes the answer from the record it is given; premise adds the text of the record items the answer cites and points to the Record and Report tabs. No reporter agent is involved: the reporter writes from recorded facts only ([0164](0164-how-the-reporter-is-built.md)).
11. **The time from an item arriving to its change running is recorded.** When an item's work gets past Run, premise records a `fix-running` event with the minutes since the item arrived, says so in the session, and shows it on the Intake tab.
12. **Merged, closed and held items are visible and undoable.** On the Intake tab the operator can take any of them in. The item then goes in normally, by the operator's word. Noise, a duplicate, an opinion or a question taken in this way becomes a wish. A bug or a change of purpose stays what it is.
13. **Readings, thin:** a `reading` job reads the held items together when `intake.reading_held_count` are held, when one has been held `intake.reading_max_days`, or when the operator presses "Read the held items now". The reader submits a short list with `reading_submit`. It goes to the operator as a question with "Noted" and "Go back to Why"; going back to Why sends the whole software back to Why. Read items are marked read. Due readings are checked when an item is held and every hour.
14. **Chosen for the owner: a change of purpose the operator confirms goes back to Why as its own piece of work.** That piece goes through Why and a say-back, then Build, Check, Run and Report. The rest of the software is not redone. Sending the whole software back to Why stays the operator's act: on the Line tab, or after a reading.
15. **Chosen for the owner: every sender in the thin form is told in the session.** Every source today is seen in the session: the operator's chat, the operator's report box, and premise itself. Each status change says one line there ("I-4: understood as a bug …"). The Intake tab shows where each item stands, in plain words: taken, being understood, being built, being checked, running, answered, held and why, merged or closed and why, waiting on you.
16. **Chosen for the owner: one triage job per item, never batched.** Each item is read on its own, at the fast tier. Batching would save little and would make a wrong call harder to see.
17. **A send-back or a failed whole check does not touch intake's own work.** Triage and reading jobs, and intake's questions, are not stopped or withdrawn with the line's work. When an intake item's work is withdrawn, its item says so.

## Reason

- 4, 5, 6: the owner asked for return over perfection ([0169](0169-a-first-pass-need-not-be-perfect.md)); routing must be quick and never stop, and what protects intent and the floor is not left to a model's judgment ([0007](0007-llm-does-not-decide-what-it-cannot.md), [0062](0062-intake-goes-in-normally.md), [0095](0095-what-is-held.md)).
- 7, 11: the plan asks that fixing small things through intake be quick, and that the time be measured ([0172](0172-premise-measures-its-own-return.md)).
- 8, 9: the same line at each piece's own size ([0168](0168-any-piece-of-work-goes-through-the-same-line-at-its-own-size.md)); one piece at a time keeps the line's state simple, as for parts ([0184](0184-how-sizing-of-work-is-built.md)).
- 10: a question needs an answer, not a build ([0118](0118-how-chat-messages-are-routed.md)); citing record lines keeps it grounded in what was recorded.
- 12: the operator corrects premise where being wrong is cheap ([0027](0027-spend-least-of-peoples-attention.md)).
- 14: a confirmed change of purpose must be drafted and said back with the operator ([0020](0020-when-to-say-back.md)), but redoing the whole software for one item would spend attention on what did not change.

## Alternatives considered

| Alternative | Why rejected |
| --- | --- |
| Apply the triage when its job ends, as sizing does | The item waits for nothing; routing at once is quicker and one submit is all a triager needs. |
| Ask the operator when the triager fails | Attention over something cheap to correct afterwards; the default route loses nothing. |
| Start intake work in the middle of the software's own round | Two pieces of one software at once; the line works on one piece at a time ([0184](0184-how-sizing-of-work-is-built.md)). |
| Send the whole software back to Why for each confirmed change of purpose | Redoes stages nothing changed; the operator can still do it on the Line tab. |
| Have the reporter answer questions | The reporter writes only from recorded facts and runs no agent; an answer needs reading the record. |
| Several items per triage job | A wrong call is harder to see and to undo; one fast job per item is cheap. |

## Consequences

- The [intake](../specs/intake.md), [line engine](../specs/line-engine.md), [storage](../specs/storage.md), [agent tools](../specs/agent-tools.md) and [page](../specs/page.md) specifications say what is built. The [triager](../prompts/triager.md) and [reader](../prompts/reader.md) prompts give the fields their tools take.
- New settings: `intake.reading_held_count`, `intake.reading_max_days`, `intake.max_text_chars`, `intake.recent_items_in_brief`; triage's defaults change as in point 7.
- Reading GitHub issues, the feedback page with its own link, telling a GitHub issue's sender through the gate, and budget warnings from usage-ledger are later work.
- Closes [issue 76](https://github.com/omkarbhale/premise/issues/76): each intake item is sized by the sizer.

## Related

[0062](0062-intake-goes-in-normally.md), [0094](0094-triager-reads-every-item.md), [0095](0095-what-is-held.md), [0096](0096-when-held-items-are-read.md), [0118](0118-how-chat-messages-are-routed.md), [0168](0168-any-piece-of-work-goes-through-the-same-line-at-its-own-size.md), [0169](0169-a-first-pass-need-not-be-perfect.md), [0183](0183-how-the-line-engine-is-built.md), [0184](0184-how-sizing-of-work-is-built.md).
