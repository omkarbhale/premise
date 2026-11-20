# Page server specification

Status: specification. Nothing is built until the owner says to start ([0061](../decisions/0061-nothing-built-until-the-owner-says.md)). Related: [where it runs](../architecture/where-it-runs.md), [page](page.md), [storage](storage.md), [agent runner](agent-runner.md), [architecture overview](../architecture/overview.md).

## 1. Purpose

The page server is the front of premise's one server process ([0067](../decisions/0067-one-process-agents-as-children.md)). It covers starting premise, checking what premise needs on the machine, issuing the session's link and token, serving the page and its API, and streaming live updates to open pages.

premise runs on the owner's machine ([0043](../decisions/0043-runs-on-the-owners-machine-first.md)). One command starts it and prints the session's link.

## 2. Responsibilities and non-responsibilities

Responsible for:

- the start command and the prerequisite check at every start;
- the session's link, with its long random token, and checking it on every request ([0078](../decisions/0078-session-token-and-header-checks.md));
- checking the Host and Origin headers;
- listening on localhost only ([0079](../decisions/0079-localhost-only.md));
- serving the page as static files ([0069](../decisions/0069-react-and-vite-page.md));
- the HTTP API: one request for every action ([0070](../decisions/0070-http-and-server-sent-events.md));
- one server-sent event stream per open page;
- serving each software's feedback page under its own link ([0119](../decisions/0119-feedback-page-has-its-own-link.md));
- serving the agent tools' MCP endpoint ([agent tools](agent-tools.md)).

Not responsible for:

- what actions mean: it hands them to the line engine, the gate, intake and the reporter;
- installing anything: it names what is missing.

## 3. Interfaces

### 3.1 The start command

| Operation | Caller | Inputs | Outputs | Errors |
|---|---|---|---|---|
| Start | A person on the owner's machine | Optional data folder, optional port | The prerequisite check's result; the session's link printed on the terminal | Exits with the list of what is missing |
| New link | A person on the owner's machine | none | A new token; the old one revoked | none |

### 3.2 The HTTP API

All routes are on localhost. Every request except the static page itself and the feedback page carries the session token in a request header. The event stream, which a browser cannot give headers, carries it in the URL.

| Route | Method | Does | Hands to |
|---|---|---|---|
| `/` | GET | Serves the page; reads the token from the link and keeps it in the page's memory | – |
| `/api/softwares` | GET, POST | Lists softwares; starts one | Line engine |
| `/api/softwares/:id` | GET | The software's stages, record view and report view | Line engine, record keeper, reporter |
| `/api/softwares/:id/chat` | POST | A chat message | Line engine ([0118](../decisions/0118-how-chat-messages-are-routed.md)) |
| `/api/asks/:id/answer` | POST | Answers an ask: per item kept, struck or edited, a text answer, approve or refuse | Line engine, gate |
| `/api/softwares/:id/send-back` | POST | Sends a software back to a stage | Line engine |
| `/api/softwares/:id/claims` | POST | Claims an area for taste under a role | Line engine |
| `/api/softwares/:id/size` | POST | Changes the size class | Line engine |
| `/api/approvals/:id/withdraw` | POST | Withdraws an approval | Gate |
| `/api/jobs/:id/stop` | POST | Stops a job | Work queue |
| `/api/softwares/:id/more` | POST | Asks for more on an item or a report line | Reporter |
| `/api/softwares/:id/readings` | POST | Asks for a reading of held intake now | Intake |
| `/api/working-records/delete` | POST | A person deletes a working record | Storage |
| `/api/events` | GET (server-sent events) | Live updates: asks, progress lines, job changes, reports, notices | – |
| `/feedback/:token` | GET, POST | A software's feedback page; submits an item; shows one's own item's status | Intake |

Errors are returned as an HTTP status with a short message: 401 for a missing or wrong token, 403 for a bad Host or Origin, 404 for an unknown id, 409 for an ask already closed, 422 for an invalid answer.

## 4. Data owned

`page_tokens` and `feedback_links` ([storage](storage.md)). The event stream reads `events`.

## 5. Behaviour

### 5.1 Prerequisites

Installed once and checked at every start; premise names whatever is missing ([where it runs](../architecture/where-it-runs.md)):

