# Work queue specification

Status: specification, being built ([0130](../decisions/0130-the-build-starts-and-covers-all-of-premise.md)). Related: [agent runner](agent-runner.md), [line engine](line-engine.md), [storage](storage.md), [models and cost](../architecture/models-and-cost.md).

## 1. Purpose

The work queue holds premise's jobs, stored so that a restart resumes them. It decides which job runs next, keeps at most two agent sessions running at once, and pauses work when the subscription's usage limit is reached or a software's budget is overrun. Per software it also holds the operator's optional settings of effort (a share of weekly usage, or a priority) and of milestone waits ([0128](../decisions/0128-effort-per-software-and-milestone-waits.md); how they work is the builders' reading, [0129](../decisions/0129-builders-reading-of-effort-and-milestone-waits.md), open to the owner's correction).

Job kinds: `draft`, `research`, `review`, `plan`, `build`, `prototype`, `check`, `run`, `report`, `triage`, `reading`. A `prototype` job makes the proposal for one claimed area before a milestone's tasks start; for now the planner writes it as described options ([0196](../decisions/0196-roles-and-taste-in-one-session.md)). A `check` job either writes a change's scenarios from the record before its build starts, or judges a commit ([0122](../decisions/0122-scenarios-written-before-the-build.md)).

## 2. Responsibilities and non-responsibilities

Responsible for:

- storing every job and its state in the `jobs` table ([storage](storage.md));
- choosing the next job to start;
- the limit on agent sessions running at once ([0074](../decisions/0074-two-agent-sessions-at-once.md));
- resuming or restarting jobs after a restart of premise;
- pausing all work on a usage-limit event, and one software's work on a budget overrun;
- removing a finished job's working copy.

Not responsible for:

- what a job does ([agent runner](agent-runner.md), [runner](runner.md));
- which job comes next on the line ([line engine](line-engine.md));
- counting usage or cost; usage-ledger does that ([0064](../decisions/0064-cost-and-spending-limit-from-usage-ledger.md)).

## 3. Interfaces

| Operation | Caller | Inputs | Outputs | Errors |
|---|---|---|---|---|
| Enqueue | Line engine, intake, reporter | Software, kind, stage, items served, payload, what it waits on (if anything) | Job id | none |
| Wait | Agent tools (after `ask` or `gate_request`) | Job, ask or gate request | Job status `waiting` | `TASK_CLOSED` |
| Resume | Line engine (answer arrived), gate (approval given) | Job | Job back to `queued` | none |
| Finish | Agent runner, runner | Job, result: done, stuck, failed, with the reason | Job closed; line engine told | none |
| Stop | Page server (a person, in the session) | Job | Session stopped; job `stopped` | none |
| Pause all, resume all | Agent runner (usage limit) | Reason, expected reset time | Queue state | none |
| Pause everything, resume | Page server (the operator; the `queue.start_paused` setting at start) | `finish` or `stop-now` | Queue state, stored | none |
| Begin stopping, stop now | The terminal (Ctrl+C, `premise stop`) | none | Nothing new starts; running jobs end, or are stopped and put back | none |
| Pause software, resume software | Usage-ledger watcher (budget overrun), page server (the operator, through `src/portfolio`) | Software, reason | Software state; a pause stops its running sessions and requeues their jobs | none |

## 4. Data owned

The `jobs` table, and the queue's state (running, paused for usage, with its reason and expected reset) in `settings` ([storage](storage.md)).

Job statuses: `queued`, `running`, `waiting` (on an ask or a gate request), `paused`, `done`, `stuck`, `failed`, `stopped`.

## 5. Behaviour

### 5.1 Choosing the next job

