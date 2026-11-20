# Storage specification

Status: specification. Nothing is built until the owner says to start ([0061](../decisions/0061-nothing-built-until-the-owner-says.md)). Related: [record keeper](record-keeper.md), [work queue](work-queue.md), [agent runner](agent-runner.md), [the record](../architecture/the-record.md), [architecture overview](../architecture/overview.md).

## 1. Purpose

Storage says where everything premise keeps lives, and defines every table of premise's own database once. Other specifications refer to the tables here by name.

premise keeps things in three places:

- **premise's database:** one SQLite file holding premise's own state ([0072](../decisions/0072-sqlite-state.md)).
- **premise's data folder:** a folder in the user's home directory (configurable) holding the database, working copies, transcripts, job logs, check scenarios and evidence, premise's own Claude Code configuration folder ([0076](../decisions/0076-own-claude-code-configuration.md)), and each software's secrets ([0120](../decisions/0120-secrets-stay-out-of-premise.md)).
- **each software's repository on GitHub:** the code, and the lasting record in its `premise/` folder ([0080](../decisions/0080-record-in-the-softwares-repository.md)).

## 2. Responsibilities and non-responsibilities

Responsible for:

- the database schema and its migrations;
- the layout of the data folder;
- the rule for what may go where: nothing about real people in a software's repository ([0081](../decisions/0081-nothing-about-people-in-the-repository.md));
- keeping working records, and refusing to delete them on anyone's word but a person's.

Not responsible for:

- the format of the lasting record ([record keeper](record-keeper.md));
- what is pushed to GitHub and when ([runner](runner.md), [record keeper](record-keeper.md));
- usage and cost figures, which usage-ledger keeps ([0064](../decisions/0064-cost-and-spending-limit-from-usage-ledger.md)).

## 3. Interfaces

Storage is a module inside the one server process ([0067](../decisions/0067-one-process-agents-as-children.md)). Other modules call it with plain function calls.

| Operation | Caller | Inputs | Outputs | Errors |
|---|---|---|---|---|
| Open | Page server at start | Data folder path | An open database, migrated to the current schema | `DATA_FOLDER_UNWRITABLE`, `SCHEMA_NEWER_THAN_PREMISE` |
| Transaction | Any module | A unit of work | Committed or rolled back as one | `BUSY` (retried), `INTERNAL` |
| Working-copy path | Agent runner, runner | Software, job | A fresh folder under `work/` | `DATA_FOLDER_UNWRITABLE` |
| Evidence path | Agent runner (checker), runner | Software, check job | A folder under `evidence/` | as above |
| Delete working record | Page server only, on a person's request in the session | Path or job | Deleted, and an event naming who asked | `NOT_A_PERSON` when the request does not come from the page |

## 4. Data owned

### 4.1 The data folder

| Path in the data folder | Holds | Who reads it |
|---|---|---|
| `premise.db` | The database (4.2) | The server only |
| `claude-config/` | premise's own Claude Code configuration folder, logged in once by the owner ([0076](../decisions/0076-own-claude-code-configuration.md)) | Claude Code, started by the agent runner |
| `work/<software>/<job>/` | One working copy per agent session ([0086](../decisions/0086-working-copy-and-branch-per-change.md)) | The one agent confined to it |
| `transcripts/<software>/<session>.jsonl` | Each agent session's streamed events | The server; people through the page |
| `logs/<software>/` | Job logs, and the running software's logs ([runner](runner.md)) | The server |
| `scenarios/<software>/` | The checker's scenarios ([0090](../decisions/0090-scenarios-out-of-the-builders-reach.md)) | Checker sessions only |
| `evidence/<software>/<check>/` | Screenshots, command output and logs behind each verdict | The server; people through the page |
| `plans/<software>/` | Working plans written by the planner | The server; builders get their own task only |
| `secrets/<software>/` | The software's secrets file, filled in by a person ([0120](../decisions/0120-secrets-stay-out-of-premise.md)) | The runner, when it starts the software |
| `scratch/` | Temporary folders for agents | The agent that owns each one |

Every agent's reads of the data folder are denied, except its own working copy and scratch folder, and the checker's own scenarios ([0087](../decisions/0087-agents-run-confined.md)).

### 4.2 Tables

All tables live in `premise.db`. Times are UTC. "Software" is a row in `softwares`.