- Node.js LTS and git;
- Claude Code, logged in once with the owner's subscription in premise's own configuration folder ([0076](../decisions/0076-own-claude-code-configuration.md));
- the GitHub CLI, logged in as the owner ([0077](../decisions/0077-github-through-existing-cli-login.md));
- on Linux and WSL2, bubblewrap and socat, which Claude Code's sandbox needs ([0087](../decisions/0087-agents-run-confined.md)). Installing them needs the owner's administrator password, so premise names them and the owner installs them;
- usage-ledger, once it is usable ([0064](../decisions/0064-cost-and-spending-limit-from-usage-ledger.md); milestone 2).

Anything missing is printed, with exactly what to do. premise starts without usage-ledger before milestone 2; it does not start agents without Claude Code, the GitHub CLI or confinement.

### 5.2 The session

- Everything is open in one session on the page: every stage, the record, reports, and what each role needs or is being asked. All of it is visible and answerable there, designed as if one person does everything ([0065](../decisions/0065-one-open-session.md)).
- The session's link carries a long random token. Every request needs it. Without it, any other web page open in the same browser could drive premise on localhost ([0078](../decisions/0078-session-token-and-header-checks.md)).
- The server also checks the Host header (it must name localhost and premise's port) and the Origin header (it must be premise's own), against pages that try to reach premise through another name.
- There are no per-person links and no accounts ([0045](../decisions/0045-a-link-per-person-no-accounts.md), [0065](../decisions/0065-one-open-session.md)). Accounts are decided at milestone 5.

### 5.3 Reach

- premise listens on localhost only. Anything reachable from outside the machine is security-sensitive ([0079](../decisions/0079-localhost-only.md), [0053](../decisions/0053-when-work-stops-for-the-owner.md)).
- Being reached from other machines is a later decision for the owner. Until then, premise is used only at the owner's machine.

### 5.4 Live updates

- Page to server: an HTTP request for every action. Server to page: one server-sent event stream per open page ([0070](../decisions/0070-http-and-server-sent-events.md)). WebSockets (two-way machinery the page does not need) and polling (slow to show progress) were rejected.
- Each event carries an increasing id, so a page that reconnects gets what it missed from `events`.

## 6. Configuration

| Key | Default | Meaning |
|---|---|---|
| `server.port` | 4610 | Local port for the page and API |
| `server.host` | localhost | Fixed in every milestone before the owner decides on reach |
| `server.token_bytes` | 32 | Length of the random token |

## 7. Limits

- One server process ([0067](../decisions/0067-one-process-agents-as-children.md)) on the current Node.js LTS, using Fastify for typed request validation ([0068](../decisions/0068-fastify-on-node-lts.md)).
- Any number of open pages share the one session.

## 8. Failure modes and recovery

| Failure | Detection | Effect | Recovery |
|---|---|---|---|
| A prerequisite is missing | Start check | premise names it; agents do not start | The owner installs or logs in, and restarts |
| Port in use | Listen fails | Not started | Started on another port given with the command |
| Token leaked | A person's judgement | Anyone with the link on this machine can drive premise | "New link" revokes it |
| Request without a token, or with a foreign Origin | Check | Refused (401, 403) | Recorded as an event |

## 9. Security considerations

- Localhost only; the token; Host and Origin checks ([0078](../decisions/0078-session-token-and-header-checks.md), [0079](../decisions/0079-localhost-only.md)). A token-free mode for requests from the owner's own machine was rejected.
- The token is printed on the terminal and kept in the page's memory, not in the browser's storage, so other pages cannot read it.
- The feedback link can only submit feedback and see one's own item's status ([0119](../decisions/0119-feedback-page-has-its-own-link.md)).
- The page server never performs floor actions; the gate does ([gate](gate.md)).

## 10. Observability

- The start check's result is printed and kept as an event.
- Refused requests are events.

## 11. Milestones

- Milestone 1 step 2: the server; the session's link and token; the API and event stream; the prerequisite check.
- Milestone 2 (needs usage-ledger usable): usage-ledger in the prerequisite check.
- Milestone 4: feedback pages.
- Milestone 5: one install command, and a setup check that names what is missing; premise hosted in a container on a host its operator chooses; accounts, decided then. Being reached from other machines is prepared, not decided: every step that exposes premise beyond one machine waits for the person running it; for the owner's own setup, the owner.
