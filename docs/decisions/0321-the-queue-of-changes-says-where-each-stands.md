# 0321. The queue of changes says where each stands

- Status: Accepted; chosen for the owner by the assistant from the owner's questions, open to the owner's correction. Points marked builders' choice are the builders'.
- Partly supersedes: [0185](0185-how-intake-in-a-thin-form-is-built.md) on the order of intake work ("after the work before it", every intake item after all of the software's own work).
- Scope: Making premise
- Date: 2026-11-24
- Decided by: The assistant, for the owner, from the owner's questions; the builders where marked.
- Source: The owner: "So I can put a hundred things in intake and it will show me it will be worked on eventually, that is user experience problem, no?" And, from his game: "Milestone 1 didn't have wait on it, and instead of taking the intake it went to milestone 2, is that right?" (the milestone's title said "[wait]", but its wait flag was not set). Related: [0096](0096-when-held-items-are-read.md), [0128](0128-effort-per-software-and-milestone-waits.md), [0132](0132-sensible-things-are-configurable.md), [0172](0172-premise-measures-its-own-return.md), [0273](0273-a-change-is-planned-and-built-as-a-change.md), [0320](0320-a-timeline-of-the-line.md).

## Context

A long queue that only says "eventually" tells the person nothing. Intake work also always waited until every milestone was built, so a bug in what had just landed sat behind work not yet started. And a wait written into a milestone's text looked like a wait but was not one.

## Decision

1. **Each queued piece shows its place** ("3rd in line") and a rough estimate of the wait before it starts and of its own work, from premise's own measured history: the minutes and agent sessions finished changes (and milestones) of the same size took. Too little history of that size uses all sizes of the kind; too little of any says "not enough history yet". It is always labelled a rough estimate. How much history is enough is `line.estimate_min_history` (3).
2. **The order premise picks**: feedback on what has already landed first, then the software's milestones not started yet, then anything new; within each, priority, then the person's own placing, then size (small first) unless a smaller piece touches the same parts as an earlier one (it may depend on it), then arrival.
3. **Feedback goes before unstarted milestones.** A bug, or a change that touches what a reached milestone built, goes before the milestones that have not started; a wish for something new goes after them. The timeline says which and why; the person can move any change before or after the milestones. Once a milestone is done (after "go on", if it stops), feedback queued meanwhile runs before the next milestone.
4. **The person can reorder** with Up and Down on each queued change, and set its priority: "Do this first", "Normal", "Can wait". Moving a change past one of another priority, or across the milestones, takes on that one's priority or side, so the move does what the person sees. (Builders' choice: buttons, not dragging, so it works by keyboard and at phone width.)
5. **Related changes are proposed as one.** Queued changes whose triage found they touch the same record items are shown together ("these 4 changes are about the HUD"), with "Make them one change" or "Keep them apart". Made one, they are planned, built and checked as one change, every item followed and told; it can be split again until it starts. Kept apart, they are not proposed again unless a new change joins them. A change of purpose is never made one with others.
6. **A milestone and a change that overlap are proposed as one piece.** When a queued change touches what a queued milestone's planned tasks serve (both add sounds, say), premise says so on the timeline and proposes building the change as part of that milestone: one more task there, serving what the change touches, with the change's items following the milestone. "Keep them apart" is remembered.
7. **A long queue is said once, plainly.** When more than `line.queue_notice_items` (5) changes wait for one software, or they add up to more than `line.queue_notice_days` (7) days of work by the rough estimate, premise says so once in the conversation and on the timeline, with the total, and offers: hold the lowest-value ones (those last in the order; they go to the held items, read together later, and can be taken in again on the Intake tab), raise the software's budget (opens Usage), let more agents work at once (opens Settings), or leave it. Once the queue is short again, a later long queue is said again.
8. **A milestone's wait is its flag alone.** A wait marker a planner or a person writes into a milestone's text ("(wait)", "[wait]") is taken out and becomes the flag; markers left in older text are not shown. The timeline shows each milestone's wait as a mark ("Stops after it for you" or "Goes straight on after it") that the person can switch.
9. **The software list** shows each software's queue length and rough total.

## Reason

- Chosen for the owner: "eventually" is the problem the owner named. A place, a rough wait from premise's own measured history, and a plain notice when the queue grows long are the smallest things that make a hundred queued items mean something, without premise guessing beyond what it measured ([0172](0172-premise-measures-its-own-return.md)).
- Chosen for the owner: feedback on what landed is about software the person is trying now; building more on top of a known bug wastes the next milestone. Something new can wait its turn.
- Chosen for the owner: the owner expected a stop that was only words. One source of truth, shown and switchable where the order is shown, cannot disagree with itself.
- Builders' choice: holding uses the held items and their readings that already exist ([0096](0096-when-held-items-are-read.md)), so nothing is lost and nothing new needs explaining.
