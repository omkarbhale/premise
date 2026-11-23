# Agent tools specification

Status: built in `src/agents/tool-server.ts`, served at `POST /mcp` ([0150](../decisions/0150-agent-tools-over-plain-http-mcp-tokens-in-memory.md)). `progress`, `task_finish`, `draft_submit`, `proposal_submit`, `record_read`, `record_propose`, `ask`, `gate_request`, `review_submit`, `sizing_submit`, `recovery_submit`, `scenario_write`, `verdict_submit`, `triage_submit`, `lesson_submit` and `reading_submit` are served by the real modules (the line engine, the record keeper, the gate, Build and Check in `src/build`, intake, learning), set with `setHandlers`. `facts_read` and `report_submit` still check and record every call but their modules are not built yet, so they answer that nothing more comes of it ([0152](../decisions/0152-tools-of-unbuilt-modules-record-and-say-so.md)). Related: [agent runner](agent-runner.md), [record keeper](record-keeper.md), [gate](gate.md), [line engine](line-engine.md), [prompts](../prompts/README.md), [skills](../skills/README.md).

## 1. Purpose

Agents reach premise only through tools the server serves to each session ([0073](../decisions/0073-mcp-tools-with-session-tokens.md)). This specification is the catalog: every tool, which agent roles get it, its inputs, outputs and errors. The prompts use exactly these names.

The tools are the whole of an agent's access to premise. Through them an agent can read the record, propose a record change, ask a person, request a gated action and report progress. It cannot write the record, push, or reach another session's tools.

## 2. Responsibilities and non-responsibilities

Responsible for:

- serving each session its role's tools over MCP, bound to one session token;
- checking every call against the session's role, software and job;
- recording every call as an event;
- handing each call to the module that owns it.

Not responsible for:

- deciding anything a call asks for: the record keeper checks record changes, the gate handles floor actions, the line engine places asks;
- the agent's built-in tools (files, shell, web), which Claude Code provides and the agent runner confines ([0087](../decisions/0087-agents-run-confined.md)).

## 3. Interfaces

### 3.1 How a session gets its tools

- The agent runner creates a random token for each session, keeps its hash in memory for as long as the session runs ([0150](../decisions/0150-agent-tools-over-plain-http-mcp-tokens-in-memory.md)), and passes the MCP server address and token in the session's MCP configuration (`Authorization: Bearer <token>`).
- Every call carries the token. The token names one session, therefore one agent role, one software and one job ([0073](../decisions/0073-mcp-tools-with-session-tokens.md)).
- A builder's token cannot call the checker's tools: the tool list served to a session is its role's list, and a call to any other tool fails with `NOT_ALLOWED`.
- The token is revoked when the session ends.

### 3.2 Which agent role gets which tool

| Tool | drafter | researcher | reviewer | planner | builder | checker | triager | reader | reporter | sizer |
|---|---|---|---|---|---|---|---|---|---|---|
| `record_read` | yes | yes | yes | yes | yes | yes | yes | yes | yes | yes |
| `record_propose` | yes | yes | – | yes | D items only | – | – | – | – | – |
| `draft_submit` | yes | yes | – | yes | – | – | – | – | – | – |
| `ask` | yes | yes | – | yes | yes | could-not-check only | – | yes | – | – |
| `gate_request` | yes | yes | yes | yes | yes | yes | yes | yes | yes | – |
| `progress` | yes | yes | yes | yes | yes | yes | yes | yes | yes | yes |
| `task_finish` | yes | yes | yes | yes | yes | – | – | yes | – | yes |
| `scenario_write` | – | – | – | – | – | yes | – | – | – | – |
| `verdict_submit` | – | – | – | – | – | yes | – | – | – | – |
| `review_submit` | – | – | yes | – | – | – | – | – | – | – |
| `sizing_submit` | – | – | – | – | – | – | – | – | – | yes |
| `proposal_submit` | – | – | – | proposal jobs only | – | – | – | – | – | – |
| `recovery_submit` | recovery jobs only | – | – | – | – | – | – | – | – | – |
| `triage_submit` | – | – | – | – | – | – | yes | – | – | – |
| `lesson_submit` | – | – | – | – | – | – | learning jobs only | – | – | – |
| `reading_submit` | – | – | – | – | – | – | – | yes | – | – |
| `facts_read` | – | – | – | – | – | – | – | – | yes | – |
| `page_read` | – | yes | – | – | – | – | – | – | – | – |
| `report_submit` | – | – | – | – | – | – | – | – | yes | – |

Agent roles and their tiers are in [0113](../decisions/0113-agent-roles.md).

