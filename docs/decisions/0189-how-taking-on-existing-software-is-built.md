# 0189. How taking on existing software is built: a copy, a recovery job, one strike-out pass, a gated branch

- Status: Accepted
- Scope: Making premise
- Date: 2026-11-21
- Decided by: The builders, while building existing software in a thin form. Points 14 and 15 are chosen for the owner, open to correction. The owner did not make these choices.
- Source: [the line](../architecture/the-line.md) "Existing software", [line engine](../specs/line-engine.md) 5.10, [0018](0018-existing-software-and-automatic-intake.md), [0019](0019-existing-software-through-the-same-line.md), [0023](0023-looking-at-what-exists.md), [0121](0121-recovered-trace-file.md), [0167](0167-premise-adapts-at-runtime-to-the-software.md), [0171](0171-existing-software-much-earlier-in-a-thin-form.md), [0188](0188-existing-softwares-record-and-hand-edits.md), the drafter's [recovery brief](../prompts/drafter.md), the roadmap's "existing software, in a thin form".

## Context

- The plan says what taking on existing software does: the record drafted from the code, its documentation, its history and its issues, every item recovered and unconfirmed until a say-back over the whole record passes, conflicts and gaps asked of the role they are for, a look at what exists now, and changes from then on as intake. The owner settled where the record goes and that hand edits stay later ([0188](0188-existing-softwares-record-and-hand-edits.md)).
- The plan leaves to the builders how the software gets into premise, how the line runs for it, how a long recovered record is said back, and how the record reaches the operator's repository.

## Decision

Each is a builders' choice, open to correction, unless marked as chosen for the owner:

1. **Its own module, `src/existing`:** where a software comes from (`source.ts`), what premise keeps about it (`store.ts`, the table `existing_softwares`, schema 8), and reading what the drafter recovered (`recovery.ts`). The line engine runs it as a piece of work like any other.
2. **Where it comes from:** a folder on this machine given by its full path (or `~/`), which is a git repository with at least one commit, or a clone address (`https://`, `ssh://`, `git://`, `file://`, or `user@host:path`). A relative path, a folder that is not a repository, and premise's own data folder are refused with what to give instead.
3. **premise works on its own copy:** it clones the repository into its data folder (`repos/<software>`), with the operator's repository as the remote `source`. Cloning uses the owner's own git setup, never asks for a password and runs no hooks; it has a time limit (`existing.clone_timeout_minutes`). The operator's folder is only read. A copy cut off when premise stops is made again from the start when it starts.
4. **The line for an existing software** is the root piece of origin `existing`, through Why (shown as "Recover"), What exists, Say back and Intake. Why, Say back and Intake are always needed; the sizer may leave out What exists. Nothing is built while taking it on; the steps it skips say so on the Line tab.
5. **Large repositories:** the sizer may split the recovery into completely separate parts, under the same splitting rule ([0170](0170-what-may-be-split-is-decided-by-strong-prompting.md)). Each part's record is recovered at Why in turn; no check of the whole follows, since nothing is built; then one say-back covers everything recovered.
6. **Recovery is its own type of task, `recover`,** done by the drafter at the strongest tier, with its own model, effort and limits (`agents.tasks.recover.*`) and its own budget per size (`line.budgets.recover.*`), larger than a Why draft because it reads code.
7. **The drafter submits once with `recovery_submit`;** premise uses the last submission when the job ends, like sizing. Items go into the record at once, `from: recovered`, unconfirmed. An item the drafter marks assumed starts "Guess:", because an item has one `from`. A decision whose reason or rejected alternative the code does not show gets "not known from the code", because the record's format needs both.
8. **The material:** the drafter reads a read-only copy of premise's clone. The latest commits' first lines are in its brief (`existing.history_commits`). Issues are not read in the thin form, and the brief says so.
9. **How to build, start and check it** go into `run.md`, written by premise from what the drafter found, with the runner's block where the drafter could write one. "Could not check" names what is needed: what the drafter could not tell or premise does not have, a missing or unusable start block, and a missing way to check. premise does not start the software while taking it on; the Run stage starts it with the first change ([0167](0167-premise-adapts-at-runtime-to-the-software.md)).
10. **Best-guess links** go into `recovered-trace.md` ([0121](0121-recovered-trace-file.md)): one line per file of the old code, with the items it is guessed to serve, marked guesses. Lines are added, never removed, in the thin form.
11. **A conflict or gap** is the drafter's question under the role it is for. Its answer is taken in as an intake item, so a correction goes through the line like any other.
12. **The say-back of the recovered record is made by premise, not an agent:** every live recovered item nobody confirmed, grouped by record file, in pages of twelve on the page, answered once. Items can be kept or struck, not edited; kept items get the `confirmed` mark and struck ones are struck with the reason. No stage is redone for a struck item. What is missing or half right comes in afterwards as intake, and the card says so.
13. **What exists now** is the researcher's smaller look with scope "since". Its outcomes are "Keep it as it is", "Use what exists for part of it" and "Stop: it is no longer needed"; stopping ends the software and changes nothing anywhere.
14. **Chosen for the owner: the record reaches the operator's repository on a branch of its own,** `premise` (`existing.record_branch`), never the branch the operator works on. The operator merges it when they want. The push is never forced; a branch that has moved on, or is checked out in the operator's folder, refuses, and premise says what to do.
15. **Chosen for the owner: a repository that already tracks a `premise/` folder is not taken on** in the thin form; premise says to rename or remove it. Picking up an existing premise record is later.
16. **The push goes through the gate as `publish`,** asked after the say-back passes, while the line goes on to Intake. Declined, the record stays in premise's copy and the page offers it again. After a change reaches running, premise asks to push it to the same branch; approving the kind for the software stops further questions. The gate's fixed card speaks of "an outside service", which reads oddly for a folder on this machine; the action line says exactly what happens, and a floor kind of its own for adding to the operator's repository is left for later.

