# 0165. The page shows three phases, with the eleven stages as detail

- Status: Accepted
- Scope: The page
- Date: 2026-11-21
- Decided by: The builders, implementing the owner's agreement to a suggestion. The owner: "I agree on 6".
- Source: The suggestion that a person should see three phases, not eleven stages; the task that built it.

## Context

- The line has eleven stages ([the line](../architecture/the-line.md)). Showing all eleven everywhere asks a newcomer to learn their names before they can tell where their software is.

## Decision

- The page groups the stages into three phases: **Understand** (why, who, what exists, what, say back, plan), **Build** (build, check) and **Running** (run, report, intake).
- Wherever the page shows where a software is (software list, software header, line view, activity, questions), it leads with the phase in plain words and what is happening now ("Understanding what you want: drafting who it is for"). The stage name is secondary detail.
- The line view lists the three phases; opening one shows its stages. The current phase is open.
- A stage that was not needed is not shown as pending or failed: stages not yet reached say "Comes later", stages passed say "passed".
- The mapping from stage to phase is a small pure function in shared code (`phaseOf` in `src/shared/stages.ts`). No service interface changed.
- Help and first-run text explain the three phases in a sentence each and need no stage names.

## Reason

- Three phases fit in a person's head; the owner agreed. The stages stay one open click away for whoever wants them.

## Alternatives considered

| Alternative | Why rejected |
| --- | --- |
| Show the eleven stages as before | The owner agreed three phases are clearer. |
| Replace the stages with phases in the service | Another task is replacing the stand-in line behind those interfaces; the page must not touch them. |

## Consequences

- Page text and tests changed; the stage list in the service is untouched.
- Skipped stages are not marked by the service yet, so the page cannot say "not needed" for a particular stage; it only avoids calling it pending or failed.

## Related

[0156](0156-page-tests-with-testing-library-and-one-browser-test.md).
