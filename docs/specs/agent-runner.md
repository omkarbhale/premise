# Agent runner specification

Status: built for real agents in `src/agents/` (`claude-agent.ts` and the files it uses), selected by `agents.mode` = `claude`, the default ([0180](-premise-uses-real-agents-by-default.md)); the scripted agent is for tests, demos and CI, set with `agents.mode` = `scripted`. Not built yet: the session-to-task record in usage-ledger's format (5.5), stage budgets (5.3). Related: [models and cost](../architecture/models-and-cost.md), [the floor and the gate](../architecture/the-floor-and-the-gate.md), [agent tools](agent-tools.md), [work queue](work-queue.md), [prompts](../prompts/README.md), [skills](../skills/README.md).

## 1. Purpose

The agent runner starts, watches and stops agent sessions. It gives each its own working copy, confinement and limits. It is the only part of premise that knows which agent runtime and provider are used ([0107](../decisions/0107-one-part-knows-the-runtime.md)). Other parts ask it for "an agent with these tools, in this working copy".

All LLM work goes through it. It runs Claude Code on the owner's subscription ([0046](../decisions/0046-claude-through-the-owners-subscription.md), [0071](../decisions/0071-headless-claude-code-agents.md), [0140](../decisions/0140-the-owners-existing-claude-code-login.md)). Behind one interface, a scripted agent with no LLM stands in for Claude in every test and demo, and is the default ([0134](../decisions/0134-the-owners-claude-login-only-when-strictly-necessary.md), [0148](../decisions/0148-scripted-agent-driven-by-a-script-file.md)).

## 2. Responsibilities and non-responsibilities

Responsible for:

- starting each agent as a headless Claude Code child process with streamed JSON output ([0071](../decisions/0071-headless-claude-code-agents.md));
- assembling its instructions: the role's prompt, the role's skills appended in full, the task brief ([0114](../decisions/0114-prompts-and-skills-as-files.md));
- choosing the model by agent role, named by tier alias ([0104](../decisions/0104-model-tier-by-role.md), [0105](../decisions/0105-tier-aliases.md));
- confinement: Claude Code's sandbox for shell commands, plus permission rules for file tools ([0087](../decisions/0087-agents-run-confined.md));
- turn and time limits ([0088](../decisions/0088-turn-and-time-limits.md));
- reading each session's streamed events into its transcript and the page's progress;
- recording each session against the task it did, where usage-ledger reads it ([0064](../decisions/0064-cost-and-spending-limit-from-usage-ledger.md));
- noticing usage-limit events and telling the work queue.

Not responsible for:

- which job runs ([work queue](work-queue.md));
- what the tools do ([agent tools](agent-tools.md));
- pushing, merging or creating repositories: the server does those ([0077](../decisions/0077-github-through-existing-cli-login.md));
- starting the built software ([runner](runner.md)).

## 3. Interfaces

| Operation | Caller | Inputs | Outputs | Errors |
|---|---|---|---|---|
| Start agent | Work queue | Job; agent role; software; the commit or branch to work from; task brief values | Session id; the session runs | `PREREQUISITE_MISSING`, `CONFINEMENT_UNAVAILABLE`, `PAUSED` |
| Stop agent | Work queue, page server | Session | Session ended, tool token revoked | none |
| Session ended | (internal, from the child process) | Exit, last events | Job result to the work queue | none |
| Usage limit | (internal, from streamed events) | Rate-limit event, reset time if given | Pause all, to the work queue | none |

## 4. Data owned

`agent_sessions` ([storage](storage.md)); transcripts under `transcripts/` and working copies under `work/` in the data folder.

## 5. Behaviour

### 5.1 Starting a session

