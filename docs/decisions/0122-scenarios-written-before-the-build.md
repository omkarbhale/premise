# 0122. Check scenarios are written from the record before the build

- Status: Accepted
- Scope: The plan
- Date: 2026-11-21
- Decided by: The builders, in the documentation restructure of 2026-11-21. The owner did not make this choice.
- Source: The documentation restructure of 2026-11-21, writing the [checker prompt](../prompts/checker.md).

## Context

- The checker writes its scenarios from the record into premise's data folder, where builders cannot read them ([0090](0090-scenarios-out-of-the-builders-reach.md)).
- The checker is a fresh session that never sees the builder's transcript, summary or claims ([0089](0089-checker-in-a-fresh-session.md)).
- Old `docs/plan.md` does not say when the scenarios are written: before the build, or at check time with the built software in front of the checker.

## Decision

- Scenarios are written in their own check job, from the record only, as soon as the working plan names the items a change serves and before any build task for that change starts.
- When the record items change, the scenarios for them are written again, still from the record.
- The check job that judges a commit is a separate fresh session. It runs the scenarios written earlier and may add scenarios for plainly wrong behaviour no item names, reported as findings.

## Reason

- Scenarios written while looking at the built software can fit what was built rather than what was wanted; written from the record first, they cannot.
- "Agents game the checks they can touch" ([0030](0030-independent-check.md)); scenarios that exist before the build also cannot be influenced by anything the builder does.

## Alternatives considered

| Alternative | Why rejected |
| --- | --- |
| Write the scenarios at check time, in the same session that checks | The checker would write them with the running software in view and could fit them to it, which weakens the check against intent. |
| Have the planner write acceptance scenarios into the plan | The plan is a working record the builder reads ([0086](0086-working-copy-and-branch-per-change.md)); scenarios there would be within the builder's reach, against [0090](0090-scenarios-out-of-the-builders-reach.md). |

## Consequences

- Each change has two checker sessions: one writing scenarios before the build, one checking the commit.
- A record change after scenarios were written triggers new scenarios before the next check.
- The checker's prompt has a scenario brief and a check brief ([checker prompt](../prompts/checker.md)).

## Related

[0030](0030-independent-check.md), [0089](0089-checker-in-a-fresh-session.md), [0090](0090-scenarios-out-of-the-builders-reach.md), [0113](0113-agent-roles.md), [checker prompt](../prompts/checker.md), [build, check and run](../architecture/build-check-run.md).
