# Gate specification

Status: built in `src/gate/` for milestone 1, including approvals for a kind of action ([0182](../decisions/0182-how-the-gate-is-built.md)); being built otherwise ([0130](../decisions/0130-the-build-starts-and-covers-all-of-premise.md)). Related: [the floor and the gate](../architecture/the-floor-and-the-gate.md), [agent tools](agent-tools.md), [page](page.md), [runner](runner.md), [fixed wording](../prompts/fixed-wording.md).

## 1. Purpose

Every action on the floor passes the gate. The gate asks in the session, under the role whose call it is, or lets the action through when an approval already covers it ([0101](../decisions/0101-the-gate-asks-in-the-session.md)). The floor is what is never traded for speed: losing data, security holes, spending money, acting publicly in someone's name, and false reports ([0056](../decisions/0056-what-is-on-the-floor.md)).

The floor is slow on purpose; everything else proceeds and is reported.

## 2. Responsibilities and non-responsibilities

Responsible for:

- recognising floor actions, from the list in 5.1 ([0100](../decisions/0100-floor-actions.md));
- asking in the session, saying exactly what will happen and why;
- recording approvals for one action, or for a named kind of action for one software, and their withdrawal;
- having the server perform an approved action, and recording the outcome;
- holding only the work that depends on the answer.

Not responsible for:

- false reports: they are prevented by the reporter's facts-only rule ([0097](../decisions/0097-reports-from-recorded-facts.md)), not asked about;
- stopping agents from acting directly: they cannot, because they hold no credentials and run confined ([0087](../decisions/0087-agents-run-confined.md)); the gate is the only way in.

## 3. Interfaces

| Operation | Caller | Inputs | Outputs | Errors |
|---|---|---|---|---|
| Request | [Agent tools](agent-tools.md) (`gate_request`), server modules (runner, intake, record keeper) | Software, floor kind, exactly what will happen, why, items served, requested by | Request id; `approved` when an approval covers it, else `asked`; an agent's request, which premise cannot carry out, is `unavailable` and asks no one | `MALFORMED` |
| Decide | Page server (a person, in the session) | Request id; approve or refuse; optionally "approve this kind for this software" | Request status; an approval row when a kind was approved | `NOT_APPROVABLE_AS_KIND` (deleting data, spending money) |
| Withdraw approval | Page server | Approval id | Approval withdrawn | none |
| Perform | Gate (after approval) | Request | Done, unavailable (not carried out yet, and why) or failed, with the outcome | the action's own error |

## 4. Data owned

`gate_requests` and `approvals` ([storage](storage.md)).

## 5. Behaviour

### 5.1 Floor actions

From the owner's floor ([0056](../decisions/0056-what-is-on-the-floor.md)), made concrete enough for the gate to recognise ([0100](../decisions/0100-floor-actions.md)):

| Floor | Kinds | Examples |
|---|---|---|
| Losing data | `delete-data` | Deleting or overwriting anything outside a working copy; force-pushing; deleting repositories or branches with unmerged work; dropping a running software's stored data |
| Security holes | `credentials`, `expose`, `access` | Handling credentials; exposing anything beyond localhost; changing who can get in |
| Spending money | `spend` | Paid services, API keys, cloud resources, paid extra usage on a subscription |
| Acting publicly in someone's name | `make-public`, `publish`, `post` | Making a repository public; publishing a package or release; posting comments or messages |
| Changing a repository of the person's | `write-repository` | Adding premise's record, on a branch of its own, to a repository the person brought in; updating that branch ([0220](../decisions/0220-approvals-and-verdicts-tell-the-truth.md)) |
| Letting agents reach a site | `network` | Adding one host to the hosts one software's agents may reach, beyond the package registries, so they can download a tool they lack. Asked as "Allow <host> for <software>" on the card asking for that tool; the click is the approval, recorded once and scoped to that software; the agents' sandbox reads the allowed hosts for each new session, so nothing restarts ([0300](../decisions/0300-judgement-fixes-from-the-first-real-runs.md)) |
| False reports | none | Prevented by [0097](../decisions/0097-reports-from-recorded-facts.md), not asked about |

Leaving it to each agent to judge what is risky was rejected ([0100](../decisions/0100-floor-actions.md)). The server's own modules use the gate too: the runner for exposing a software beyond localhost and for first deployments to a public host (milestone 7), intake for comments on GitHub issues ([intake](intake.md)), and the line engine for creating a software's repository as public when the operator chose that ([runner](runner.md)).

### 5.2 Asking