Built-in Claude Code tools by agent role:

- builder and checker: file and shell tools inside their confined working copy ([0087](../decisions/0087-agents-run-confined.md));
- researcher: web search and web fetch, no shell; premise's `page_read` reads a long page in parts when web fetch gives only a summary or cuts it short ([0300](../decisions/0300-judgement-fixes-from-the-first-real-runs.md));
- drafter, reviewer, planner, triager, reader, reporter, sizer: read-only file tools on their working copy, where they have one.

### 3.3 The result envelope

Every tool returns `ok` (true or false), `result` (the tool's output) or `error` (a code and a short message), and `diagnostics` (a list, possibly empty). An agent reads the message; the code is for the server and for tests.

| Error code | Meaning | What the agent should do |
|---|---|---|
| `NOT_ALLOWED` | The tool is not served to this agent role, or the item kind is not this role's to propose | Do not retry; ask through `ask` if a person must decide, or finish |
| `UNKNOWN_ITEM` | An item ID that does not exist in the record | Read the record and use a real ID |
| `MALFORMED` | Input that does not fit the tool's declared shape (each wrong field named, with an example), or a record line that breaks the format | Fix it from the diagnostics and resubmit |
| `CONFLICT` | A proposed item disagrees with a live item and does not name it as replaced | Name the item replaced, or drop the change |
| `TASK_CLOSED` | The job has ended or was stopped | Stop |
| `BUDGET_EXHAUSTED` | The stage budget or the session's turn or time limit is used up | Finish with what you have and say what is missing |
| `PAUSED` | The work queue is paused (usage limit or budget overrun) | Stop; the job resumes later |
| `INTERNAL` | A server fault | Retry once; then finish as stuck |

### 3.4 The tools

Each tool's input is declared field by field, once, in `src/agents/tool-inputs.ts`: every field's type, the required ones, enumerations, and the shape of lists and their entries, each with a one-line description. premise serves that shape as the tool's JSON Schema in `tools/list` and reads every call against the same shape before the module serving the tool sees it ([0285](../decisions/0285-each-tool-declares-its-shape-and-reads-what-real-agents-send.md)):

- **Read leniently, only where it is safe:** a list, an object or a number sent as text holding JSON of that kind is read as that kind, and the answer's diagnostics say to send it properly; "yes" and "no" (and "true" and "false") are read as true and false; null means a field left out; fixed words whose module ignored case and spacing still do. Nothing else is guessed.
- **A refusal names each wrong field:** where it is (`operations[0].from`), what arrived (its kind and a short excerpt), what to send, and a correct example of that field. A missing field also names the fields the object has that premise does not read, and says which one to move when it is plainly the one meant. Fields premise does not know are otherwise ignored.
- **The same call refused twice the same way** in a session gets a first line saying so, with the tool's whole example call.
- **An answer that could not be handed in is said.** When a job ends without its answer because premise refused its last call of an answer tool, the page says so with the refusal, and it is kept under Improvements for premise ([learning](learning.md)).

The table below says what each tool is for; the declared shapes are the full detail.

| Tool | Inputs | Outputs | Errors |
|---|---|---|---|
| `record_read` | Optional list of item IDs or file names; optional "include struck" | Record lines, with file and ID, as stored in `premise/` on the commit the job works from | `UNKNOWN_ITEM` |
| `record_propose` | A list of operations: add (`kind`, `text`, `priority` for W items, `from`), replace (`id`, new `text`, `from`, `reason`), strike (`id`, `reason`), mark (`id`, the mark); one reason for the whole change. `from` is `operator` only for the operator's own words, otherwise `assumed`. A refusal names the field that is missing or wrong and shows a complete operation ([0276](../decisions/0276-the-record-keeper-lands-each-decision-once.md)) | Change id; status (`rejected`, `reviewing`, `at-say-back`, `accepted`); diagnostics from the [record keeper](record-keeper.md); for `reviewing`, the review arrives as a later result in the job's next brief | `MALFORMED`, `UNKNOWN_ITEM`, `CONFLICT`, `NOT_ALLOWED` (a builder proposing anything but a D item) |
| `draft_submit` | Stage; list of items, each with its text, mark (`assumed` or a role) and for What its priority; an item marked `operator` also gives `quote`, the operator's exact words it rests on, which premise checks word for word against what they said, answered or edited (otherwise it is marked `assumed`, and the reply says what to supply); for What exists, sources per item and one recommended outcome (do not build, build it on top of something, build it anyway, build it), with `alternative` (what already does the job; for "do not build" the one line to use instead), `builds_on` (what it could be built on), `gap` (what nothing out there does) and `deciding_question` (the question the outcome turns on) ([0300](../decisions/0300-judgement-fixes-from-the-first-real-runs.md)); for Plan, the ordered task list, each task naming its items and its milestone. premise refuses a plan whose tasks are not separate checkable outcomes or do not follow the operator's scope, with the reasons, so it can be fixed and sent again ([0192](../decisions/0192-effort-in-proportion-to-what-was-asked.md)). A plan decision may carry `condition` (a must works only under it, or it was not checked), `must` (the must items it affects) and `who` (the role who can meet it); a plan decision may list `dependencies`, each `{ name, installs, needs_compiler, builtin_alternative }`; premise refuses one with `needs_compiler: true` unless it says in `installs` how it installs without a compiler or names a `builtin_alternative`. At Why, Who and What, an item quoting hedged words ("or", "perhaps", "not sure") that drops the hedge is refused ([0300](../decisions/0300-judgement-fixes-from-the-first-real-runs.md)) | Draft id; the draft appears on the page as an ask of kind `draft`, under the role it is for | `MALFORMED`, `BUDGET_EXHAUSTED` |
| `ask` | Role label, in that role's words; kind (`question`, `proposal`, `needed`); a short list (at most ten items); what waits on the answer. For `needed` (a real-world act only a person can do): `what`, one line of what is needed, and the items as the exact steps in order; `secret`, a key name, when the act ends in a secret: premise adds the step to write it into the software's secrets file and checks the key is there when the person marks it done ([0120](../decisions/0120-secrets-stay-out-of-premise.md), [0196](../decisions/0196-roles-and-taste-in-one-session.md)); `tool`, the command of a program the agents lack, with `why` and, when one host would let agents get it, `host`: one ask per tool and software, whose card offers allowing that host for this software, "I installed it" (premise checks the agents can run it, and says plainly if not) or going on without it ([0300](../decisions/0300-judgement-fixes-from-the-first-real-runs.md)) | Ask id. The calling job moves to waiting; other jobs go on ([line engine](line-engine.md)). A session cannot read the answer mid-way: it reaches a job that will read it (the task built again with it, the stage's job run again with it, a check run again), or, when none will, it is taken in as intake for the software; a question still open when its job ends says plainly where an answer now goes ([0310](../decisions/0310-answers-are-never-lost-and-the-work-is-visible.md)) | `MALFORMED` (no role label, or more than ten items), `NOT_ALLOWED` |
| `proposal_submit` | For a `prototype` job, the proposal for one claimed area: `options` (one, or at most `taste.options_max`), each a `title` and a `description` of what the claiming role would see; `tasks`, the numbers of the plan's tasks that build the area (only they wait; none named holds every task); an optional `note` | Ask id; the proposal is put to the claiming role ([line engine](line-engine.md) 5.6) | `NOT_ALLOWED` (not a proposal job), `TASK_CLOSED` (the claim was released), `CONFLICT` (already proposed), `MALFORMED` |
| `gate_request` | Floor kind ([0100](../decisions/0100-floor-actions.md)); exactly what will happen; why; the items it serves; `role`, whose call it is when the record names a role other than the operator | Request id; status `asked`, or `approved` when an approval for this kind already covers it; the server, never the agent, performs the act ([gate](gate.md)) | `MALFORMED`, `NOT_ALLOWED` (a kind that is never approved as a kind is asked one at a time; never an error) |
| `progress` | One line, at most 200 characters | Nothing | none |
| `task_finish` | Status: `done`, `stuck` (with what was tried), or `waiting-for-person` (with the ask id) | Nothing. This account is never a report source ([0097](../decisions/0097-reports-from-recorded-facts.md)) and never shown to the checker ([0089](../decisions/0089-checker-in-a-fresh-session.md)) | `TASK_CLOSED` |
| `scenario_write` | Scenario name; the items it checks; steps a user would take; what is expected. Used in the scenario-writing check job, from the record, before the build ([0122](../decisions/0122-scenarios-written-before-the-build.md)); the judging job may add scenarios for plainly wrong behaviour no item names | Saved; the file is written under `scenarios/<software>/` in the data folder ([0090](../decisions/0090-scenarios-out-of-the-builders-reach.md)). Only a check job may write one | `NOT_ALLOWED`, `MALFORMED` (an item not in the record, no steps, nothing expected) |
| `verdict_submit` | `verdicts`: for each item checked, `item`, `verdict` (`met`, `not-met` or `could-not-check`) and `evidence` (what was seen, or a file saved in `.premise-evidence/`), and `judged_on` (`real` for the real data, service or environment the software is for, `made-up` for stand-ins only; required on every verdict) with `try_it_on` (what a person should try it on; required when `made-up` and for every `could-not-check`) ([0280](../decisions/0280-the-run-step-builds-first-and-the-headline-tells-the-truth.md)). `met` on `made-up` data is refused: when the real data, service or tool was out of reach the verdict is `could-not-check` ([0300](../decisions/0300-judgement-fixes-from-the-first-real-runs.md)); `findings`: text, each `blocking` when it must be fixed before landing (`run.md` not working, a broken security default, [0092](../decisions/0092-security-defaults.md)); `run_notes`: corrections to how to build, start or check it; `seen_on_screen`: for a game or desktop program, whether the checker saw it on a screen and saved a screenshot; when not, the report says nobody has seen it on screen ([0310](../decisions/0310-answers-are-never-lost-and-the-work-is-visible.md)) | Received; each verdict is recorded against the exact commit under check, and Build and Check apply the outcomes ([0186](../decisions/0186-how-build-check-and-run-are-built.md)). Only the judging check job may submit | `NOT_ALLOWED`, `MALFORMED` (an item not in the record, a verdict without evidence, without `judged_on`, `met` on `made-up` data, or `made-up` or `could-not-check` without `try_it_on`) |
| `sizing_submit` | For one piece of work: its size (small, medium or large) with a reason; the stages it needs with a reason; a split, a list of parts each with a title, words and optionally what it touches, or empty, with a reason; and optionally `touches` (the folders, files, modules or record item IDs it will change) and `changes_foundation` (yes or no), which decide whether it may be built beside other work ([0313](../decisions/0313-several-pieces-of-one-software-at-once.md)) | The answer is kept; premise adds what must never be skipped and says so in `notes`. It is used when the sizer's job ends ([0184](../decisions/0184-how-sizing-of-work-is-built.md)) | `MALFORMED` (with what to fix), `TASK_CLOSED` |
| `review_submit` | For each proposed change: `consistent` or `conflicting` with the live item it conflicts with; for a foundation decision: `agree` or `object`, with reasons | Review id | `UNKNOWN_ITEM`, `MALFORMED` |
| `recovery_submit` | For a `recover` job (existing software): `items`, each with kind (Y, U, R, W or D), text, a priority for W, `assumed` for a guess, and `files`, the files of the old code it is guessed to serve; `run`, how to `build`, `start` and `check` it in plain words and `premise_run`, the runner's block; `could_not_check`, what premise would need, one line each; a `summary` | Kept until the job ends; then every item goes into the record `from: recovered`, unconfirmed, with `run.md` and `recovered-trace.md` ([0189](../decisions/0189-how-taking-on-existing-software-is-built.md)). Submitting again replaces it | `MALFORMED` (with what to fix), `TASK_CLOSED` |
| `triage_submit` | For the job's intake item: kind (bug, wish, change-of-purpose, question, opinion, duplicate, noise); `touches`, the record items touched, each with its reason; rough size; touches floor (true or false; yes or no is read too); `changes_what` (true or false; a bug never changes what the software must do, [0192](../decisions/0192-effort-in-proportion-to-what-was-asked.md)); route (in-normally, asked-at-once, held, merged-or-closed); a reason; for a duplicate, the item it joins (`joins`); for a question, its answer (`answer`). Submitted once; premise routes the item at once and may change the route under its rules ([0185](../decisions/0185-how-intake-in-a-thin-form-is-built.md)) | The route taken, with any notes ([intake](intake.md)) | `UNKNOWN_ITEM`, `MALFORMED`, `TASK_CLOSED` |
| `lesson_submit` | For the job's correction: `mistake`, what kind of mistake it was; `destination` (software, taste, premise, none); `reason`; `line`, one short instruction to learn (not for none), cut to `learning.line_max_chars`; for premise, a `topic` so the same thing recurring is grouped. Submitted once; applied at once ([learning](learning.md), [0194](../decisions/0194-how-learning-from-corrections-is-built.md)). A line for this software is taken only after the job read the record with `record_read`, and a line that states as settled what the person said they were unsure of is refused ([0300](../decisions/0300-judgement-fixes-from-the-first-real-runs.md)) | The destination, and the line's label (`L-n`) | `NOT_ALLOWED` (not a learning job), `MALFORMED`, `CONFLICT` (already read), `TASK_CLOSED` |
| `reading_submit` | For the job's reading, the short list: `wanted` (what people seem to want), `recurring` (what keeps coming up), `purpose` (whether the purpose or the users should change), `back_to_why` (true or false; yes or no is read too) | Reading id; the list goes to the operator as an ask ([intake](intake.md)) | `MALFORMED`, `TASK_CLOSED` |
| `page_read` | `url` (http or https, a public page) and `part` (from 1). premise fetches the page itself, never this machine or a private network (checked on every redirect), with a size cap and a time limit, turns it into plain text, and hands it out in parts of `tools.page_part_chars` characters ([0300](../decisions/0300-judgement-fixes-from-the-first-real-runs.md)) | `status` `read` with the part's text, its number and how many parts there are; `fetching` (call again in a moment); or `not-read` with why | `MALFORMED` (not a public web address) |
| `facts_read` | Software; since when; kinds (verdicts, job outcomes, gate decisions, runs, usage figures) | Facts, each with its evidence link | none |
| `report_submit` | Report lines, each with the evidence link of the fact it rests on | Report id | `MALFORMED` (a line with no evidence link, or a link to no recorded fact) |

## 4. Data owned

None. Calls are recorded as `events`; their effects are stored by the modules that own them ([storage](storage.md)).

## 5. Behaviour

- **Every call is checked first:** token valid and not revoked; tool in the role's list; software and job match the token; job not closed; work queue not paused. A failed check returns the error and does nothing.
- **Outside text stays data.** Tool results that carry outside text (an intake item, a page the researcher fetched, a log line) mark it as data, never as instructions ([0116](../decisions/0116-outside-content-is-data.md)).
- **Waiting is per job.** An `ask` or a `gate_request` holds only the calling job. Other jobs keep running ([0101](../decisions/0101-the-gate-asks-in-the-session.md)).
- **No tool reveals another session.** No tool returns a transcript, a builder's account, or another session's files. The checker's tools never return the builder's `task_finish` text ([0089](../decisions/0089-checker-in-a-fresh-session.md)).

## 6. Configuration

| Key | Default | Meaning |
|---|---|---|
| `tools.ask_max_items` | 10 | Most items in one ask |
| `tools.progress_max_chars` | 200 | Longest progress line |

## 7. Limits

- One MCP server, inside the server process, on localhost only ([0079](../decisions/0079-localhost-only.md)).
- A session's calls count toward its turn limit ([0088](../decisions/0088-turn-and-time-limits.md)).

## 8. Failure modes and recovery

| Failure | Detection | Effect | Recovery |
|---|---|---|---|
| An agent calls a tool it does not have | Role check | `NOT_ALLOWED` | The call is recorded; repeated calls count as the same failure toward the three-strike rule ([0088](../decisions/0088-turn-and-time-limits.md)) |
| A session outlives its job | Token revoked | `TASK_CLOSED` | The agent runner stops the session |
| The server restarts during a session | Session's process ended | The job is resumed or restarted ([work queue](work-queue.md)) | A new session gets a new token |

## 9. Security considerations

- The token binds every call to one session and one agent role ([0073](../decisions/0073-mcp-tools-with-session-tokens.md)). Agents calling premise through shell commands, with no per-role limits, was rejected.
- No tool writes the record, pushes, creates repositories or touches credentials. Those are the server's acts ([0077](../decisions/0077-github-through-existing-cli-login.md)), and floor acts pass the gate ([0101](../decisions/0101-the-gate-asks-in-the-session.md)).
- Instructions are not access control: what an agent cannot do, it has no tool for ([0087](../decisions/0087-agents-run-confined.md)).

## 10. Observability

- Every call is an event: tool, session, result status, error code, and for a refused call what the agent was told.
- A job that ended without its answer because premise refused it is an `answer-refused` event and a `refused_answers` row, once per job.
- The page can show, per job, the calls made, from the events.

## 11. Milestones

- Milestone 1 step 1: none; the proof program uses only Claude Code and the server's own acts ([roadmap](../product/roadmap.md)).
- Milestone 1 step 2: `record_read`, `record_propose`, `draft_submit`, `ask` (operator only), `gate_request`, `progress`, `task_finish`, `scenario_write`, `verdict_submit`, `review_submit`, `facts_read`, `report_submit`.
- Milestone 3: `ask` under every role label, with steps and a secret for real-world acts; `proposal_submit` for taste; `role` on `gate_request`. Built ([0196](../decisions/0196-roles-and-taste-in-one-session.md)).
- Milestone 4: `triage_submit`, `reading_submit`.
- Milestone 8: `lesson_submit`.
- Milestone 6, first part: `recovery_submit`.