1. Make a fresh working copy for the job under `work/<software>/job-<job>/` ([0086](../decisions/0086-working-copy-and-branch-per-change.md)); premise clones, with the owner's git setup, so the agent holds no credential. Files the sandbox leaves in a working copy (`.bashrc`, `.gitconfig`, `.claude/` and the like) are excluded from git there, so no commit picks them up:
   - builder: a clone of the software's repository on a branch for the change (`premise/job-<job>`);
   - checker: its own clone of the commit under check, separate from the builder's ([0089](../decisions/0089-checker-in-a-fresh-session.md));
   - planner, drafter, reviewer: a read-only clone at the default branch, where the job needs one;
   - researcher, triager, reader, reporter: none, or an empty scratch folder;
   - any role, when the software has no repository yet: an empty scratch folder.
   - A job whose last session was cut off (usage limit, pause, premise stopped) keeps its working copy and carries that session on with `--resume`, but only if its id was confirmed by the session's first event; a session cut off before that starts afresh ([0151](../decisions/0151-session-ids-chosen-by-premise-and-cut-off-sessions-carried-on.md)).
2. Assemble the instructions: the role's prompt from premise's repository, then every skill the role lists, in full, then the task brief with its placeholders filled ([0114](../decisions/0114-prompts-and-skills-as-files.md)).
3. Create the session's tool token and MCP configuration ([agent tools](agent-tools.md)).
4. Start Claude Code headless (`claude -p` with streamed JSON output) as a child process ([0071](../decisions/0071-headless-claude-code-agents.md)):
   - with the owner's existing Claude Code login by default, or the configuration folder named in `agents.claude_config_folder` ([0140](../decisions/0140-the-owners-existing-claude-code-login.md), which supersedes premise's own folder of [0076](../decisions/0076-own-claude-code-configuration.md));
   - with no API key anywhere in its environment ([0103](../decisions/0103-subscription-only-for-the-owner.md));
   - with the model alias for the role's tier;
   - with the role's allowed tools only;
   - with confinement (5.2);
   - with permission prompts denied, not waited on: whatever would need permission is denied and reported (`--permission-mode dontAsk --permission-prompts none`);
   - reading no settings but its own generated file (`--setting-sources ""`) and no MCP server but premise's (`--strict-mcp-config`);
   - with an id premise chose (`--session-id`), confirmed by the session's first event ([0151](../decisions/0151-session-ids-chosen-by-premise-and-cut-off-sessions-carried-on.md)).
5. Record the session in `agent_sessions`, and the session-to-task record for usage-ledger (5.5).

### 5.2 Confinement

Every agent runs confined: Claude Code's sandbox for shell commands, plus permission rules for its file tools, because the sandbox covers shell commands only ([0087](../decisions/0087-agents-run-confined.md)).

