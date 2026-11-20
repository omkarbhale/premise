# Agent tools specification

Status: specification. Nothing is built until the owner says to start ([0061](../decisions/0061-nothing-built-until-the-owner-says.md)). Related: [agent runner](agent-runner.md), [record keeper](record-keeper.md), [gate](gate.md), [line engine](line-engine.md), [prompts](../prompts/README.md), [skills](../skills/README.md).

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

- The agent runner creates a random token for each session, stores its hash in `agent_sessions` ([storage](storage.md)), and passes the MCP server address and token in the session's MCP configuration.
- Every call carries the token. The token names one session, therefore one agent role, one software and one job ([0073](../decisions/0073-mcp-tools-with-session-tokens.md)).
- A builder's token cannot call the checker's tools: the tool list served to a session is its role's list, and a call to any other tool fails with `NOT_ALLOWED`.
- The token is revoked when the session ends.

### 3.2 Which agent role gets which tool

| Tool | drafter | researcher | reviewer | planner | builder | checker | triager | reader | reporter |
|---|---|---|---|---|---|---|---|---|---|
| `record_read` | yes | yes | yes | yes | yes | yes | yes | yes | yes |
| `record_propose` | yes | yes | – | yes | D items only | – | – | – | – |
| `draft_submit` | yes | yes | – | yes | – | – | – | – | – |
| `ask` | yes | yes | – | yes | yes | could-not-check only | – | yes | – |
| `gate_request` | yes | yes | yes | yes | yes | yes | yes | yes | yes |
| `progress` | yes | yes | yes | yes | yes | yes | yes | yes | yes |
| `task_finish` | yes | yes | yes | yes | yes | – | – | yes | – |
| `scenario_write` | – | – | – | – | – | yes | – | – | – |
| `verdict_submit` | – | – | – | – | – | yes | – | – | – |
| `review_submit` | – | – | yes | – | – | – | – | – | – |
| `triage_submit` | – | – | – | – | – | – | yes | – | – |
| `reading_submit` | – | – | – | – | – | – | – | yes | – |
| `facts_read` | – | – | – | – | – | – | – | – | yes |
| `report_submit` | – | – | – | – | – | – | – | – | yes |

Agent roles and their tiers are in [0113](../decisions/0113-agent-roles.md).

Built-in Claude Code tools by agent role:

- builder and checker: file and shell tools inside their confined working copy ([0087](../decisions/0087-agents-run-confined.md));
- researcher: web search and web fetch, no shell;
- drafter, reviewer, planner, triager, reader, reporter: read-only file tools on their working copy, where they have one.

### 3.3 The result envelope

