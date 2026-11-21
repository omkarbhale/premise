# 0193. How the measures are built

- Status: Accepted
- Scope: Milestone 8
- Date: 2026-11-21
- Decided by: The builders; the points marked "chosen for the owner" are the owner's to correct.
- Source: [0172](0172-premise-measures-its-own-return.md), the [roadmap's milestone 8](../product/roadmap.md#milestone-8-the-measures-and-learning-from-corrections), and the task that built it.

## Context

- [0172](0172-premise-measures-its-own-return.md) asks premise to measure its own return from recorded facts and show it in its reports. It does not say how attention is counted, when a figure rests on too little, or where the figures show.

## Decision

1. **From recorded events only.** No agent and no usage-ledger figure is used, so nothing here is mocked and nothing is labelled mocked. The code is `src/measures/`.
2. **Two new records for attention.** An open page tells premise every `measures.presence_seconds` (30) while it is in front of someone, and once when it is hidden; premise keeps these as stretches, and a page silent for twice that long counts as closed. The page also says when a question was first shown. Neither writes to the events table, so a page's beats never wake other pages.
3. **Minutes of attention** are the time each question stood open while a page was in front of someone. A minute with several questions open is shared equally among them, so the shares add up to the minutes spent. They are counted per software, per change (the piece of work the software was on when the question was asked) and per role.
4. **Time to answer** is from a question first being shown to its answer; a question never shown on the page counts from when it was asked. The figure is the middle value.
5. **From the idea to running** is from a software being started in premise to the first time premise started a built version (the runner's first "started" event). For a software brought in, it is from bringing it in.
6. **From a problem to its fix running** is from an intake item arriving to the change it led to running, as intake already records.
7. **A checker miss** is an intake item triaged as a bug that touches a record item whose latest check, before the bug was triaged, said "met". The rate is misses out of the record items any check said were met, shown as "2 of 20 (10%)".
8. **Agent sessions per change** count each agent session against the piece of work the software was on when it started. A task running beside this one also adds session counts to the report; whichever lands second builds on the other.
9. **"Not enough yet."** A rate or a typical time needs at least `measures.min_events` events (5, chosen for the owner: the owner said "a handful"); with fewer it reads "not enough yet" and says how many there are. A single fact (one software's time to running) and a sum (minutes of attention) are shown as they are, with their count.
10. **Where they show.** A "How premise is doing" block in every report, written from the facts at the time, so each milestone report carries it; and a "How premise is doing" page with every software together and each one, under More. Every figure says what it counts, what it rests on, and how it is worked out.

## Reason

- Builders' note: counting only time in front of someone, and sharing a minute among open questions, keeps the estimate from claiming attention that was not spent. Saying "not enough yet" below a handful follows [principle 7](../../VISION.md): what cannot be worked out is said, not guessed.

## Alternatives considered

| Alternative | Why rejected |
| --- | --- |
| Count the whole time a question stood open | A question left open overnight would count as hours of attention. |
| Count while the event stream is connected | A page in a background tab stays connected; it is not attention. |
| Count each open question's full minute | Three open questions in one minute would count as three minutes. |
| Show every rate from the first event | "100%" from one event misleads more than "not enough yet". |

## Consequences

- New tables `page_presence` and `asks_shown` ([storage](../specs/storage.md)); new settings `measures.min_events` and `measures.presence_seconds` ([configuration](../reference/configuration.md)).
- The reporter gains the block ([reporter spec](../specs/reporter.md)); the [measures spec](../specs/measures.md) says what each figure counts.

## Related

[0097](0097-reports-from-recorded-facts.md), [0172](0172-premise-measures-its-own-return.md), [0194](0194-how-learning-from-corrections-is-built.md).
