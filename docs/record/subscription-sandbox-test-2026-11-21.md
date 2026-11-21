# Subscription and sandbox test, 2026-11-21 (milestone 1, step 1)

A condensed report of the first test of the plan: can premise drive Claude Code unattended on the owner's subscription, confined by Claude Code's own sandbox? Outcome: yes, for every point that could be tested here. The owner ordered it: "Carry the subscription and sandbox test on Sonnet 5.5 medium, and if it really needs to use my claude, it uses Haiku for testing. No web searches allowed and only a POC."

The proof-of-concept scripts and raw logs are not kept in this repository. This record keeps the result and what it taught.

## Setup

- Claude Code 2.1.330 on Linux under WSL2, bubblewrap 0.11.1.
- Every model call used the `haiku` alias, which resolved to Haiku 5.5. Eight runs, about $0.04 of *notional* cost (it is a subscription; nothing was billed).
- No web search or fetch, no API key, no global settings changed, no real credentials read.

## Point by point

| # | Point | Result | Evidence |
| --- | --- | --- | --- |
| 1 | Headless child process, owner's login, no API key, billing source confirmed | **Passed**, with a caveat: the default configuration folder was used, not a premise-owned one | Started with a cleaned environment. The session's init message reported no API key source; the auth status showed a claude.ai login; the stream carried rate-limit events for the subscription's seven-day window, with overage rejected at the organization level, so no spend beyond the subscription |
| 2 | Multi-step coding task, nobody answering, permission needs denied rather than awaited | **Passed** | The session wrote a small program and its test, ran the test ("all tests passed"), and committed in a scratch repository. With `--permission-mode dontAsk --permission-prompts none`, denied actions appeared as `permission_denied` events and in the result's denial list; nothing ever waited for an answer |
| 3a | Cannot write outside the working copy | **Passed** | A shell write outside it gave "Read-only file system"; the file-write tool was denied by permission rule; the host check confirmed the file does not exist |
| 3b | Cannot read a planted secret | **Passed** | The file-read tool was denied by rule; a shell `cat` gave "No such file or directory" (the path is masked inside the sandbox); the host file was untouched |
| 3c | Cannot reach a host that is not allowed | **Passed** | A request to an outside host failed with a 403 from the sandbox's network proxy; asking to run the command outside the sandbox was denied the same way |
| 4 | Builder and checker at once, neither able to read the other's files | **Passed** | The two runs overlapped in time. Each tried to read the other's private file and list the other's folder: "No such file or directory" and an empty listing. Each could read its own file |
| 5 | Session id captured per task | **Passed** | The id is in the session's init event; one line per task (task, role, session id) was recorded |
| 6 | Usage-limit handling | **Partial: simulated only, as instructed** | Every real run's stream carried a rate-limit event with status `allowed`, the reset time and the window's utilization. Statuses seen in the local program: `allowed`, `allowed_warning`, `rejected`. A script mapped a *simulated* `rejected` event to "pause until the reset time". The real `rejected` event's shape, and the field on an error result, were not observed |
| 7 | Resume and stream-json input | **Passed** | `--resume` in the same folder kept the session id, and the agent recalled its earlier commit and made another. With `--input-format stream-json`, two user messages on the standard input went through one process and one session, and the second was answered correctly |
| – | Terms of use for unattended subscription use | **Not checked** (no web access) | Settled afterwards by the owner's ruling, [0124](../decisions/0124-unattended-claude-code-on-the-subscription-is-allowed.md). Locally, `--bare` says Anthropic login is read only from an API key or key helper, so `--bare` cannot be used with a subscription |

## The commands that worked

Each session was run roughly like this, from the session's own working folder:

```
env -i PATH=<path> HOME=<home> TERM=dumb \
  claude -p "<prompt>" --model haiku --output-format stream-json --verbose \
    --permission-mode dontAsk --permission-prompts none \
    --settings <per-run settings file> --setting-sources "" --max-budget-usd 0.50
```

Each run's settings file (generated per session) held:

