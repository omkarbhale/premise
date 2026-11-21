# Storage specification

Status: built through schema 10, specification otherwise, being built ([0130](../decisions/0130-the-build-starts-and-covers-all-of-premise.md)). Related: [record keeper](record-keeper.md), [work queue](work-queue.md), [agent runner](agent-runner.md), [the record](../architecture/the-record.md), [architecture overview](../architecture/overview.md).

## 1. Purpose

Storage says where everything premise keeps lives, and defines every table of premise's own database once. Other specifications refer to the tables here by name.

premise keeps things in three places:

- **premise's database:** one SQLite file holding premise's own state ([0072](../decisions/0072-sqlite-state.md)).
- **premise's data folder:** a folder in the user's home directory (configurable) holding the database, working copies, transcripts, job logs, check scenarios and evidence, a Claude Code configuration folder if the settings name one there ([0140](../decisions/0140-the-owners-existing-claude-code-login.md)), and each software's secrets ([0120](../decisions/0120-secrets-stay-out-of-premise.md)).
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
| `config.json` | premise's settings ([0146](../decisions/0146-configuration-in-one-json-file.md), [configuration reference](../reference/configuration.md)) | The server at start |
| `claude-config/` | Only if the settings point `agents.claude_config_folder` here; by default premise uses the owner's existing Claude Code login ([0140](../decisions/0140-the-owners-existing-claude-code-login.md)) | Claude Code, started by the agent runner |
| `repos/<software>/` | The software's own repository on this machine, with its `premise/` record ([record keeper](record-keeper.md)) | The server only |
| `work/<software>/<job>/` | One working copy per agent session ([0086](../decisions/0086-working-copy-and-branch-per-change.md)), cloned from `repos/<software>/` | The one agent confined to it |
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
| `softwares` | Software premise looks after | id, name, repository, size class ([0117](../decisions/0117-size-classes-set-stage-budgets.md)), current stage, state (active, paused-budget, paused-usage, waiting-milestone, ended), priority (1 most important to 5, [0138](../decisions/0138-priority-is-a-field-from-milestone-1.md)), milestone waits on or off, effort (low, medium, high; schema 9, [0191](../decisions/0191-scope-check-effort-and-milestones.md)), created |
| `page_tokens` | Session link issued | token hash, created, revoked |
| `feedback_links` | Software with a feedback page | software, token hash, created, revoked ([0119](../decisions/0119-feedback-page-has-its-own-link.md)) |
| `work_items` | Piece of work going through the line (schema 5; sizing in schema 6) | id, software, parent item, kind (software, milestone, module, intake), origin (start, split, plan, fix, intake, purpose, existing, recover, and for intake work bug or change, [0192](../decisions/0192-effort-in-proportion-to-what-was-asked.md)), title and words of a part, the record item it stands for (a milestone's `M-n`), order among its siblings, size class, current stage, state, its list of stages, its sizing with a reason for the size, the stages and the split, the sizer's pending answer, when it was made, sized, reached Build and finished, the line engine's notes ([0181](../decisions/0181-the-line-works-on-work-items.md), [0184](../decisions/0184-how-sizing-of-work-is-built.md)) |
| `stage_runs` | Stage entered for a work item | work item, software, stage, entered, exited, exit reason, budget (turns, minutes), used |
| `chat_messages` | Message said in the session | software, text, routed to (draft, intake, reporter), linked ask or intake item, time |
| `asks` | Thing asked in the session | id, software, role label, kind (question, draft, say-back, proposal, approval, needed), items, waiting job, status (open, answered, withdrawn), answer, asked, answered |
| `drafts` | Not a table: a stage draft is an ask of kind `draft`, with its items and their per-item states kept with the ask ([0183](../decisions/0183-how-the-line-engine-is-built.md)) | |
| `claims` | Area claimed for taste | software, role label, area in its own words, status (open, released) |
| `jobs` | Unit of work in the queue ([work queue](work-queue.md)) | id, software, kind, stage, record items served, payload, status, attempts, failure signature, waiting ask, result, created, started, finished |
| `agent_sessions` | Agent session started | id, job, agent role, tier, model alias, runtime session id, working copy, started, ended, end reason, turns. The tool token is never stored ([0150](../decisions/0150-agent-tools-over-plain-http-mcp-tokens-in-memory.md)) |
| `record_changes` | Proposed change to a lasting record | software, proposing session, reason, operations, status (rejected, reviewing, at-say-back, accepted, committed), diagnostics, the files it would write and a hash of each file it was checked against, items touched, items for the say-back, review, commit |
| `reviews` | Reviewer verdict | record change or foundation decision, consistent or conflicting, conflicting item, agree or object, reasons |
| `verdicts` | Item judged by a check | check job, commit, item, verdict (met, not-met, could-not-check), evidence paths, round |
| `intake_items` | Item taken in (schema 7) | software, number (`I-n`), source (session, page, premise, github, feedback), sender role, text, received, kind, items touched each with a reason, size, touches floor, whether it changes what the software must do (schema 9, [0192](../decisions/0192-effort-in-proportion-to-what-was-asked.md)), route, who routed it (triager, default, operator) and why, status (taken, triaging, asked, held, read, waiting, working, running, answered, merged, closed, dropped), joined to, answer, triage job, ask, work item, reading, when it was triaged, its change was running, and it finished ([0185](../decisions/0185-how-intake-in-a-thin-form-is-built.md)) |
| `readings` | Reading of held items (schema 7) | software, trigger (count, time, operator), items read, short list, status, job, ask, created, finished |
| `existing_softwares` | A software taken on from existing code (schema 8) | software, where it came from as given and whether a folder or a clone address, status (copying, copy-failed, recovering, taken-on, stopped), what went wrong, the branch and commit copied, how many commits, how to build, start and check it as recovered, what premise could not check, and its record in the operator's repository (not yet, asked, added, refused, failed) with the gate request and a note ([0189](../decisions/0189-how-taking-on-existing-software-is-built.md)) |
| `gate_requests` | Floor action requested | id, software, floor kind, exactly what will happen, why, requested by, role asked, status (asked, approved, refused, done, failed), approval used, outcome |
| `approvals` | Approval given in the session | software, scope (one action, or a named kind of action), kind, given, withdrawn |
| `runs` | Start of a checked commit | software, commit, how opened (link, command, program), state, restarts, started, stopped |
| `reports` | Report written | software, trigger (change reached running, asked, line ended), lines with evidence links, created |
| `page_presence` | Stretch of time a page was in front of someone (schema 10) | started, last seen, ended; written by the page's beats, never as events ([measures](measures.md)) |
| `asks_shown` | Question first shown on a page (schema 10) | ask, when ([measures](measures.md)) |
| `corrections` | Correction a person made to premise's work (schema 10) | software, kind (strike, edit, reject-draft, send-back, decline-gate, undo-split, bug-after-met), the event it came from, what happened, what the person said, items touched, status (reading, read), the kind of mistake, destination (software, taste, premise, none), why, the proposed line, topic, who decided (agent, rule, operator), the reading job ([learning](learning.md)) |
| `lessons` | Line learned from one correction (schema 10) | correction, software, destination (software, taste, premise), topic, text, state (live, deleted, dropped), times used and when last, created, edited, ended and why ([learning](learning.md)) |
| `learning_cursor` | One row: the last event learning looked at (schema 10) | last event |
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
- **Schema changes.** Each premise version carries numbered migrations. Tables arrive with the module that owns them ([0147](../decisions/0147-sqlite-through-nodes-built-in-module.md)); the database is opened with Node.js's built-in SQLite module. The database is copied to `premise.db.bak-<version>` before a migration runs (the same rule premise applies to the softwares it builds, [0092](../decisions/0092-security-defaults.md)).

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

- Milestone 1: the database, the data folder, every table above except `feedback_links`, `claims`, `intake_items`, `readings` and `drafts` (drafts are asks, [0183](../decisions/0183-how-the-line-engine-is-built.md)). Approvals for a kind of action are in milestone 1, since the gate is ([0182](../decisions/0182-how-the-gate-is-built.md)). `asks` and `chat_messages` arrived with the page server in schema 2, and schema 2 also keeps each software's first words (`softwares.idea`). Schema 5 added `work_items`, `work_item_id` on `stage_runs`, `gate_requests` and `approvals`; the line engine replaced the stand-in line that wrote asks before ([0154](../decisions/0154-a-stand-in-line-until-the-line-engine-exists.md), [0183](../decisions/0183-how-the-line-engine-is-built.md)). Schema 6 added each work item's sizing, its parts' titles and order, and when it reached Build ([0184](../decisions/0184-how-sizing-of-work-is-built.md)).
- Milestone 4, first part (intake in a thin form): schema 7 added `intake_items` and `readings` ([0185](../decisions/0185-how-intake-in-a-thin-form-is-built.md)).
- Milestone 6, first part (existing software in a thin form): schema 8 added `existing_softwares`; `work_items.origin` also takes `existing` and `recover`; `premise/recovered-trace.md` is written in the software's repository ([0189](../decisions/0189-how-taking-on-existing-software-is-built.md)).
- Schema 9 added each software's effort and whether an intake item changes what the software must do ([0191](../decisions/0191-scope-check-effort-and-milestones.md), [0192](../decisions/0192-effort-in-proportion-to-what-was-asked.md)).
- Schema 10 added the measures and learning tables: `page_presence`, `asks_shown`, `corrections`, `lessons` and `learning_cursor` ([0193](../decisions/0193-how-the-measures-are-built.md), [0194](../decisions/0194-how-learning-from-corrections-is-built.md)).
- Milestone 3: `claims`.
- Milestone 4, the rest: `feedback_links`, and every intake source.
- Milestone 6: `recovered-trace.md` in the software's repository.
- Milestone 7: several active softwares at once share the same tables; nothing new is needed.
- Usage and cost figures are never stored here; they come from usage-ledger once it is usable (milestone 2, [0064](../decisions/0064-cost-and-spending-limit-from-usage-ledger.md)).
