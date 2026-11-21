# 0181. The line works on work items; today each software is one

- Status: Accepted
- Scope: Making premise
- Date: 2026-11-21
- Decided by: The builders, so the line can later take pieces of work of any size without a rebuild.
- Source: Guidance during the line engine's build: the line will apply to a software, a milestone, a module or one intake item, each at its own size, and a large piece may split into child pieces.

## Context

- The first form of the line kept a software's stage on its own row. Work of other sizes would need the line's state moved off that row later.

## Decision

- What goes through the line is a **work item**: id, software, parent item or none, kind (software, milestone, module, intake), size class, current stage, state, the list of stages it goes through, and the line engine's own notes. Table `work_items` (schema 5).
- Each software has one root item, holding all eleven stages. Its stage, state and size are mirrored on the software's row, which the work queue and the page read.
- Stage runs (`stage_runs`) belong to a work item. A stage run may own several jobs and ends when all of them have ended and their results are taken in; today each early stage makes one.
- The next stage is the next one in the item's own list, so an item can skip stages it does not need.
- No child items are made yet, and there is no page for them.

## Reason

- A modest change now; moving the line's state off the software's row later would touch every part of the line engine.

## Alternatives considered

| Alternative | Why rejected |
| --- | --- |
| Keep the line's state on the software's row | A rebuild once milestones, modules or intake items go through the line. |
| Build splitting now | Not asked for yet; no specification says how a piece splits. |

## Consequences

- The storage specification lists `work_items`.

## Related

[0085](0085-stage-effort-budgets.md), [0117](0117-size-classes-set-stage-budgets.md), [0183](-how-the-line-engine-is-built.md).
