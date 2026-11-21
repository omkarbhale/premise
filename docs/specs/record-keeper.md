# Record keeper specification

Status: specification, being built ([0130](../decisions/0130-the-build-starts-and-covers-all-of-premise.md)). Related: [the record](../architecture/the-record.md), [agent tools](agent-tools.md), [line engine](line-engine.md), [runner](runner.md), [storage](storage.md).

## 1. Purpose

The record keeper is the only writer of each software's lasting record. It checks every proposed change for format, IDs and references, sends it for the contradiction check, and writes it into the software's `premise/` folder in the same commit as the work it belongs to. It also enforces the trace trailer on every commit premise pushes.

Lasting records are kept current by the product as part of every change ([0025](../decisions/0025-two-kinds-of-record.md)). Every built piece traces to the intent behind it ([0013](../decisions/0013-mismatch-of-intent-is-the-mistake-that-matters.md)).

## 2. Responsibilities and non-responsibilities

Responsible for:

- parsing every record file on every change;
- refusing malformed lines, duplicate IDs and references to missing IDs;
- giving new items their IDs, and handling `replaces:` and strike-through;
- sending each change to the reviewer for the contradiction check ([0113](../decisions/0113-agent-roles.md));
- sending replacements of purpose and foundation items to the say-back;
- writing accepted changes into `premise/` and committing them;
- refusing any push whose commits lack a valid `Premise-Trace` trailer ([0083](../decisions/0083-trace-trailer-on-every-commit.md)).

Not responsible for:

