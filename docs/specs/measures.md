# Measures

Status: built ([0172](../decisions/0172-premise-measures-its-own-return.md), [0193](../decisions/0193-how-the-measures-are-built.md)); the code is in `src/measures/`. Related: [reporter](reporter.md), [learning](learning.md), [storage](storage.md).

premise's own return, worked out from what it recorded. No agent is asked and no usage-ledger figure is used, so these figures are real and never labelled mocked.

## 1. The figures

| Figure | What it counts | Shown as |
| --- | --- | --- |
| People's attention | The time each question stood open while premise's page was in front of someone; a minute with several questions open is shared among them | A total, with the number of questions; by role and by change on the page |
| Time to answer a question | From a question first shown on the page to its answer (from when it was asked, if never shown) | The middle value |
| From the idea to running | From starting a software in premise (or bringing it in) to the first time premise started a built version | One software: its time. Every software: the middle value |
| From a problem reported to its fix running | From an intake item arriving to the change it led to running | The middle value |
| Reported working, came back as a bug | Intake items triaged as bugs touching a record item whose latest check, before the bug, said "met"; out of the record items any check said were met; an item hit by several bugs counts once in the rate, each bug is still listed | "2 of 20 (10%)" |
| Agent sessions per change | Agent sessions, each counted against the piece of work the software was on when it started | The average, with the total |

## 2. "Not enough yet"

- A rate or a middle value needs at least `measures.min_events` events (5). With fewer it reads "not enough yet" and says how many there are.
- A sum, and one software's single time to running, are shown as they are, with what they rest on.
- Every figure says what it counts, how many events it rests on, and how it is worked out.

## 3. What the page tells premise

- While the page is visible it says so every `measures.presence_seconds` (30), and once when it is hidden. A page silent for twice that long counts as closed.
- When a question first shows on the page, it says so once.
- Neither is written to the events table, so they never wake other pages.

## 4. Where they show

- In every report, as "How premise is doing" (each milestone report carries it as it was when written).
- On the **How premise is doing** page (under More): every software together, then each one, with attention by role and by change, sessions by change and each checker miss; with what premise learned from corrections below.

## 5. Interfaces

| Operation | Route | Returns |
| --- | --- | --- |
| Every software, and each | `GET /api/measures` | The overall view, each software's, and the event minimum |
| One software | `GET /api/softwares/:id/measures` | Its figures |
| The page is in front of someone, or not | `POST /api/presence` `{visible}` | ok |
| A question was shown | `POST /api/asks/:id/shown` | ok; 404 for an unknown question |

## 6. Not built yet

- Attention outside the page (thinking about a question away from it) cannot be seen and is not counted.
- Cost per change stays with usage-ledger, mocked until it exists ([0133](../decisions/0133-usage-ledger-is-mocked-until-it-exists.md)); figures per week, and next to cost, are [issue 121](https://github.com/omkarbhale/premise/issues/121).
