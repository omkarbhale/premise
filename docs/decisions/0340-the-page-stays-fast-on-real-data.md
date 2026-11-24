# 0340. The page stays fast on real data

- Status: Accepted
- Scope: Making premise
- Date: 2026-11-24
- Decided by: The builders, after the owner said "premise's web app feels extremely slow in all terms, how fast data loads and stuff"
- Source: A profile of premise on a copy of the owner's data (3 softwares, about 150 jobs, 5,000 events), where the overview and the activity took about 3 seconds each on every reload.
- Numbered apart from the records being written at the same time by other tasks.

## Context

- The page reloads the overview, the activity and every open panel each time something happens. Agents send progress lines several times a second, so the page reloaded about once every 60 ms while work ran.
- Each job shown on the page names the record items it serves, with their words. Those words were read from the software's repository through git: one git program per file of the record, for every job shown, on every reload. Git was run by waiting for it, so while it ran premise answered nothing else, not even other pages. That was nearly all of the 3 seconds.
- The list of softwares read every job ever run, and was worked out three times for one overview.
- The event log had no index, so finding a job's latest progress line read the whole log.
- usage-ledger's figures were already read in the background, so a page never waited on it.

## Decision

1. **The record is kept in memory until it changes.** What premise read of a software's record at the latest commit is kept, and read again only when the repository's latest commit moves. Whether it moved is told from git's own files, without running git. A linked working copy, where that cannot be told, is read afresh as before.
2. **One reload does each thing once.** Record words, open questions and progress lines are read once for all the jobs on the page, not once per job; the list of softwares is worked out once per reload, and reads only the jobs that are running or queued.
3. **The event log and the jobs have indexes** for what the page reads (an added migration; nothing is changed or removed).
4. **The page reloads at most once a second while work runs** (`page.live_update_ms`, default 1000), and not at all while its tab is hidden; it catches up when shown again. What the person does on the page shows at once.
5. **A test guards it:** on a database with thousands of jobs and tens of thousands of events, the overview, activity, summary and software list run no git once read, and answer well within a second (test/page-speed.test.ts).

## Reason

- The owner uses premise for real on real data, and it must feel instant. Every page reload went through the slowest path premise has (a program per file per job), and it held up everything else while it ran.
- Keeping the record until the latest commit moves is exact: the record's words are wholly given by that commit.
- Once a second is fast enough to watch work move, and does not spend the machine on reloads nobody can read.

## Alternatives considered

| Alternative | Why not |
|---|---|
| Run git without waiting for it | Still a program per file per job on every reload; faster to not run it at all when nothing changed |
| Keep the record until premise itself commits | Commits made by a build, a merge or by hand would leave stale words on the page |
| Push changed data with each event instead of reloading | A much larger change to the page and the server; reloading less often and answering fast is enough for now |

## Consequences

- The overview and activity answer in tens of milliseconds on the owner's data, down from about 3 seconds.
- `page.live_update_ms` is in the configuration reference.

## Related

- [0070](0070-http-and-server-sent-events.md), [0158](0158-the-event-stream-reads-the-events-table.md), [0310](0310-answers-are-never-lost-and-the-work-is-visible.md), [0320](0320-a-timeline-of-the-line.md), [0330](0330-real-sessions-read-the-real-usage-ledger.md).