## Reason

- 2, 3: the operator's working folder is never changed ([0188](0188-existing-softwares-record-and-hand-edits.md)); a clone keeps the history premise reads and trace trailers rest on.
- 4, 5, 12: the thin form recovers, strikes and takes intake ([0171](0171-existing-software-much-earlier-in-a-thin-form.md)); one pass a person can finish spends the least attention ([0027](0027-spend-least-of-peoples-attention.md)), and paging keeps a long list readable without splitting the decision.
- 6: the owner asked for model and effort per type of task ([0132](0132-sensible-things-are-configurable.md)).
- 7, 10: the record keeper's checks hold for recovered items as for any other ([0082](0082-record-as-markdown-with-ids.md)).
- 9: where premise cannot operate a software it says "could not check" and names what is needed ([0167](0167-premise-adapts-at-runtime-to-the-software.md)); starting it is the Run stage's.
- 11: corrections come in as intake ([0171](0171-existing-software-much-earlier-in-a-thin-form.md)).
- 14: a branch of its own never touches what the operator works on, and git refuses to push into a checked-out branch anyway.
- 15: taking over a folder premise did not write could overwrite what is in it.
- 16: adding to the operator's repository acts in their name ([0100](0100-floor-actions.md)); the gate's approvals for a kind already cover "from now on".

## Alternatives considered

| Alternative | Why rejected |
| --- | --- |
| Work in the operator's folder | It must never be changed ([0188](0188-existing-softwares-record-and-hand-edits.md)). |
| A new stage "Recover" on the line | Every view, budget and send-back knows the eleven stages; Why already holds what the recovery starts with. |
| A drafter job for the say-back, at most ten items | The whole recovered record must be said back; picking ten would leave the rest unconfirmed. |
| Edit recovered items in the say-back | A say-back only strikes ([0028](0028-say-back-as-assumptions-to-strike.md)); corrections come in as intake. |
| Push the record to the operator's default branch | It touches what they work on, and fails for a checked-out branch. |
| Read GitHub issues now | Needs the network and the owner's login; later, with intake from GitHub. |
| Start the software during the take-on | Running is the Run stage's; a "could not check" from reading is honest and cheap. |

## Consequences

- New settings: `existing.record_branch`, `existing.history_commits`, `existing.clone_timeout_minutes`, `agents.tasks.recover.*`, `line.budgets.recover.*`.
- New tool `recovery_submit`; new page form "Bring in software you already have" and a take-on panel; schema 8.
- The [line engine](../specs/line-engine.md), [record keeper](../specs/record-keeper.md), [storage](../specs/storage.md), [agent tools](../specs/agent-tools.md), [work queue](../specs/work-queue.md) and [page](../specs/page.md) specifications say what is built.

## Related

[0019](0019-existing-software-through-the-same-line.md), [0121](0121-recovered-trace-file.md), [0167](0167-premise-adapts-at-runtime-to-the-software.md), [0171](0171-existing-software-much-earlier-in-a-thin-form.md), [0184](0184-how-sizing-of-work-is-built.md), [0185](0185-how-intake-in-a-thin-form-is-built.md), [0188](0188-existing-softwares-record-and-hand-edits.md).