```
sandbox: { enabled: true, failIfUnavailable: true, allowUnsandboxedCommands: false,
           autoAllowBashIfSandboxed: true,
           filesystem: { denyRead: [premise's data, logs, every other session's folder] },
           network: { allowedDomains: [<the planned few>] } }
permissions: { deny:  [ Read/Edit/Write(//<each denied folder>/**), WebFetch, WebSearch ],
               allow: [ "Bash", Read/Edit/Write(//<own folder>/**) ] }
```

To resume, add `--resume <session id>`. For several turns in one process, use `--input-format stream-json` with one JSON line per user message on the standard input.

## What failed, and what it taught

1. **The sandbox did not start because `socat` was not installed** (bubblewrap was). With `failIfUnavailable` on, Claude Code refused to run, at no cost: it fails closed. The test got past this without administrator rights by unpacking the packages into a scratch area. For the owner: bubblewrap, socat and the library socat needs must be installed, and premise's setup must check for them and refuse to run without them.
2. **Path patterns in permission rules.** `Write(/abs/path/**)` is relative to the project root; an absolute path needs a double slash, `Write(//abs/path/**)`. The wrong form silently denied writes to the session's own folder.
3. **Deny rules beat allow rules.** Denying a parent folder, or a list of siblings that included the session's own folder, also blocked the session's own working copy. Denying reads of a parent while allowing reads of the child made the child read-only. What works: deny the specific other folders, leaving out the session's own.
4. **A combined shell heredoc and program run was denied under `dontAsk`** in the first run, before `Bash` was allowed. Allowing `Bash` outright is safe only because the sandbox is mandatory and running outside it is switched off.
5. **The sandbox leaves placeholder files in the working copy** (shell start-up files, `.gitconfig`, `.mcp.json`, `.claude/`). A blanket `git add -A` inside a session would pick them up, and the agent itself warned about this. Stage named files, or ignore them.
6. **A headless session still lists the account's connected services and every default tool.** Use `--strict-mcp-config` and a minimal `--tools` to shrink what the agent can reach.
7. **The file tools are not covered by the operating-system sandbox**, only by permission rules. Both layers are needed: the file-read tool was stopped by a rule, and the shell by the sandbox.

## Caveats, and what was not tested

- **A premise-owned configuration folder** ([0076](../decisions/0076-own-claude-code-configuration.md)) was not tried. The default login was used. A separate login needs an interactive login by the owner.
- **Point 7 of the roadmap, the server creating a private GitHub repository and pushing to it, was out of scope** and is untested.
- **Haiku only.** Behaviour on the Sonnet and Opus tiers is unverified. The probes were prompt-driven, so results were checked on the host (files outside absent, the secret intact) and in the raw tool results of the streams.
- **Process-level escapes** (symlinks, `/proc`, git hooks, programs the agent itself writes and runs) were not stress-tested. This was a proof of concept, not a security audit.
- **A real usage-limit rejection, and resuming after the reset,** were simulated only.
- **No standard-input answer path was used.** With `--permission-prompts none` nobody can approve anything, so a task that needs a denied action reports it.
- **An allowed host was not demonstrated.** The network test used a placeholder allowlist; the model traffic goes through Claude Code itself and worked.
- **Terms of use** were not checked in the test; see [0124](../decisions/0124-unattended-claude-code-on-the-subscription-is-allowed.md).

## What this means for the plan

- Step 1 holds for points 1 to 5 and 7 (the test's numbering) without the container fallback of [0087](../decisions/0087-agents-run-confined.md): [0125](../decisions/0125-the-claude-code-sandbox-is-the-confinement.md). Docker was not needed.
- What the agent runner has to do, as the test showed:
  - (a) Check bubblewrap and socat at setup, and run with `failIfUnavailable`.
  - (b) Generate per-session settings that deny every other session's and premise's data folders and allow only the session's own, with the double-slash path form.
  - (c) Always use `--permission-mode dontAsk --permission-prompts none`, `--setting-sources ""`, `--strict-mcp-config` and a minimal `--tools`.
  - (d) Record the session id from the init event; `--resume` keeps it.
  - (e) Parse rate-limit events for pause and resume; handle a real limit when it can be observed safely.
  - (f) Treat `--max-budget-usd` as nominal on a subscription; do not rely on it to limit spend.
  - (g) Not use `--bare` with a subscription login.
