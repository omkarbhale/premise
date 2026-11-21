# 0197. How looking after several softwares at once is built

- Status: Accepted
- Scope: Milestone 7 (several softwares at once; keeping software live on public hosts stays later)
- Date: 2026-11-21
- Decided by: The builders; three points chosen for the owner, open to correction ([0136](0136-open-questions-chosen-for-the-owner.md)).
- Source: The roadmap's milestone 7 ("several softwares at once, sharing the work queue fairly, with a report per software and one summary"), [0033](0033-answers-to-the-ten-assumptions.md) item 6, [0128](0128-effort-per-software-and-milestone-waits.md) and [0138](0138-priority-is-a-field-from-milestone-1.md) (priority between softwares), [0074](0074-two-agent-sessions-at-once.md) (the session limit).

## Context

- Priority between softwares already ordered the work queue ([0138](0138-priority-is-a-field-from-milestone-1.md)), but strictly: a less important software could wait for as long as a more important one had work. The page listed softwares by priority only, the report was one per software, and a software could not be paused, archived or restored.
- The plan did not settle how "fairly" works, what "since you last looked" is measured from, when a software may be archived, or what limits the number of softwares running at once on one machine.

## Decision

- **Sharing the sessions.** The configured number of agent sessions (`queue.max_agent_sessions`) is shared between softwares with startable work: the most important first, by priority; among equally important ones, the one with fewer sessions running, then the one whose last start was longest ago. A software that has waited `queue.fair_wait_minutes` (30) for a session without one, behind more important softwares, gets the next free session, the longest-waiting first, and the event `fair-turn` records it. So no software waits indefinitely, and priority still decides while the waits are short. Within one software the order is unchanged (what a person waits to see, then checks, then builds).
- **What frees sessions.** A job waiting on a person holds no session (a session ends when it asks); a software that is paused, archived, stopped at a milestone, or paused for its budget starts nothing. Pausing stops its running sessions and puts their jobs back in the queue, to carry on where they stopped when it resumes.
- **Pausing** is the operator's, kept apart from the line's own states (two columns on `softwares`, schema 12): the software keeps its stage and its line, its asks stay answerable, and the page says "Paused by you".
- **Archiving** keeps everything and hides the software from the main list and from "Waiting on you"; it can be restored as it was. It is allowed when the software is finished (at the end of the line with no work left), ended, or paused by the operator (abandoned); otherwise premise says to pause it first. Archiving stops its running copy. Nothing in premise deletes a software: deleting one would be a floor action through the gate, and is not built.
- **The summary across softwares** is built from recorded facts only (each software's state as the line keeps it, its open asks, its running copy, and the events), never by an agent: one sentence first, what waits on you, what changed per software since you last looked, and every software with its phase, what it is doing and its priority. "Since you last looked" is the newest event the summary showed when you last left it; the page sends that back.
- **The page** lists softwares with what needs you first, then the ones working, then paused, then finished, each by priority; each shows its phase, what it is doing now, and a "Waiting on you" or "Paused" mark. The link keeps the software, the view and the tab, so a refresh keeps your place. "Summary" appears in the navigation once there are two softwares. Priority, Pause or Resume, and Archive (after a confirm) sit under the software's name.
- **The runner** keeps several softwares running at once, each on its own port of `runner.port_range`. It refuses to start one more, saying which ones run and which setting to change, when `runner.max_running_softwares` (5) already run, or when the machine has less free memory than `runner.min_free_memory_mb` (256). It already said so when every port of the range is taken.

### Chosen for the owner

- Priority decides first, and turns are taken only within one priority or after the fair wait; the alternative, plain turn-taking, would let a least-important software take a session from the most important one at once.
- Thirty minutes as the fair wait, five softwares running at once, and 256 MB of free memory kept: each a setting.
- Archiving is allowed only for finished, ended or paused softwares, so a working software is never hidden by mistake.

## Reason

- No reason was recorded by the owner. Builders' reasons: the owner made priority a field that orders the queue ([0138](0138-priority-is-a-field-from-milestone-1.md)), so it should keep deciding; the fair wait bounds how long any software waits, which is what "fairly" needs. A summary built from recorded facts follows [0097](0097-reports-from-recorded-facts.md). Never deleting keeps archiving safe to do in one click.

## Alternatives considered

| Alternative | Why rejected |
| --- | --- |
| Plain turn-taking between softwares, whatever their priority | Priority would stop meaning anything while every software has work. |
| Strict priority only | A less important software could wait forever behind a long piece of work. |
| Weighted shares by priority | Harder to explain in one sentence on the page; the fair wait gives the same guarantee. |
| "Since you last looked" from the last page visit | A visit to one software is not a look at all of them; the summary's own mark is exact. |
| Deleting a software from the page | Destructive; deletion stays behind the gate and is not built. |

## Consequences

- Carried in the [work queue](../specs/work-queue.md), [reporter](../specs/reporter.md), [runner](../specs/runner.md), [page](../specs/page.md) and [storage](../specs/storage.md) specs, and the [configuration reference](../reference/configuration.md).
- Code: `src/queue/work-queue.ts` (sharing), `src/portfolio/` (pause, archive, order), `src/reporter/summary.ts`, `src/runner/runner.ts` (machine limits), and the page.

## Related

[0074](0074-two-agent-sessions-at-once.md), [0097](0097-reports-from-recorded-facts.md), [0128](0128-effort-per-software-and-milestone-waits.md), [0138](0138-priority-is-a-field-from-milestone-1.md), [0162](0162-how-the-runner-is-built.md), [0178](0178-hosting-for-others-accounts-and-public-deployment-pushed-later.md).
