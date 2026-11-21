# 0164. How the reporter builds a report, and what counts as a fact

- Status: Accepted
- Scope: Making premise
- Date: 2026-11-22
- Decided by: The builders, while building the reporter. The owner did not make these choices.
- Source: [reporter](../specs/reporter.md), [0097](0097-reports-from-recorded-facts.md), [0098](0098-report-when-a-change-reaches-running.md), [0123](0123-reporter-drafts-release-notes.md).

## Context

- The reporter's specification names its sources (check verdicts, job outcomes, runs, usage) but the checker is not built yet, and the wording of a report is left to the builders.

## Decision

Each is a builders' choice, open to correction:

1. **A report is a function of facts.** Facts are gathered from the record and its commits, the check verdicts, the runs, the work queue, the open questions and the usage figures, and the report is built from them with no other input. The same facts always give the same report.
2. **The wording is the facts' own.** No agent rewrites the report in this version. The spec's reporter agent, which only words and orders the facts, can be added later without changing what the report may say.
3. **Every line carries the fact it rests on** (a record item, a commit, a run, a job, a question or a check). A test fails on a line without one.
4. **A check verdict is an event.** The checker will record `module: checker`, `kind: verdict`, `reference: <item>`, `detail: { verdict: met | not-met | could-not-check, evidence, commit? }`. The latest verdict per item counts, but only for the version it names: a verdict recorded for an older commit than the one reported on is listed as not checked at this version, with the result it had there. A verdict with no commit counts for any version.
5. **Not known is not good.** A live "what it must do" item with no verdict is listed as not checked, with the words "No check has looked at it". A report never lists an item as working without a verdict that says so.
6. **The short report is a limit on lines, not on honesty.** It holds at most `reports.max_lines` lines. When it must leave lines out, it keeps what is needed from people first, then what failed or was not checked, then what runs, then what was decided; it says how many lines are left out. "Show more detail" shows them all, with the recent changes.
7. **When it is written.** The reporter writes and keeps a report when asked to, with a trigger (a change reached running, a milestone, the line ended at "do not build", work stopped, paused). The view is always built from the facts as they are now and says when a report was last written. A milestone report names the milestone and otherwise follows the same rules.
8. **Release notes are drafted, not committed.** For a change that reached running, the notes list the "what it must do" items its commits served whose verdict is met at that commit. They are stored with the report; committing them to the repository is the runner's step, filed for later.
9. **Limits are said.** Every report says the checker shares the builder's kind of AI, says when no check has been recorded, and says when cost figures could not be read or are mocked.

## Reason

- A report that can only repeat recorded facts cannot be false in the way self-reports were ([0097](0097-reports-from-recorded-facts.md)).

## Alternatives considered

| Alternative | Why rejected |
| --- | --- |
| An agent writing the report from the facts | Not needed to be honest, and costs a session; the facts' own wording is clear enough to start with. |
| Leaving unchecked items out of the report | It would read as if they worked. |

## Consequences

- The line engine and the checker write the events and call the reporter; see the [reporter](../specs/reporter.md) specification.

## Related

[0097](0097-reports-from-recorded-facts.md), [0098](0098-report-when-a-change-reaches-running.md), [0162](0162-how-the-runner-is-built.md).
