# 0185. How Build, Check and Run are built; what a check that cannot pass leads to

- Status: Accepted; points 9 and 10 chosen for the owner, open to the owner's correction
- Scope: Making premise
- Date: 2026-11-21
- Decided by: The builders, while building Build, Check and Run. Points 9 and 10 are chosen for the owner, on the owner's instruction "choose for me" ([0136](0136-open-questions-chosen-for-the-owner.md)).
- Source: [build, check and run](../architecture/build-check-run.md), [line engine](../specs/line-engine.md) 5.3 and 5.7, [0030](0030-independent-check.md), [0086](0086-working-copy-and-branch-per-change.md)–[0092](0092-security-defaults.md), [0122](0122-scenarios-written-before-the-build.md), [0167](0167-premise-adapts-at-runtime-to-the-software.md), [0181](0181-the-line-works-on-work-items.md), [0183](0183-how-the-line-engine-is-built.md).

## Context

- The architecture fixes what Build, Check and Run do: a builder per task in its own working copy, a fresh checker that never sees the builder's account, scenarios out of the builders' reach, verdicts with evidence, the server merging and the runner starting the checked commit.
- It leaves to the builders how tasks follow each other, which items a check judges, how a run of failed checks ends, and how premise learns per software how to build, start and check it.

## Decision

Each is a builders' choice, open to correction, unless marked as chosen for the owner:

1. **One milestone at a time, behind the line engine's hand-off** (`LaterStages`, [0183](0183-how-the-line-engine-is-built.md)), in `src/build`. Its notes are kept in the database, so a restart in the middle of Build or Check carries on.
2. **Scenarios first.** Entering Build for a milestone queues one checker job that writes scenarios from the record for the items the milestone will be judged on; they are kept in premise's data folder (`scenarios/`), which every builder's session settings deny. The tasks start when it ends. A fix round does not write them again.
3. **Tasks one after another, each from the commit the one before it made.** Each task is one builder job on its own branch. When it ends, premise (not the agent) looks at what it left: at least one new commit, every commit with the trace trailer naming items in the record. If so, the branch is taken into the software's repository on this machine. If not, the task is tried again with what was wrong; the same problem three times (`queue.same_failure_limit`) stops the task.
4. **A task whose builder asked a person waits; the next task goes on** from the latest commit. When the person answers, the waiting task is built again from the latest commit, with the answer in its brief.
5. **Which plan task belongs to which milestone:** the one the planner names; otherwise task 1 to the first milestone, task 2 to the second, and every later task to the last.
6. **What a check judges:** the items the milestone's tasks serve, plus every must item served by a milestone already landed, so nothing that worked is broken unseen. Items planned for a later milestone are not judged yet. When no task names an item, the last milestone is judged on every must item.
7. **What a check's verdicts lead to.** A must item not met, or a finding the checker marks as blocking (a broken security default, a run.md that does not work), sends the change back to the builder as one fix task with the checker's evidence (never its scenarios). Should and could items not met are accepted and reported. An item with no verdict counts as "could not check".
8. **"Could not check" does not hold a change back.** The builder cannot fix what the checker cannot reach; the verdict names what is needed, and the report says so ([0167](0167-premise-adapts-at-runtime-to-the-software.md)).
9. **Chosen for the owner: when an item has failed `line.check_rounds_before_stop` rounds (3), premise stops and asks the operator,** with two answers: give it more rounds, or land it as it is and treat what is wrong as new work.
10. **Chosen for the owner: a task that stopped asks the operator** whether to try the stopped tasks again or to check what was built without them.
11. **Per software, premise works out how to build, start and check it** ([0167](0167-premise-adapts-at-runtime-to-the-software.md)): the planner says what kind of software it is in its own words and how to build, start and check it; the builder writes that into `premise/run.md` (the block the runner reads, and a "How to check" section); the checker follows it and notes corrections, which reach the next builder and checker.
12. **Landing is the server's:** the checked branch is merged into the default branch of the software's repository with the trace of every commit it brings, the record changes builders proposed in this milestone go in, the result is pushed to the second copy when there is one, and the runner starts the merged commit. A software that lands but does not start stays landed; the report and the session say so.
13. **The checker's evidence** is saved in `.premise-evidence/` in its working copy, kept out of every commit, and copied into premise's data folder when the session ends.
14. **The scripted agent's look-around builds a placeholder.** With no script file, a scripted builder writes a one-line program that says it is a trial, and the scripted checker reports every item as "could not check", saying why. Nothing is presented as built.

## Reason

- 2: [0122](0122-scenarios-written-before-the-build.md).
- 3, 4: one chain of commits keeps every task building on the last; checking the result itself keeps an agent's account out of the decision ([0097](0097-reports-from-recorded-facts.md)).
- 6: judging items planned for later would fail every early milestone.
- 8: holding a change on what no agent can fix would stop the line for nothing the builder can act on.
- 9, 10: the specification says work on the item stops and is reported; what happens next is the operator's call, so premise asks rather than deciding.

## Alternatives considered

| Alternative | Why rejected |
| --- | --- |
| Tasks in parallel, each from the milestone's start | Their branches would conflict, and each would miss what the others built. |
| Judge every must item at every milestone | Items planned for later would fail every early check. |
| Treat "could not check" on a must item as not met | The builder cannot fix the checker's reach; the line would loop to its limit. |
| Stop the software outright after the round limit | Leaves the operator no way on but sending it back. |
| A fixed list of kinds of software, each with its own run and check | [0167](0167-premise-adapts-at-runtime-to-the-software.md). |

## Consequences

- The [line engine](../specs/line-engine.md), [page](../specs/page.md), [agent tools](../specs/agent-tools.md) specifications, the [architecture](../architecture/build-check-run.md) and the builder, checker and planner prompts say so.
- The setting `line.check_rounds_before_stop` exists.

## Related

[0030](0030-independent-check.md), [0088](0088-turn-and-time-limits.md), [0089](0089-checker-in-a-fresh-session.md), [0090](0090-scenarios-out-of-the-builders-reach.md), [0093](0093-server-merges-no-pull-requests.md), [0153](0153-confinement-names-the-folders-that-exist-at-start.md), [0186](0186-kept-demos-and-one-real-run.md).