Every tool returns `ok` (true or false), `result` (the tool's output) or `error` (a code and a short message), and `diagnostics` (a list, possibly empty). An agent reads the message; the code is for the server and for tests.

| Error code | Meaning | What the agent should do |
|---|---|---|
| `NOT_ALLOWED` | The tool is not served to this agent role, or the item kind is not this role's to propose | Do not retry; ask through `ask` if a person must decide, or finish |
| `UNKNOWN_ITEM` | An item ID that does not exist in the record | Read the record and use a real ID |
| `MALFORMED` | Input that does not parse, or a record line that breaks the format | Fix it from the diagnostics and resubmit |
| `CONFLICT` | A proposed item disagrees with a live item and does not name it as replaced | Name the item replaced, or drop the change |
| `TASK_CLOSED` | The job has ended or was stopped | Stop |
| `BUDGET_EXHAUSTED` | The stage budget or the session's turn or time limit is used up | Finish with what you have and say what is missing |
| `PAUSED` | The work queue is paused (usage limit or budget overrun) | Stop; the job resumes later |
| `INTERNAL` | A server fault | Retry once; then finish as stuck |

### 3.4 The tools

| Tool | Inputs | Outputs | Errors |
|---|---|---|---|
| `record_read` | Optional list of item IDs or file names; optional "include struck" | Record lines, with file and ID, as stored in `premise/` on the commit the job works from | `UNKNOWN_ITEM` |
| `record_propose` | A list of operations: add (file, text, priority for W items, `from`), replace (old ID, new text, reason), strike (ID, reason); one reason for the whole change | Change id; status (`rejected`, `reviewing`, `at-say-back`, `accepted`); diagnostics from the [record keeper](record-keeper.md); for `reviewing`, the review arrives as a later result in the job's next brief | `MALFORMED`, `UNKNOWN_ITEM`, `CONFLICT`, `NOT_ALLOWED` (a builder proposing anything but a D item) |
| `draft_submit` | Stage; list of items, each with its text, mark (`assumed` or a role), and for What its priority; for What exists, sources per item and one recommended outcome (do not build, build on something, build something different); for Plan, the ordered task list, each task naming its items | Draft id; the draft appears on the page as an ask of kind `draft`, under the role it is for | `MALFORMED`, `BUDGET_EXHAUSTED` |
| `ask` | Role label; kind (`question`, `proposal`, `needed`); a short list (at most ten items); what waits on the answer | Ask id. The calling job moves to waiting; other jobs go on ([line engine](line-engine.md)) | `MALFORMED` (no role label, or more than ten items), `NOT_ALLOWED` |
| `gate_request` | Floor kind ([0100](../decisions/0100-floor-actions.md)); exactly what will happen; why; the items it serves | Request id; status `asked`, or `approved` when an approval for this kind already covers it; the server, never the agent, performs the act ([gate](gate.md)) | `MALFORMED`, `NOT_ALLOWED` (a kind that is never approved as a kind is asked one at a time; never an error) |
| `progress` | One line, at most 200 characters | Nothing | none |
| `task_finish` | Status: `done`, `stuck` (with what was tried), or `waiting-for-person` (with the ask id) | Nothing. This account is never a report source ([0097](../decisions/0097-reports-from-recorded-facts.md)) and never shown to the checker ([0089](../decisions/0089-checker-in-a-fresh-session.md)) | `TASK_CLOSED` |
| `scenario_write` | Scenario name; the items it checks; steps a user would take; what is expected. Used in the scenario-writing check job, from the record, before the build ([0122](../decisions/0122-scenarios-written-before-the-build.md)); the judging job may add scenarios for plainly wrong behaviour no item names | Scenario id; the file is written under `scenarios/<software>/` in the data folder ([0090](../decisions/0090-scenarios-out-of-the-builders-reach.md)) | `UNKNOWN_ITEM`, `MALFORMED` |
| `verdict_submit` | For each item checked: `met`, `not-met` or `could-not-check`, the scenario, and evidence files from the session's evidence folder; plus findings on `run.md`, the security defaults ([0092](../decisions/0092-security-defaults.md)) and what users read | Verdict ids; the [line engine](line-engine.md) applies the outcomes | `UNKNOWN_ITEM`, `MALFORMED` (a verdict without evidence) |
| `review_submit` | For each proposed change: `consistent` or `conflicting` with the live item it conflicts with; for a foundation decision: `agree` or `object`, with reasons | Review id | `UNKNOWN_ITEM`, `MALFORMED` |
| `triage_submit` | Intake item; kind (bug, wish, change-of-purpose, question, opinion, duplicate, noise); items touched; rough size; touches floor (yes or no); route (in-normally, asked-at-once, held, merged-or-closed); for a duplicate, the item it joins; for noise, the reason | The route taken ([intake](intake.md)) | `UNKNOWN_ITEM`, `MALFORMED` |
| `reading_submit` | The held items read; the short list: what people seem to want, what keeps coming up, whether the purpose or the users should change | Reading id; the list goes to the operator as an ask ([intake](intake.md)) | `MALFORMED` |
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

- Every call is an event: tool, session, result status, error code.
- The page can show, per job, the calls made, from the events.

## 11. Milestones

- Milestone 1 step 1: none; the proof program uses only Claude Code and the server's own acts ([roadmap](../product/roadmap.md)).
- Milestone 1 step 2: `record_read`, `record_propose`, `draft_submit`, `ask` (operator only), `gate_request`, `progress`, `task_finish`, `scenario_write`, `verdict_submit`, `review_submit`, `facts_read`, `report_submit`.
- Milestone 3: `ask` under every role label; kind `proposal` for taste.
- Milestone 4: `triage_submit`, `reading_submit`.