- deciding what is true about the software: people and agents propose, the reviewer and the say-back judge;
- pushing ([runner](runner.md) and the server's GitHub client do that);
- working records (plans, transcripts), which are not maintained ([0025](../decisions/0025-two-kinds-of-record.md));
- a description of what exists, which is never maintained and is written from the code when someone needs it ([0026](../decisions/0026-no-maintained-description-of-what-exists.md)).

## 3. Interfaces

| Operation | Caller | Inputs | Outputs | Errors |
|---|---|---|---|---|
| Propose change | [Agent tools](agent-tools.md) (`record_propose`), line engine (from a closed draft) | Software, proposing session or stage, operations (add, replace, strike), reason | Change id and status: `rejected`, `reviewing`, `at-say-back`, `accepted`; diagnostics | `MALFORMED`, `UNKNOWN_ITEM`, `CONFLICT`, `NOT_ALLOWED` |
| Apply review | Line engine, when a `review_submit` arrives | Change id, review | New status | none |
| Write and commit | Line engine, when a change is accepted | Change id, working copy, items it serves | A commit in the working copy, with the trailer | `MALFORMED` (file changed under it) |
| Read | [Agent tools](agent-tools.md) (`record_read`), page, reporter | Software, IDs or files, commit | Parsed items | `UNKNOWN_ITEM` |
| Check trailers | Server, before every push | Commits to push | Pass, or the commits that fail and why | none |

## 4. Data owned

- The `premise/` folder in each software's repository ([0080](../decisions/0080-record-in-the-softwares-repository.md)).
- The `record_changes` and `reviews` tables ([storage](storage.md)).

### 4.1 Files

| File | Holds | IDs |
|---|---|---|
| `why.md` | The problem, and why to build | `Y-n` |
| `who.md` | Who the software is for, and the roles it needs | `U-n` users, `R-n` roles |
| `exists.md` | What already exists, with sources, and the outcome: do not build, build on something, or build something different | `E-n` |
| `what.md` | What it must do, each with priority must, should or could | `W-n` |
| `taste.md` | What people said about areas they claimed | `T-n` |
| `decisions.md` | Decisions, with reasons and rejected alternatives | `D-n` |
| `run.md` | How to build, start and open the software | none |
| `recovered-trace.md` | For existing software only: best-guess links from old code to items, each marked as a guess ([0121](../decisions/0121-recovered-trace-file.md)) | none |

### 4.2 Line format

The record is Markdown, one item per list line, each with a stable ID ([0082](../decisions/0082-record-as-markdown-with-ids.md)). It is lists ([0029](../decisions/0029-lists-over-long-paragraphs.md)).

- `- [W-7] People can export their list as a CSV file. (must; from: operator; 2026-11-21)`
- The parentheses hold, in order: priority (W items only), `from:`, and the date.
- `from:` is a role from `who.md`, or `assumed` for an assumption of premise's that nobody struck, or `recovered` for an item rebuilt from existing software.
- A changed item gets a new ID and `replaces: W-3`. The old line stays, struck through, with the reason.
- A dropped item is struck through with its reason, not deleted, so rejected alternatives stay ([0025](../decisions/0025-two-kinds-of-record.md)).
- A `D` item states the decision, its reason, and the alternative rejected, and is marked `foundation` when it is one (language, framework, storage, how it runs, data model, who can get in).
- The record names roles, never people ([0081](../decisions/0081-nothing-about-people-in-the-repository.md)). Intake is cited only as `I-n`.

## 5. Behaviour

### 5.1 Checking a proposed change

1. Parse every file of the record, with the change applied, in memory.
2. Reject the change if any line is malformed, any ID is duplicated, or any `replaces:` or reference names an ID that does not exist. The diagnostics name the line and what is wrong.
3. Reject an operation outside the proposer's agent role: a builder may only add `D` items ([agent tools](agent-tools.md)).
4. Give every new item the next free ID in its file. IDs are never reused.
5. Send the change to the reviewer, an agent that compares it with the whole record ([0014](../decisions/0014-guard-against-further-big-mistakes.md), [0113](../decisions/0113-agent-roles.md)). Status `reviewing`.

### 5.2 Silent contradiction

- A conflicting change must name the item it replaces. Two live items never disagree.
- When the reviewer finds a conflict the change did not name, the change is rejected with `CONFLICT`, naming the live item.
- A change that replaces an item about purpose (`Y`, `U`, or a must `W`) or a foundation decision goes to the say-back ([line engine](line-engine.md)). Status `at-say-back`. It is written only if the say-back passes.
- Anything else that is consistent is accepted.

### 5.3 Writing

- An accepted change is written into `premise/` in the working copy of the job it belongs to, in the same commit as the code it goes with, so the record cannot fall behind ([0080](../decisions/0080-record-in-the-softwares-repository.md)).
- A change with no code (a stage's draft once its exit holds, a decision from the planner) is committed on its own, with its own trailer.
- The commit carries `Premise-Trace:` naming the items it adds or replaces, plus `I-n` when the change came from intake.

### 5.4 Trailers

- Every commit premise makes carries a trailer naming what it serves: `Premise-Trace: W-7, D-3`, plus `I-12` when the work came from intake ([0083](../decisions/0083-trace-trailer-on-every-commit.md)).
- Before every push, the server asks the record keeper to check every commit being pushed. A commit without the trailer, or with an ID that does not exist in the record at that commit, fails the push. The job goes back to the builder with the reason.
- From any line of code, `git blame` leads to a commit and its items; from any item, to every commit that names it. That tells a wrong record apart from a drifted build ([0013](../decisions/0013-mismatch-of-intent-is-the-mistake-that-matters.md)).

### 5.5 Existing software

- The drafter's recovered items are written with `from: recovered` and stay unconfirmed until the say-back over the whole recovered record passes ([0019](../decisions/0019-existing-software-through-the-same-line.md)).
- When it passes, each surviving item's marks gain `confirmed` and the date; its ID does not change, because its content did not.
- Old code gets best-guess links in `recovered-trace.md`, marked as guesses ([0121](../decisions/0121-recovered-trace-file.md)). From then on every commit traces to items by its trailer.

## 6. Configuration

| Key | Default | Meaning |
|---|---|---|
| `record.folder` | `premise` | Folder name at the repository root |
| `record.trailer` | `Premise-Trace` | Commit trailer name |

The record format is not configurable per software; it stays with premise ([0106](../decisions/0106-per-software-and-with-premise.md)).

## 7. Limits

- A record file is parsed whole on every change. A record large enough to make this slow is not expected in any milestone; if it happens, the parse is cached per commit.
- The reviewer's check costs one agent session per change. Changes from one stage draft are reviewed together as one change.

## 8. Failure modes and recovery

| Failure | Detection | Effect | Recovery |
|---|---|---|---|
| Malformed proposal | Parse | `MALFORMED` to the proposer | The agent fixes it; the same failure three times stops the task ([0088](../decisions/0088-turn-and-time-limits.md)) |
| Someone edits `premise/` by hand on GitHub | Parse of the pulled default branch fails, or IDs change | The software is paused at its current stage | Listed under "Needed" for the operator, naming the file and the lines; a valid hand edit is accepted as a change from that role, and goes through the reviewer |
| Reviewer session fails | Job failure | The change waits | The job is retried; then reported |
| A push carries a commit without a trailer | Trailer check | The push is refused | The job returns to the builder with the reason |

## 9. Security considerations

- Agents cannot write the record. They hold no push rights and propose only through `record_propose` ([0073](../decisions/0073-mcp-tools-with-session-tokens.md)).
- Nothing about real people enters the repository, which must be safe to make public, since visibility is not premise's to enforce ([0059](../decisions/0059-repository-visibility-per-software.md), [0081](../decisions/0081-nothing-about-people-in-the-repository.md)).

## 10. Observability

- Every proposal, rejection, review and write is an event, with its diagnostics.
- The page's record view shows each item with its marks, what it replaced, and the commits that name it.
- Reports count changes accepted, rejected for conflict, and sent to the say-back.

## 11. Milestones

- Milestone 1 step 2: everything above except `recovered-trace.md`; the `from:` values used are `operator` and `assumed`.
- Milestone 3: `from:` names every role; `taste.md` is filled from claims ([0102](../decisions/0102-taste-proposals-before-building.md)).
- Milestone 4: `I-n` in trailers for work from every intake source.
- Milestone 6: recovered items, confirmation by say-back, and `recovered-trace.md`.