- The confinement is a settings file generated per session: the sandbox on, `failIfUnavailable`, `allowUnsandboxedCommands` off; permission rules in the double-slash form for absolute paths (`Read(//path/**)`).
- Writes only in its working copy and its scratch folder.
- Other sessions' folders and premise's data are denied one by one, never by a parent of the session's own folder, because a denied parent denies everything in it. Known limit: a folder made after a session started is not in its list ([0153](../decisions/0153-confinement-names-the-folders-that-exist-at-start.md)).
- Reads denied for premise's data folder, the checker's scenarios, and credential files (SSH keys, the GitHub login, Claude Code's login). The checker alone may read its own scenarios.
- Network only to the package registries in `agents.network.allowed_domains`, for builders and checkers; other roles reach no host; the researcher alone gets web search and web fetch; the checker also reaches the software it started on localhost.
- The builder holds no credentials. It commits; the server pushes ([0077](../decisions/0077-github-through-existing-cli-login.md)).
- On Linux and WSL2, Claude Code's sandbox needs bubblewrap and socat ([page server](page-server.md)).
- The sandbox held in the milestone 1 step 1 test, so no container is used and Docker is not a prerequisite ([0125](../decisions/0125-the-claude-code-sandbox-is-the-confinement.md)). If bubblewrap or socat is missing, no agent starts and work stops for the owner, because running agents unconfined is security-sensitive ([0053](../decisions/0053-when-work-stops-for-the-owner.md)).

### 5.3 Limits

- Each session has a turn limit and a time limit. A stuck agent otherwise loops through the subscription's limits ([0088](../decisions/0088-turn-and-time-limits.md)).
- Claude Code has no turn limit of its own in headless mode, so the runner counts the session's model turns from its events. At either limit, the session is stopped and the job finishes `stuck`, with which limit it hit.
- Stopping asks the session's whole process group to end, and ends it forcibly after `agents.claude.stop_grace_seconds`.
- During a stage with a budget, the stage budget also applies ([line engine](line-engine.md)).

### 5.4 Models

- Tier by agent role ([0104](../decisions/0104-model-tier-by-role.md), [0113](../decisions/0113-agent-roles.md)):

| Agent role | Tier |
|---|---|
| drafter, researcher, reviewer, planner, builder, checker, reader | strongest |
| triager, reporter | fast |

- Models are named by Claude Code's tier aliases, not pinned versions, so a better model makes premise better without a change ([0105](../decisions/0105-tier-aliases.md), [0031](../decisions/0031-the-product-is-general.md)).
- The checker uses the same provider as the builder, in a fresh session, with different instructions, at the strongest tier ([0091](../decisions/0091-checker-same-provider-strongest-tier.md)). A checker that shares the builder's model is a known limit; reports say so.
- The owner's subscription is used only through Anthropic's own Claude Code, logged in as the owner, on the owner's machine, for the owner's own use. premise never offers that login to anyone else ([0103](../decisions/0103-subscription-only-for-the-owner.md)). People who set premise up themselves bring their own model access (milestone 5).
- Other providers come later; adding one changes only the agent runner ([0107](../decisions/0107-one-part-knows-the-runtime.md)).

### 5.5 Session records for usage-ledger

- premise builds no cost tracking of its own ([0064](../decisions/0064-cost-and-spending-limit-from-usage-ledger.md)). usage-ledger reads what agents and accounts already record: the per-session cost and token totals Claude Code writes, the subscription's limits, and which task each session was doing. It never sits between an agent and its model.
- For every session the runner records the task it did (software, stage, job, record items, agent role), where usage-ledger reads it and in the format usage-ledger defines. Each session's id is recorded against its task from milestone 1, so usage can be attributed later.
- premise tells usage-ledger where its Claude Code sessions are recorded: premise's own configuration folder.

### 5.6 The usage limit

- When the subscription's usage limit is reached, Claude Code reports it as a `rate_limit_event` with status `rejected` and the reset time. The runner stops the session and tells the work queue, which pauses all agent work until the reset, and the report says so ([work queue](work-queue.md)). A status of `allowed_warning` is shown as progress. After the reset, the cut-off session is carried on if its id was confirmed, and starts afresh if not.
- premise never turns on paid extra usage. Paid extra usage on a subscription is spending money, on the floor ([0100](../decisions/0100-floor-actions.md)).

### 5.7 Watching

- Streamed events go to the session's transcript, and progress lines to the page.
- The runner never reports on the agent's behalf: what an agent says about its own work is not a source for any report ([0097](../decisions/0097-reports-from-recorded-facts.md)).

## 6. Configuration

Every setting, with its default, is in the [configuration reference](../reference/configuration.md). The agent runner's:

| Key | Default | Meaning |
|---|---|---|
| `agents.mode` | `claude` | `claude` or `scripted` (no LLM; tests, demos, CI) ([0134](../decisions/0134-the-owners-claude-login-only-when-strictly-necessary.md)) |
| `agents.claude_config_folder` | none: the owner's existing login | A Claude Code configuration folder to use instead ([0140](../decisions/0140-the-owners-existing-claude-code-login.md)) |
| `agents.claude.command` | `claude` | The Claude Code program |
| `agents.claude.stop_grace_seconds` | 10 | How long a stopped session gets before it is ended forcibly |
| `agents.network.allowed_domains` | the main package registries | Network allowed to builders and checkers |
| `agents.confinement.extra_denied_paths` | none | More paths no agent may read or write |
| `agents.tasks.<type>.model` | `opus` for strongest-tier roles, `sonnet` for fast | Model alias per type of task ([0104](../decisions/0104-model-tier-by-role.md), [0105](../decisions/0105-tier-aliases.md)) |
| `agents.tasks.<type>.effort` | `medium` | Reasoning effort per type of task |
| `agents.tasks.<type>.max_turns` | 200 for build, prototype and check; 60 otherwise | Turn limit |
| `agents.tasks.<type>.max_minutes` | 60 for build, prototype and check; 20 otherwise | Time limit |

## 7. Limits

- At most two sessions at once by default ([0074](../decisions/0074-two-agent-sessions-at-once.md)).
- One process per agent makes limits, confinement and stopping simple ([0071](../decisions/0071-headless-claude-code-agents.md)).
- The Claude Agent SDK package is not used: its documentation says products built on it should not offer claude.ai login unless approved and should use API keys, which spend money ([0071](../decisions/0071-headless-claude-code-agents.md)).

## 8. Failure modes and recovery

| Failure | Detection | Effect | Recovery |
|---|---|---|---|
| Claude Code not logged in | Start check | No agent starts | "Needed": the owner logs in once ([page server](page-server.md)) |
| An API key is found in the environment | Start check | No agent starts | Removed from the child's environment; if it cannot be, reported |
| Confinement unavailable (bubblewrap or socat missing) | Start check, and again when the runner is made | premise starts, holds agent work and does not run real agents ([0180](-premise-uses-real-agents-by-default.md)) | Named as missing on the page; the owner installs them, or looks around with scripted agents (labelled not real) |
| The sandbox fails to start anyway | Claude Code refuses to run (`failIfUnavailable`) | The job fails as `sandbox-unavailable` | The setup check says what is missing |
| Claude Code is using an API key | The session's first event names a key source | The session is stopped; the job fails | The owner removes the key from Claude Code's settings |
| An agent writes or reads outside its confinement | Denied by sandbox or permission rule | The action fails in the session | Recorded; repeated attempts count toward the three-strike rule |
| Session hangs | Time limit | Stopped | Job `stuck`, reported |
| Usage limit | Rate-limit events | All agent work paused | Resumes after the reset |

## 9. Security considerations

- Unattended agents with the owner's files and logins within reach is how the prior art's worst incidents happened ([0087](../decisions/0087-agents-run-confined.md)).
- Agents hold no credentials. They can only request a floor action through `gate_request`; instructions are not access control.
- Instructions ship as files in premise's repository and are about the line and the records, not workarounds for one model ([0031](../decisions/0031-the-product-is-general.md), [0106](../decisions/0106-per-software-and-with-premise.md)).
- Two sessions running at once cannot read each other's files: each is confined to its own working copy.

## 10. Observability

- Every session: start, end, end reason, turns, limit hit; transcript kept.
- Milestone 1 step 1 keeps the program's log, the task's commits, the confinement tests' output and the session records as evidence.

## 11. Milestones

Milestone 1, step 1: a small TypeScript program, the start of the agent runner, must show on the owner's machine:

1. it starts Claude Code headless as a child process, logged in with the owner's subscription in premise's own configuration folder, with no API key anywhere in its environment;
2. the session finishes a multi-step coding task (write a tiny program, test it, commit it) with nobody answering anything; whatever would need permission is denied and reported, not waited on;
3. confinement holds: the agent cannot write outside its working copy, cannot read a file planted in premise's data folder or the GitHub login, and cannot reach a host that is not allowed;
4. two sessions run at once, as a builder and a checker, and neither can read the other's files;
5. each session's id is recorded against the task it did;
6. the usage limit is handled: rate-limit events pause the work, and it resumes after the reset; if the limit cannot be reached safely, the pause is shown with a simulated event;
7. the server, not an agent, creates a private repository on the owner's GitHub and pushes to it ([runner](runner.md));
8. the use stays within [0103](../decisions/0103-subscription-only-for-the-owner.md), settled by [0124](../decisions/0124-unattended-claude-code-on-the-subscription-is-allowed.md).

If point 1, 2, 7 or 8 cannot be proven, work stops for the owner there; the report says what failed and what the options are, for example an API key, which spends money. Nothing else in milestone 1 starts. Points 3 and 4 held with the sandbox, so there is no container fallback ([0125](../decisions/0125-the-claude-code-sandbox-is-the-confinement.md)).

Later milestones:

- Milestone 1 step 2: every agent role used by the thinnest line.
- Milestone 2 (against usage-ledger's mock until it exists, [0133](../decisions/0133-usage-ledger-is-mocked-until-it-exists.md)): session-to-task records in usage-ledger's format.
- Milestone 5: each person's own model access; other providers if needed, added here only.