| Table | One row per | Main columns |
|---|---|---|
| `softwares` | Software premise looks after | id, name, repository, size class ([0117](../decisions/0117-size-classes-set-stage-budgets.md)), current stage, state (active, paused-budget, paused-usage, ended), created |
| `page_tokens` | Session link issued | token hash, created, revoked |
| `feedback_links` | Software with a feedback page | software, token hash, created, revoked ([0119](../decisions/0119-feedback-page-has-its-own-link.md)) |
| `stage_runs` | Stage entered for a software | software, stage, entered, exited, exit reason, budget (turns, minutes), used |
| `chat_messages` | Message said in the session | software, text, routed to (draft, intake, reporter), linked ask or intake item, time |
| `asks` | Thing asked in the session | id, software, role label, kind (question, draft, say-back, proposal, approval, needed), items, waiting job, status (open, answered, withdrawn), answer, asked, answered |
| `drafts` | Stage draft shown for correction | software, stage, items with marks (assumed or from a role), per-item state (kept, struck, edited, open), status |
| `claims` | Area claimed for taste | software, role label, area in its own words, status (open, released) |
| `jobs` | Unit of work in the queue ([work queue](work-queue.md)) | id, software, kind, stage, record items served, payload, status, attempts, failure signature, waiting ask, result, created, started, finished |
| `agent_sessions` | Agent session started | id, job, agent role, tier, model alias, runtime session id, working copy, tool token hash, started, ended, end reason, turns |
| `record_changes` | Proposed change to a lasting record | software, proposing session, operations, status (proposed, rejected, reviewing, at-say-back, accepted, committed), diagnostics, review, commit |
| `reviews` | Reviewer verdict | record change or foundation decision, consistent or conflicting, conflicting item, agree or object, reasons |
| `verdicts` | Item judged by a check | check job, commit, item, verdict (met, not-met, could-not-check), evidence paths, round |
| `intake_items` | Item taken in | software, number (`I-n`), source, sender reference, text, received, kind, items touched, size, touches floor, route, status (taken, held, done, closed), joined to, reading |
| `readings` | Reading of held items | software, trigger (count, time, operator), items read, short list, created |
| `gate_requests` | Floor action requested | id, software, floor kind, exactly what will happen, why, requested by, role asked, status (asked, approved, refused, done, failed), approval used, outcome |
| `approvals` | Approval given in the session | software, scope (one action, or a named kind of action), kind, given, withdrawn |
| `runs` | Start of a checked commit | software, commit, how opened (link, command, program), state, restarts, started, stopped |
| `reports` | Report written | software, trigger (change reached running, asked, line ended), lines with evidence links, created |
| `events` | Anything that happened | time, software, module, kind, reference; append-only; feeds the page's event stream and every report |
| `settings` | Configuration value changed from its default | key, value, changed |

Every job, ask, gate request and verdict also writes an `events` row, so that a report can always point at a recorded fact ([0097](../decisions/0097-reports-from-recorded-facts.md)).

### 4.3 In each software's repository

- The code, built by the builder on a branch per change and merged by the server ([0093](../decisions/0093-server-merges-no-pull-requests.md)).
- `premise/`: why.md, who.md, exists.md, what.md, taste.md, decisions.md, run.md, written only by the [record keeper](record-keeper.md), and for existing software `recovered-trace.md` ([0121](../decisions/0121-recovered-trace-file.md)).
- What the software's users read, written by the builder.
- `RELEASE-NOTES.md`, written by the server from the reporter's drafts ([runner](runner.md)).
- Nothing about real people: no transcripts, no names, no intake text. The record names roles, not people ([0081](../decisions/0081-nothing-about-people-in-the-repository.md)). Intake items are cited only as `I-n`.

## 5. Behaviour

- **Transactions.** Every change that must survive a crash commits in one transaction: a job's status change with its event, an ask with the job it holds, a gate request with its approval. The work queue resumes from these rows after a restart.
- **Working records are kept, not maintained** ([0025](../decisions/0025-two-kinds-of-record.md)). Transcripts, plans, job logs and evidence are written once and never edited.
- **Deleting is losing data.** No module deletes a working record on its own. A person deletes them from the page, one at a time, and the deletion is an event. Working copies of finished jobs are the one exception: they are copies of what is on GitHub or on a branch premise keeps, and the work queue removes them when their job ends, unless the branch holds unmerged work.
- **Schema changes.** Each premise version carries numbered migrations. The database is copied to `premise.db.bak-<version>` before a migration runs (the same rule premise applies to the softwares it builds, [0092](../decisions/0092-security-defaults.md)).

## 6. Configuration

| Key | Default | Meaning |
|---|---|---|
| `data.folder` | `.premise` in the user's home directory | Where the data folder is |
| `data.keep_finished_working_copies` | false | Keep working copies after their job ends, for inspection |

## 7. Limits

- One server process writes the database ([0067](../decisions/0067-one-process-agents-as-children.md)); SQLite runs in write-ahead mode so the page can read while the server writes.
- The data folder lives on the owner's machine. Its size is not capped; the page shows its size, so a person can decide what to delete.

## 8. Failure modes and recovery

| Failure | Detection | Effect | Recovery |
|---|---|---|---|
| Server stops mid-job | Rows in `jobs` still running at start | None lost | The work queue resumes or restarts the job ([work queue](work-queue.md)) |
| Database file damaged | Integrity check at start | premise does not start | It names the problem and the most recent backup; a person restores it |
| Disk full | Write fails | The job fails with its reason | Reported under "Needed": a person frees space |
| Migration fails | Error during start | premise does not start | The backup copy is left in place and named |

## 9. Security considerations

- The data folder holds transcripts that may say things about people. It never leaves the owner's machine, and agents cannot read it ([0087](../decisions/0087-agents-run-confined.md)).
- Token values are never stored, only their hashes.
- Secrets for a software are written by a person into its secrets file; premise stores no secret values in the database ([0120](../decisions/0120-secrets-stay-out-of-premise.md)).
- The GitHub login and Claude Code's login stay where their tools keep them; premise's database holds neither ([0077](../decisions/0077-github-through-existing-cli-login.md)).

## 10. Observability

- The `events` table is the single history of what happened. Reports and the page read it.
- The page shows the data folder's size and the database's schema version.

## 11. Milestones

- Milestone 1: the database, the data folder, every table above except `feedback_links`, `claims`, `readings` and `approvals` of a kind (one-action approvals are in milestone 1, since the gate is).
- Milestone 3: `claims` and approvals for a kind of action.
- Milestone 4: `feedback_links`, `readings`, and every intake source.
- Milestone 6: `recovered-trace.md` in the software's repository.
- Milestone 7: several active softwares at once share the same tables; nothing new is needed.
- Usage and cost figures are never stored here; they come from usage-ledger once it is usable (milestone 2, [0064](../decisions/0064-cost-and-spending-limit-from-usage-ledger.md)).