- A job is startable when it is `queued`, its software is active, not paused by the operator and not archived, and the queue is not paused.
- Agent jobs need a free session slot. At most two agent sessions run at once by default: every session draws on the same subscription limits, and more sessions at once mostly reach the limit sooner ([0074](../decisions/0074-two-agent-sessions-at-once.md)).
- `run` jobs are done by the server, not an agent, and do not take a slot.
- Order: the most important software first, by its priority (1 to 5, [0138](../decisions/0138-priority-is-a-field-from-milestone-1.md)); then jobs that unblock a person's view (a draft, a say-back, a report), then checks, then builds, then triage and readings; within one kind, oldest first.
- A software stopped at a milestone wait ([line engine](line-engine.md)) is not startable: no new job starts for it until the operator says to go on. Its asks stay answerable.
- Effort (builders' reading, [0129](../decisions/0129-builders-reading-of-effort-and-milestone-waits.md)): a software with a share of weekly usage is not started once its share is used, read from usage-ledger and the weekly figure in Claude Code's own stream; it comes with cost in milestone 2. Priority orders the queue between softwares, from milestone 1 ([0138](../decisions/0138-priority-is-a-field-from-milestone-1.md)).
- Several softwares share the slots ([0197](../decisions/0197-how-several-softwares-at-once-is-built.md)): the most important first, by priority; among equally important ones, the one with fewer sessions running, then the one whose last start was longest ago. A software that has waited `queue.fair_wait_minutes` without a session, behind more important ones, gets the next free slot, the longest-waiting first (event `fair-turn`). So no software waits indefinitely.
- A job waiting on a person holds no slot, so an ask never blocks other softwares. A software paused by the operator, archived, stopped at a milestone, or paused for its budget starts nothing; pausing or archiving it stops its running sessions and puts their jobs back in the queue, so the slots go to other softwares.

### 5.2 Restarts

Anything that must survive a crash goes through the work queue's table ([architecture overview](../architecture/overview.md)).

- At start, every job found `running` is examined:
  - an agent job whose session ended is restarted, with a note that a previous attempt was cut off; where the runtime can carry the old session on, it does, and otherwise the new session starts from the brief. The restart counts as an attempt ([0290](../decisions/0290-pausing-and-resuming-the-whole-of-premise.md) 11);
  - a `run` job is repeated from the start; starting from a clean copy makes this safe.
- `waiting` jobs stay waiting; their asks and gate requests are still open in the session.

### 5.3 Failure and the three-strike rule

- Each job records a failure signature: the stage, the items, and the error or failed verdict.
- The same failure three times stops the task, and the task is reported ([0088](../decisions/0088-turn-and-time-limits.md)). The job ends `stuck`, and the report names what was tried.
- The same item failing its check three rounds stops work on that item; the report names which role is needed and for what ([line engine](line-engine.md)).

### 5.4 Pausing for the usage limit

- When the subscription's usage limit is reached, Claude Code reports rate-limit retries. The agent runner tells the queue, which pauses all agent work until the limit resets, and the report says so ([models and cost](../architecture/models-and-cost.md)).
- Running sessions are stopped cleanly and their jobs return to `queued`.
- The page shows the pause and the expected reset time.
- The queue resumes by itself at the reset time. A reset time that is missing, not a date, or already past is replaced by `queue.usage_pause_fallback_minutes` from now.
- premise never turns on paid extra usage ([0100](../decisions/0100-floor-actions.md)).

### 5.5 Pausing for a budget overrun

- premise sets per-software budgets in usage-ledger, which is a mock until it exists ([0133](../decisions/0133-usage-ledger-is-mocked-until-it-exists.md)). When usage-ledger reports one overrun, premise pauses that software's queue and tells the operator ([0064](../decisions/0064-cost-and-spending-limit-from-usage-ledger.md), [usage and budgets](usage.md)).
- The software's state becomes `paused-budget`. Its asks stay answerable; no new agent job starts for it, and a session already running finishes. Other softwares keep running.
- While a software's budget is being looked at after a job changed, the queue starts nothing for it (so no extra job slips in).
- The operator answers: raise the budget (the software is active again), let it finish the current change (only jobs of that piece of work start), or leave it paused ([0200](../decisions/0200-how-cost-and-the-spending-limit-are-built.md)).
- The paused state survives a restart. If usage-ledger cannot be read, nothing is paused for want of an answer; the turn and time limits ([0088](../decisions/0088-turn-and-time-limits.md)) still stop runaway sessions and are not cost tracking.

### 5.7 Pausing everything, stopping cleanly, and the computer sleeping

Decision [0290](../decisions/0290-pausing-and-resuming-the-whole-of-premise.md).

- **Pause everything.** The queue's stored state holds `paused`, a cause (`person`, `setting` for `queue.start_paused`, or `usage-limit`), for the person's pause the choice for running sessions (`finish` or `stop-now`), and when it was paused. While paused nothing starts, in any software, agent jobs and `run` jobs alike; asks stay answerable and an answer puts its job back in the queue. `finish` leaves running sessions to end; `stop-now` stops them and puts their jobs back with a note that their unfinished work is redone. Only a `usage-limit` pause has a reset time and ends by itself; a usage limit reached during another pause leaves that pause as it was. Resume clears any of them.
- **At start.** A stored pause stays (premise starts paused and says so). With `queue.start_paused` set and no pause stored, premise pauses with cause `setting`. Otherwise it resumes as before. The start says in one line what it picked up (the jobs cut off and put back, asks waiting on a person, the pause, built softwares that stopped with premise).
- **Stopping.** A clean stop (Ctrl+C once, `premise stop`; asking again changes nothing) sets an in-memory flag: nothing new starts, running jobs are left to end, and premise closes when none is running. The flag is not stored. Stopping now (a second Ctrl+C, a termination signal, `premise stop --now`) stops every running session and puts its job back, with a note, before closing; the jobs cut off are written down so the next start can name them.
- **Status.** The queue reports what is paused, which jobs are still running (agent sessions and `run` jobs) and whether closing now loses nothing (none running).
- **After the computer sleeps.** When the clock has jumped by more than `queue.suspend_gap_seconds` beyond a tick, premise asks each running session whether it is alive. A session that says no is ended, even if it never reports, and its job goes back to the queue and starts again, carried on where the runtime can. A runtime that cannot say is taken as alive.

### 5.6 Working copies

- When a job ends, its working copy is removed, unless its branch holds unmerged work that is still wanted (a build waiting for its check), or `data.keep_finished_working_copies` is set ([storage](storage.md)).
- A branch with unmerged work is never deleted by the queue; deleting it is a floor action ([gate](gate.md)).

## 6. Configuration

| Key | Default | Meaning |
|---|---|---|
| `queue.max_agent_sessions` | 2 | Agent sessions running at once ([0074](../decisions/0074-two-agent-sessions-at-once.md), [0132](../decisions/0132-sensible-things-are-configurable.md)) |
| `queue.same_failure_limit` | 3 | Same failures before a task stops |
| `queue.start_paused` | false | Always start paused ([0290](../decisions/0290-pausing-and-resuming-the-whole-of-premise.md)) |
| `queue.suspend_gap_seconds` | 90 | A clock jump beyond a tick that counts as the computer having slept ([0290](../decisions/0290-pausing-and-resuming-the-whole-of-premise.md)) |
| `queue.usage_pause_fallback_minutes` | 60 | How long to wait before trying again when the reset time is not known |
| `queue.fair_wait_minutes` | 30 | How long a software with startable work waits behind more important ones before it gets the next free slot ([0197](../decisions/0197-how-several-softwares-at-once-is-built.md)) |

## 7. Limits

- The queue lives in one process and one database ([0067](../decisions/0067-one-process-agents-as-children.md), [0072](../decisions/0072-sqlite-state.md)).
- It does not schedule by cost; usage-ledger's budgets are the only cost control ([0064](../decisions/0064-cost-and-spending-limit-from-usage-ledger.md)).

## 8. Failure modes and recovery

| Failure | Detection | Effect | Recovery |
|---|---|---|---|
| premise stops mid-job | `running` rows at start | Sessions lost | 5.2 |
| A job loops on the same failure | Failure signature | Stopped at three | Reported as stuck |
| Usage limit reached | Rate-limit events from Claude Code | All agent work paused | Resumes after the reset; the report says so |
| usage-ledger unreachable after milestone 2 | Calls to it fail | Budgets cannot be checked | Agent work continues under the turn and time limits; the report says that cost could not be read, and "Needed" names it |
| A waiting ask is never answered | Ask stays open | Only its job waits | It stays on the "needed" list |

## 9. Security considerations

- Stopping a job stops its session and revokes its tool token ([agent tools](agent-tools.md)).
- The queue never takes a floor action; it only removes working copies that hold nothing unmerged.

## 10. Observability

- Every status change is an event. The page shows the queue: running, waiting (and on what), queued, paused (and why).
- Reports count jobs per kind, stuck jobs, and pauses.

## 11. Milestones

- Milestone 1 step 1: the proof of the usage-limit pause (point 6 of step 1, [roadmap](../product/roadmap.md)): rate-limit events pause the work and it resumes after the reset; if the limit cannot be reached safely, the pause is shown with a simulated event.
- Milestone 1 step 2: the work queue that survives a restart; two sessions; three-strike rule; usage-limit pause.
- Milestone 1 step 2: a software stopped at a milestone wait is not startable.
- Milestone 2 (against usage-ledger's mock until it exists, [0133](../decisions/0133-usage-ledger-is-mocked-until-it-exists.md)): per-software budget pause; effort as a share of weekly usage.
- Milestone 4: `triage` and `reading` jobs.
- Milestone 1 (foundation): the queue that survives a restart, the session limit, priority between softwares, the three-strike rule and the usage-limit pause, with the scripted agent.
- Milestone 7, built: fair sharing between several softwares, the operator's pause and archive ([0197](../decisions/0197-how-several-softwares-at-once-is-built.md)).
