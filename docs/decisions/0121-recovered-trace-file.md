# 0121. Best-guess links from old code live in premise/recovered-trace.md

- Status: Accepted
- Scope: Milestone 6
- Date: 2026-11-21
- Decided by: The builders, in the documentation restructure of 2026-11-21. The owner did not make this choice.
- Source: The documentation restructure of 2026-11-21, writing the [record keeper](../specs/record-keeper.md) and [line engine](../specs/line-engine.md) specifications; old `docs/plan.md`, section 4, "Existing software".

## Context

When premise takes on existing software, "From then on every commit traces to items. Old code gets best-guess links, marked as guesses" (old `docs/plan.md`, section 4). Old commits carry no `Premise-Trace` trailer ([0083](0083-trace-trailer-on-every-commit.md)), and the plan does not say where the guesses are kept.

## Decision

- The record keeper writes the best-guess links into `premise/recovered-trace.md` in the software's repository: one line per file or part of the old code, naming the items it is guessed to serve, each marked as a guess.
- A line is removed when a later commit with a trailer covers that code.
- It is part of the lasting record, written only by the record keeper, in the same format rules ([0082](0082-record-as-markdown-with-ids.md)).

## Reason

- The guesses belong with the code they describe, for the same reason the record does: they outlive premise ([0080](0080-record-in-the-softwares-repository.md)).
- Adding trailers to old commits would mean rewriting history, which needs a force-push, on the floor ([0100](0100-floor-actions.md)).

## Alternatives considered

| Alternative | Why rejected |
| --- | --- |
| Rewriting old commits to add trailers | Force-pushing is losing data, on the floor. |
| Keeping the guesses only in premise's data folder | Lost if premise is not there; the reason for keeping the record in the repository ([0080](0080-record-in-the-softwares-repository.md)). |
| Guessed links inside each record item | Mixes guesses about code into statements of intent. |

## Consequences

- The record of an existing software has one more file than a new one.
- Reports on taking on existing software can count how much old code is still covered only by guesses.

## Related

[Record keeper](../specs/record-keeper.md), [line engine](../specs/line-engine.md), [0019](0019-existing-software-through-the-same-line.md), [0083](0083-trace-trailer-on-every-commit.md).
