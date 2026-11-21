# 0167. Any piece of work goes through the same line, at its own size

- Status: Accepted
- Scope: The product
- Date: 2026-11-21
- Decided by: The owner: "Build can be a ticket or a entire module or entire software. Similarly, for intake, a single intake entry might need just one task/agent/validation/etc or planning as well. Perhaps the intake also goes through the entire line, following the same principle. If it can be done by LLMs, it should."
- Source: [The owner on scale, direction and order](../record/scale-and-direction-2026-11-21.md)

## Context

- The line was drawn for one software, with size classes that only scale one agent's budget ([0117](0117-size-classes-set-stage-budgets.md)), and intake that re-enters at Plan or Build, or goes back to Why.
- The owner asked whether a piece of work of any size, and intake itself, should follow the same line.

## Decision

- Any piece of work goes through the same line, at its own size: a software, a milestone, a module, an intake item.
- Intake follows the same principle: an item is sized, and goes through the stages it needs.
- Sizing picks the stages and their depth for the piece. The line itself does not change.
- If an LLM can do it, it should ([0006](0006-llm-does-what-it-can.md)).

## Reason

- Owner: "If it can be done by LLMs, it should."

## Alternatives considered

| Alternative | Why rejected |
| --- | --- |
| One line only for whole softwares, with intake outside it | The owner asked for intake to follow the same principle. |
| A different, lighter process for intake items | One line sized to the piece does the same job with one thing to build and explain. |

## Consequences

- [The line](../architecture/the-line.md) gains a section on work of any size; the line engine is keyed on work items when it is built ([line engine](../specs/line-engine.md)).
- Size classes ([0117](0117-size-classes-set-stage-budgets.md)) become per-piece sizing; splitting is [0169](0169-what-may-be-split-is-decided-by-strong-prompting.md).
- Milestone 1 includes work sized per piece; intake in a thin form comes next ([roadmap](../product/roadmap.md), [0178](0178-the-roadmap-is-reordered.md)).

## Related

[0006](0006-llm-does-what-it-can.md), [0010](0010-the-whole-line-is-the-product.md), [0085](0085-stage-effort-budgets.md), [0117](0117-size-classes-set-stage-budgets.md), [0165](0165-any-software-of-any-scale.md), [0169](0169-what-may-be-split-is-decided-by-strong-prompting.md).
