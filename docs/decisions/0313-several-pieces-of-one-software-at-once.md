# 0313. Several pieces of one software at the same time

- Status: Accepted; the points marked chosen for the owner are open to the owner's correction
- Partly supersedes: [0184](0184-how-sizing-of-work-is-built.md) and [0185](0185-how-intake-in-a-thin-form-is-built.md) where they say one piece of a software is worked on at a time, a split piece's parts go one after another, and intake work goes one item after another
- Scope: Making premise
- Date: 2026-11-24
- Decided by: The builders; the points marked chosen for the owner are the assistant's, open to the owner's correction ([0136](0136-open-questions-chosen-for-the-owner.md)).
- Source: The owner, after learning that premise does one piece of work at a time within a software, so feedback on one part waited behind a fix that touched other files: "Isn't building or working on an enterprise app part of premise's vision?" [0166](0166-any-software-of-any-scale.md) to [0170](0170-what-may-be-split-is-decided-by-strong-prompting.md), [0074](0074-two-agent-sessions-at-once.md), [0132](0132-sensible-things-are-configurable.md), [0197](0197-how-several-softwares-at-once-is-built.md).

## Context

- The vision is any software at any scale: a small tool, an enterprise application, a monorepo ([0166](0166-any-software-of-any-scale.md)). An enterprise application has many teams' worth of independent work in flight at once.
- Until now, within one software, work went strictly one piece after another: intake work one item after another, a split piece's parts one after another ([0184](0184-how-sizing-of-work-is-built.md), [0185](0185-how-intake-in-a-thin-form-is-built.md)). Only different softwares ran at the same time, bounded by `queue.max_agent_sessions` ([0197](0197-how-several-softwares-at-once-is-built.md)).
- The plan did not say how premise knows two pieces are independent, when a piece may start beside another, how pieces built at once land, or what happens when they collide.

## Decision

1. **Independence is decided, never assumed.** The sizer names, for each piece, the parts of the software it will change (`touches`: folders, files, modules, record item IDs) and whether it changes a foundation decision (`changes_foundation`); for a split, each part may name its own. When it named any, the record items the change serves (from triage and the change's plan) are added. A piece whose sizer named nothing is not known, and goes one after another, as before.
2. **A piece leaves the front at Build** (chosen for the owner). Its sizing and the stages before building (What, Plan, the one question about a change) stay in front, one piece at a time, so a person is asked about one piece at a time. At Build, when the software may build more than one piece at once, the piece goes on in its own lane, on its own branch, and the front moves on to the next piece.
3. **The rule.** A piece in flight is built now only when what it touches does not overlap what any piece being built touches, nor any piece that left the front before it and still waits; neither changes a foundation decision (a change of what the software is for counts as one); and fewer than the software's limit are being built. Otherwise it waits. Each decision is recorded with its reason (events `piece-in-flight` and `piece-waits`) and said in plain words ("I-2 (the armour) is ready to build. Waits for I-1 (the shield): both change src/combat/."). Waiting pieces are weighed again, in the order they left the front, whenever a piece lands or the limit changes.
4. **Each piece lands in turn.** A piece keeps its own build notes, is checked on its own, and lands through the server as before; landings of one software go one at a time. When code other than the record changed on the default branch since the piece started (another piece landed), premise merges the new version into the piece's branch without touching any working folder, and checks it again (what it touches, plus every must already met) before it lands. A change only to the record does not cause a second check (builders' choice).
5. **A real conflict goes back to its builder once,** with the files and how to bring the new version in, then is checked again; if it still conflicts, premise asks the person: "Have the builder try again" or "Build it again on the new version" (chosen for the owner).
6. **Split parts** go into flight under the same rule. Each part lands on its own once checked, without starting the software; when every part has landed the whole is checked, then started, reported and, for a milestone, stopped at if the person asked. A fix the check of the whole asks for lands on its own too.
7. **How many at once.** `line.pieces_in_flight` (default 2, chosen for the owner) caps the pieces of one software being built at once; each software can choose its own on its Line tab, and 1 restores building one piece after another. `queue.max_agent_sessions`, priority between softwares and budgets still bound everything, as before.
8. **The page** shows each piece in flight (a card "Built at the same time" on the Line tab): where it is, what it touches, and why any waits. The status line says what is in flight; the list of pieces marks them.
9. **Milestone waits hold.** Milestones are never built in flight; a software stopped after a milestone starts no job at all, in flight or not, until the person says go on.
10. **Sending back** stops every piece in flight; each waits its turn again and is built anew from the new version. A restart keeps every piece in flight: its lane is stored with the piece, and its jobs are picked up as any job is.

