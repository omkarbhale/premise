# 0184. How sizing of work is built: a sizer per piece, parts one after another, a check of the whole

- Status: Accepted
- Scope: Making premise
- Date: 2026-11-21
- Decided by: The builders, while building sizing of work. Points 13 and 14 are chosen for the owner, open to correction. The owner did not make these choices.
- Source: [0168](0168-any-piece-of-work-goes-through-the-same-line-at-its-own-size.md), [0169](0169-a-first-pass-need-not-be-perfect.md), [0170](0170-what-may-be-split-is-decided-by-strong-prompting.md), [0181](0181-the-line-works-on-work-items.md), [0117](0117-size-classes-set-stage-budgets.md), [0132](0132-sensible-things-are-configurable.md), [line engine](../specs/line-engine.md).

## Context

- The owner decided that any piece of work goes through the same line at its own size, and that what may be split is decided by strong prompting: completely separate parts or very long parts may be split, and one heavy piece of work is not by itself a reason ([0168](0168-any-piece-of-work-goes-through-the-same-line-at-its-own-size.md), [0170](0170-what-may-be-split-is-decided-by-strong-prompting.md)).
- The line engine already keys its work on work items, and each software was one root item with all eleven stages ([0181](0181-the-line-works-on-work-items.md)). Nothing sized a piece, nothing split one, and the page could not say that a stage was not needed ([issue 66](https://github.com/omkarbhale/premise/issues/66), [issue 58](https://github.com/omkarbhale/premise/issues/58)).

## Decision

Each is a builders' choice, open to correction, unless marked as chosen for the owner:

1. **A sizer job runs before a piece's first stage.** It is an agent role of its own (`sizer`) with its own task kind (`size`), so its model, effort and limits are set like any other task's (`agents.tasks.size.*`). By default it uses the fast tier at low effort, with 20 turns and 5 minutes, so the first stages stay quick. Its prompt is [docs/prompts/sizer.md](../prompts/sizer.md). It submits one answer with `sizing_submit`: the size, the stages and whether to split, each with a reason.
2. **The splitting rule is in the prompt, stated strongly.** The prompt says: split only parts that are completely separate from each other, or a part that is very long; one heavy piece of work is NOT by itself a reason to split; when unsure, do not split. Parts of a split piece and fixes are never split again. A split needs two parts or more, and at most `line.split_max_parts` (5). `line.splitting` can turn splitting off.
3. **premise holds the sizer to rules it cannot break.** Every piece is built and checked by an agent that did not build it. A software always goes through Why, What, the say-back and Plan, then Build, Check, Run, Report and Intake. Only Who and What exists may be skipped. A milestone always goes through Build, Check, Run and Report. A part of a split piece may have any stage from Why to Check. A say-back is added whenever Why or What is ([0020](0020-when-to-say-back.md)). Every change premise makes to the sizer's answer is said in the reason the page shows.
4. **A sizer that gives no answer never stops the line.** When the sizer fails, is stopped, or finishes without an answer, the piece keeps its size, goes through every stage it may have, and stays whole. The reason says so, and the operator can change it.
5. **A piece is sized when the line comes to it.** That is when a software starts, and when each milestone or part becomes the piece being worked on. A milestone that a later "go back to Why" withdraws is never sized for nothing.
6. **One piece of a software is worked on at a time.** The line keeps the piece being worked on (the active item). The software's row mirrors that piece's stage. Parts go through the line one after another, in order.
7. **A split piece hands Why to Check to its parts, then runs and reports as a whole.** Each part is built and checked on its own. When every part is done, the whole piece is checked. That is a hand-off to the Check stage: a `WholeCheck` interface (`src/line/whole-check.ts`) and a scripted stand-in that passes and says it checked nothing, until the real Check stage takes it over. When the whole passes, the piece goes on after Check: Run, Report and, for a software, Intake. When the whole does not pass, a fix goes through the line as one more part, carrying the evidence. After three rounds premise goes on and says so.
8. **A confirmed plan's milestones become the piece's parts.** Each milestone is a child work item that refers to its record item (`M-n`). Its wait is read from the record, so the operator edits milestones and waits exactly as before ([0160](0160-milestones-are-record-items.md)). Milestones are not checked as a whole afterwards: each milestone's Check already checks the software built so far.
9. **The operator overrides sizing on the Line tab, in plain words.** They can change any piece's size, which changes its stages' budgets. They can change its steps, and what is always needed stays. They can undo a split until a part reaches Build. After that, they send the work back instead. Taking out the stage a piece is at moves it on. Sending back applies to the piece being worked on, or to the nearest piece above it that went through that stage itself. The parts made after that stage are withdrawn and made again.
10. **The service says which stages were skipped.** A stage the piece being worked on does not need has the position `skipped`, with the reason, so the page never shows it as pending ([issue 66](https://github.com/omkarbhale/premise/issues/66)).
11. **The time before building is recorded for every piece.** The first time a piece reaches Build, the time is kept on it, and on every piece above it that had not reached Build yet. A `build-started` event carries the minutes since the piece was made, so later work can measure how quick the first stages are ([0172](0172-premise-measures-its-own-return.md)).
12. **No several agents per stage by default.** `line.agents_per_stage` is 1. The structure allows a stage run to own several jobs ([0181](0181-the-line-works-on-work-items.md)), but nothing uses a higher value yet, and the setting says so.
13. **Chosen for the owner: a new software never skips its Why, What, say-back and Plan.** The sizer can shorten the line for milestones and parts, but not for a whole new software. Its purpose is new, and the say-back is the cheap first check ([0020](0020-when-to-say-back.md)).
14. **Chosen for the owner: the Why draft's "Size" item still sets the software's size when the operator keeps it.** The sizer's guess comes first. The operator's word at Why, or on the Line tab, replaces it.

## Reason

- 1, 4, 5: the owner asked for return over perfection ([0169](0169-a-first-pass-need-not-be-perfect.md)). Sizing must be quick and must never become a place where the line stops.
- 2: the owner's own words decide what may be split ([0170](0170-what-may-be-split-is-decided-by-strong-prompting.md)). Splitting parts again would let a wrong first split multiply.
- 3, 13: what protects intent and the floor is not left to a model's judgment ([0007](0007-llm-does-not-decide-what-it-cannot.md), [0030](0030-independent-check.md)).
- 6: one piece at a time keeps the line's state on one row of notes, and keeps cost down while splitting is unproven ([0170](0170-what-may-be-split-is-decided-by-strong-prompting.md)).
- 7: each part checked alone does not show that the parts work together, so the whole is checked before it runs. The real Check stage is another task's work, so only its job and interface are defined here.
- 8: milestones were already the owner's stops; making them child items puts them on the same line with no change to how they are edited.
- 9, 10: the operator corrects premise's assumptions where being wrong is cheap ([0027](0027-spend-least-of-peoples-attention.md)), and the page says what was decided and why.

## Alternatives considered

| Alternative | Why rejected |
| --- | --- |
| Size every milestone as soon as the plan is confirmed | Sizes milestones that a "go back to Why" may withdraw; the line waits for the first one anyway. |
| Run a split piece's parts at the same time | Several agents at once is unproven and costs more ([0170](0170-what-may-be-split-is-decided-by-strong-prompting.md)); the work queue's session limit still applies across softwares. |
| Stop and ask the operator when the sizer fails | Asks for attention over something cheap to correct afterwards; the safe default loses nothing. |
| A size threshold that forces a split | The owner asked for judgment by strong prompting, not a number ([0170](0170-what-may-be-split-is-decided-by-strong-prompting.md)). |
| Let the sizer skip Why for a new software | A new software's purpose is new; skipping its say-back risks building the wrong thing, the mistake that matters ([0013](0013-mismatch-of-intent-is-the-mistake-that-matters.md)). |

## Consequences

- Schema 6 adds to `work_items`: the part's title and words, the record item it stands for, its order, its origin (start, split, plan or fix), its sizing with reasons, the sizer's pending answer, and when it was sized, reached Build and finished ([storage](../specs/storage.md)).
- The [line engine](../specs/line-engine.md) specification describes sizing (5.2a), the [agent tools](../specs/agent-tools.md) list `sizing_submit`, the [page](../specs/page.md) shows the Line tab's "Size and steps" card, and the [prompts](../prompts/README.md) include the sizer.
- Intake items will be sized the same way once intake is built; the rules for them (any stage but Intake) are already in `src/line/sizing.ts`.
- Closes [issue 58](https://github.com/omkarbhale/premise/issues/58) and [issue 66](https://github.com/omkarbhale/premise/issues/66).

## Related

[0020](0020-when-to-say-back.md), [0085](0085-stage-effort-budgets.md), [0117](0117-size-classes-set-stage-budgets.md), [0160](0160-milestones-are-record-items.md), [0168](0168-any-piece-of-work-goes-through-the-same-line-at-its-own-size.md), [0170](0170-what-may-be-split-is-decided-by-strong-prompting.md), [0181](0181-the-line-works-on-work-items.md), [0183](0183-how-the-line-engine-is-built.md).
