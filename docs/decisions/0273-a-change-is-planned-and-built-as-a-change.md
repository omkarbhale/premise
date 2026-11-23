# 0273. A change is planned and built as a change, never as the software's whole plan again

- Status: Accepted; points 5 and 7 chosen for the owner, open to the owner's correction
- Scope: The product
- Date: 2026-11-23
- Decided by: The builders, fixing what the owner found in his first real run; the points marked chosen for the owner are the assistant's, open to the owner's correction.
- Source: The owner's first real run with real agents. He sent a wish on a finished software ("take the model, and maybe the effort, into account in the weekly usage calculation"). premise drafted the changed What correctly, then at Plan showed "Milestones: is this the right order?" with the software's original two milestones and the first-build wording ("The first milestone is what you asked for; the later ones are premise's own additions..."). He could not tell whether these were milestones for his change or the old ones. They were the old ones.

## Context

- For an intake item's work, the planner was given the plan brief for a new software. It returned the whole software's plan again: the same milestones and every task, with the new items folded into one task, and that plan replaced the stored one.
- The line then asked the milestones question as if this were the first build.
- Build took every task in the plan for the change (with no milestone it took them all), so builders would have walked the whole software again for one change, and the check judged the last milestone's items rather than the change's.

## Decision

1. **Planning a change plans the change.** The planner gets a brief of its own (the change plan brief, [docs/prompts/planner.md](../prompts/planner.md)): the record, the software's plan already built, and the change's new or changed items and the items triage found it touches. It returns only the decisions the change adds or replaces, each with its reason (a replaced one named in `replaces`), and the task or few tasks the change needs, each naming the items it serves. premise refuses milestones in it, a task that serves no record item, and more tasks than `line.change_max_tasks`.
2. **The change's plan is kept beside the software's plan,** one file per work item (`plans/<software>/changes/<work item>.json`), never over it. The software's milestones and the tasks already built are not planned, asked or built again.
3. **No milestones question for a change.** After its plan (and the foundation review when it changes a foundation decision) the change goes on to Build, where premise asks or tells once ([0274](0274-a-change-asks-at-most-one-question.md)).
4. **Build runs only the change's tasks; Check judges the items the change touches plus every must already met,** so nothing that worked is broken unseen, against the new commit. A must counts as met when its last verdict was met; before any verdict, every must counts. The report for the change says what changed, what was checked for it, what was checked again and what was not.
5. **When the sizer gave the change no Plan step,** it is built as one task named after the change, serving the items it adds or touches (chosen for the owner).
6. **The page names what it shows:** "Your change I-1: ..." with the change's own steps, and the software's milestones stay shown as reached. Under Build the work is named as the change, not a milestone.
7. **Softwares already in the old state when premise is updated:** at start-up, an open milestones question that belongs to a change is withdrawn and the change is planned again the new way, with one plain line in the conversation saying so. Nothing built is lost: the record's milestones and what landed stay as they are (chosen for the owner).
8. **A large change** is split by the sizer, as any piece of work is; its parts are steps of the change, each planned as a change, never the software's milestones.

## Reason

- A change is what the person asked for; re-planning and rebuilding the whole software for it wastes builders' sessions and asks the person a question about something they did not ask for ([VISION.md](../../VISION.md) principle 6, [0027](0027-spend-least-of-peoples-attention.md)).
- Keeping the change's plan apart means the software's plan, which the checks of earlier milestones rest on, is never silently replaced.

## Alternatives considered

| Alternative | Why rejected |
| --- | --- |
| Keep one plan per software and let the planner append the change's tasks | The planner already folded new items into old tasks; one file invites the same mistake, and Build cannot tell which tasks are the change's. |
| Ask the milestones question with wording about the change | The change has no milestones; any wording asks the person to judge the software's order again. |
| Check only the change's items | A change can break something that worked; the musts already met are checked again so it is seen. |

## Consequences

- `src/line/change-plan.ts` reads and keeps a change's plan; the line engine plans a change with the change plan brief and gives Build and Check the change's tasks and items (`ChangeWork` in `src/line/later-stages.ts`); `src/build/build-check-run.ts` builds only those tasks and checks the touched items plus the musts already met.
- `line.change_max_tasks` (default 3) bounds a change's tasks.
- [docs/specs/line-engine.md](../specs/line-engine.md), [docs/architecture/the-line.md](../architecture/the-line.md) and [docs/architecture/build-check-run.md](../architecture/build-check-run.md) say how a change is planned and built.

## Related

[0185](0185-how-intake-in-a-thin-form-is-built.md), [0186](0186-how-build-check-and-run-are-built.md), [0192](0192-effort-in-proportion-to-what-was-asked.md), [0274](0274-a-change-asks-at-most-one-question.md), [0275](0275-an-agent-without-its-answer-is-asked-once-more.md).