## Reason

- No reason was recorded by the owner beyond the question. Builders' reasons: overlap of what pieces touch is a rule a person can check and premise can say in one line; assuming independence would land broken combinations nobody asked about ([0014](0014-guard-against-further-big-mistakes.md)). When unsure, one after another keeps today's safety.
- Chosen for the owner: leaving the front at Build keeps the person's attention on one question at a time ([0027](0027-spend-least-of-peoples-attention.md)), while the long part, building and checking, runs at the same time. Two at once by default matches the two agent sessions premise runs by default ([0074](0074-two-agent-sessions-at-once.md)).
- Builders' note: checking a piece again on the version it lands on is the only way its check says something about what runs. Bringing the new version in as a merge, made by the server, never rewrites history ([0083](0083-trace-trailer-on-every-commit.md), the git module's rule).
- Chosen for the owner: a conflict is the builder's to resolve first, with the evidence, as a failed check is; a second conflict usually means the two changes disagree about something a person should decide.

## Alternatives considered

| Alternative | Why rejected |
| --- | --- |
| Run every piece at once and sort out collisions when they land | Independence would be assumed, not decided; most collisions would be found late, after two builds. |
| Pieces leave the front before their first stage | Several pieces could ask the person at once; asking is the costliest thing premise does. Left for later (issue). |
| Rebase a piece onto the new version | Rewrites the piece's history; a merge made by the server keeps every commit and its trace. |
| Check a piece again after every commit on the default branch | The record keeper commits the record there often; a second check for a record-only change costs a session and checks nothing new. |
| Ask the person at the first conflict | Most conflicts are mechanical; the builder resolves them with the evidence, as it fixes a failed check. |
| A total limit only (`queue.max_agent_sessions`) | One software could take every session; a limit per software keeps others moving and lets 1 restore the old order. |

## Consequences

- New: `src/line/parallel.ts` (the rule), `src/shared/lane-context.ts` (which piece the code serves), pieces in flight in `src/line/line-engine.ts`, per-piece build notes and landing in turn in `src/build/build-check-run.ts`, `RecordKeeper.bringMainInto`, and git's `mergeTree`. No database change: a piece's flight is kept in its line notes, its build notes in `settings` (`build:<software>:piece:<item>`).
- `sizing_submit` takes `touches` and `changes_foundation`, and each split part `touches` ([agent tools](../specs/agent-tools.md), [sizer prompt](../prompts/sizer.md)).
- New setting `line.pieces_in_flight`; new page control and card; `POST /api/softwares/:id/pieces-in-flight` ([page](../specs/page.md), [configuration](../reference/configuration.md)).
- Carried in the [line engine](../specs/line-engine.md), [work queue](../specs/work-queue.md) and [build, check and run](../architecture/build-check-run.md).
- Kept tests with the scripted agent: two independent pieces at once, both landing; two overlapping ones one after the other; a piece whose base moved checked again; a conflict back to its builder, then to the person; one at a time restoring the old order; a restart with two pieces in flight.
- Left for later, filed as issues: early stages at the same time too ([228](https://github.com/omkarbhale/premise/issues/228)), learning from what a piece really touched ([229](https://github.com/omkarbhale/premise/issues/229)), split parts built one at a time losing the earlier parts, found while building this ([230](https://github.com/omkarbhale/premise/issues/230)), releasing a taste claim for pieces in flight ([231](https://github.com/omkarbhale/premise/issues/231)), each piece's own Build panel on the page ([232](https://github.com/omkarbhale/premise/issues/232)), and measures of what building at once bought ([234](https://github.com/omkarbhale/premise/issues/234)).

## Related

[0074](0074-two-agent-sessions-at-once.md), [0166](0166-any-software-of-any-scale.md), [0168](0168-any-piece-of-work-goes-through-the-same-line-at-its-own-size.md), [0170](0170-what-may-be-split-is-decided-by-strong-prompting.md), [0184](0184-how-sizing-of-work-is-built.md), [0185](0185-how-intake-in-a-thin-form-is-built.md), [0197](0197-how-several-softwares-at-once-is-built.md), [0273](0273-a-change-is-planned-and-built-as-a-change.md).
