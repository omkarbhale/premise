# 0245. A report is about one named version, and a check counts only for that version

- Status: Accepted
- Scope: Milestone 1
- Date: 2026-11-21
- Decided by: The builders; chosen for the owner by the assistant during validation, open to the owner's correction.
- Source: Validation of the reporter and the check ([0164](0164-how-the-reporter-is-built.md), [0186](0186-how-build-check-and-run-are-built.md), [0220](0220-approvals-and-verdicts-tell-the-truth.md)); [0097](0097-reports-from-recorded-facts.md).

## Context

- A software changes: after a check there may be a newer version, and what is running may be older than either. A report that mixes them can say "works" about code nobody checked.

## Decision

1. **Every report is about one version** (one commit) and says which. By default it is the latest; a report can be asked for about another version.
2. **A check counts only for the version it was made on.** A verdict made on an earlier version is shown as "not checked at this version", with what the earlier result was, and is never counted as met or not met for this one.
3. **The exception is the same code.** A verdict on a version whose code is the same as the latest (only merges or record changes came after it) holds for the latest ([0220](0220-approvals-and-verdicts-tell-the-truth.md) point 9).
4. **What is running is named separately.** When the report is about a newer version than the one last started, it says so and does not describe the running software as if it were that version.

## Reason

- Builders' note: reports come from recorded facts only ([0097](0097-reports-from-recorded-facts.md)); a fact about one version is not a fact about another. Saying which version a statement is about is the cheapest way to keep a report from saying something false.
- Chosen for the owner: a person reading "works" will try the software as it runs now; the word has to be about that.

## Alternatives considered

| Alternative | Why rejected |
| --- | --- |
| Carry the last verdict forward to every later version | A later change may break what an earlier check showed working. |
| Count only checks on the very latest commit, even when the code is the same | A merge or a record change would make everything "not checked" for no reason. |

## Consequences

- The report shows the version it is about; a check made earlier is listed as not checked at this version until the check runs again.

## Related

[0097](0097-reports-from-recorded-facts.md), [0164](0164-how-the-reporter-is-built.md), [0220](0220-approvals-and-verdicts-tell-the-truth.md), [reporter spec](../specs/reporter.md).