- The gate asks in the session, under the role whose call it is, saying exactly what will happen and why ([0101](../decisions/0101-the-gate-asks-in-the-session.md)). The card's wording is fixed text filled from the request, with no model writing it ([fixed wording](../prompts/fixed-wording.md)).
- Each kind of action has its own card ([0220](../decisions/0220-approvals-and-verdicts-tell-the-truth.md)): a request names its kind of action (`act`, such as `add-record`, `push-record` or `create-repository`; none for an agent's request) and may give the card's title, standing-approval wording, rule sentence and why it asks now; otherwise the floor kind's words are used.
- Every card says what really happens if approved, in every mode: "This is real ..." or "Nothing happens yet ...", written by the server for that kind of action. A request premise has no way to carry out always says nothing happens. There is no separate "demo" banner on approval cards.
- The role is the operator unless the record names another role for that call (for example, a role that holds an outside account); an agent names it in `gate_request` (`role`), and the card is asked under it ([0196](../decisions/0196-roles-and-taste-in-one-session.md)).
- Only the work that depends on the answer waits. The requesting job is `waiting`; other jobs go on.

### 5.3 Approvals

- The session can approve one action, or a named kind of action for one software, such as status comments on its issues. Approvals are recorded and can be withdrawn.
- premise never asks for an action it cannot perform ([0270](../decisions/0270-premises-own-figures-and-asks-that-cost-attention-honestly.md)). An agent's request names no act premise carries out, so it is recorded as unavailable, said in the session in plain words, and no card is opened; the agent is told, so it can say in its report what needs a person to do by hand. A request for an act premise does carry out is asked as before. A card also records whether a job waits on its answer; one nothing waits on is not counted as the person's attention ([measures](measures.md)).
- A standing approval covers only its own kind of action: the same floor kind and the same `act`. Approving "adding premise's record to your repository" never covers creating a repository on GitHub, and a server act's approval never covers an agent's request ([0220](../decisions/0220-approvals-and-verdicts-tell-the-truth.md)).
- Deleting data and spending money are always asked one at a time; they cannot be approved as a kind.
- An approval never covers every software. Approvals that cover every software were rejected, as was asking for every action ([0101](../decisions/0101-the-gate-asks-in-the-session.md)).
- A withdrawn approval stops covering new requests at once; actions already done stay done and recorded.

### 5.4 Performing

- The server, not an agent, performs an approved action, with the credentials only it holds (the GitHub CLI login, used only by the server, [0077](../decisions/0077-github-through-existing-cli-login.md)).
- The outcome is recorded with the request: done; unavailable (approved, but premise cannot carry this out yet, with why); or failed with the error. The session says which, in those words: never "not approved" after an approval. A failed action is reported; it is not retried without a new request.
- Paid extra usage on a subscription is never requested by premise itself ([agent runner](agent-runner.md)).

### 5.5 While premise is being built

The same rule holds for building premise: work stops for the owner only on destructive, security-sensitive, public-facing or money-spending actions; everything else proceeds and is reported ([0053](../decisions/0053-when-work-stops-for-the-owner.md)).

## 6. Configuration

| Key | Default | Meaning |
|---|---|---|
| `gate.kind_approvals_allowed` | every kind except `delete-data` and `spend` | Kinds that can be approved for one software; each approval still covers only its own kind of action |

The floor and the gate stay with premise; they are not set per software ([0106](../decisions/0106-per-software-and-with-premise.md)).

## 7. Limits

- The gate recognises the actions it is told about: requests from agents and server modules. It does not watch what agents do; confinement makes direct action impossible ([0087](../decisions/0087-agents-run-confined.md)).

## 8. Failure modes and recovery

| Failure | Detection | Effect | Recovery |
|---|---|---|---|
| Nobody answers | Request stays `asked` | Only its job waits | Stays on the "needed" list under its role |
| Refused | Decision | The requesting job is told | The job finds another way or finishes; the refusal is in the report |
| The approved action fails | Error from the act | Not done | Recorded and reported; a new request is needed to try again |
| An agent tries the action directly | Denied by confinement | Fails in its session | Recorded; counts toward the three-strike rule |

## 9. Security considerations

- Instructions are not access control; the prior art's destructive incidents all had credentials within reach ([0087](../decisions/0087-agents-run-confined.md)). The gate works because agents cannot act without it.
- Being reached from other machines stays a later decision for the owner, because it is security-sensitive ([0065](../decisions/0065-one-open-session.md), [0079](../decisions/0079-localhost-only.md)).
- An approval is a decision under a role; it is recorded with the time and the request it answered.

## 10. Observability

- Every request, decision, approval, withdrawal and outcome is an event. Reports list gate decisions since the last report ([reporter](reporter.md)).
- The page shows standing approvals per software, each with a withdraw control.

## 11. Milestones

- Milestone 1 step 2: the gate, asking the operator; one-action approvals, and approvals for a kind of action for one software, never for deleting data or spending money ([0182](../decisions/0182-how-the-gate-is-built.md)). Creating any repository on GitHub is gated: private is kind `publish`, public is `make-public`. With real agents the card says "This is real." with the repository and account it will be created on, or, when the GitHub CLI is missing or not logged in, says so and how to fix it before the answer; approved, the server creates it and pushes. With scripted agents the card says nothing is created and nothing is ([0260](../decisions/0260-the-real-github-step-is-built-and-each-use-is-asked.md)). A creation cut off by a restart asks its own question about what to do in place of the general one. The agent tool `gate_request` goes to the gate.
- Milestone 3: asking under the right role. Built ([0196](../decisions/0196-roles-and-taste-in-one-session.md)).
- Milestone 4: comments on GitHub issues through the gate.
- Milestone 7: every first deployment to a public host is public-facing and may spend money, so it is asked.
