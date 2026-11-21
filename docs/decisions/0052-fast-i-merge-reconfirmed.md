# 0052. How changes to premise ship, reconfirmed

- Status: Partly superseded by [0131](0131-changes-go-through-the-validation-pipeline.md): that a change goes to a pull request with no automated review-and-test run; the assistant still merges
- Scope: Making premise
- Date: 2026-11-21
- Decided by: The owner, agreeing to the assistant's recommendation (call 10): "10, 11, 12, I agree."
- Source: Old docs/decisions.md entry 52, which quotes the owner from the assistant's notes of the 2026-11-21 conversations; those notes are not kept in this repository.

## Context

- The assistant asked fourteen numbered calls (records 0043–0056), each with a recommendation, so that premise can be built without the owner ([0042](0042-plan-top-down-settle-owner-calls-first.md)).
- The owner's whole answer: "1, 2, 3, I agree / 4, 5, 6, I agree. My susbcription can be used. Spending limit: maybe we build usage-ledger and depend on it to make it easier. / 7: no, because premise is agnostic to what we are building completely. Could be webapps, servers, desktop apps, utilities, or even Aras customizations, anything that's not dependent on setup too much. / 8, 9, I agree. Public or private. / 10, 11, 12, I agree. / 13, License all rights reserved. / 14, I agree."
- The reasons the assistant gave with its recommendations were not kept, so the records the owner agreed to say "No reason was recorded."

## Decision

- Changes to premise go as direct pull requests, merged by the assistant.
- This repeats [0040](0040-fast-i-merge.md).

## Reason

- No reason was recorded. Owner: "10, 11, 12, I agree."

## Alternatives considered

| Alternative | Why rejected |
| --- | --- |
| None recorded | No alternative was put to the owner or recorded. |

## Consequences

- Every milestone's changes ship this way ([roadmap](../product/roadmap.md)).

- **Partly superseded by** [0131](0131-changes-go-through-the-validation-pipeline.md): every change now goes through the no-mistakes validation pipeline; the assistant still merges.

## Related

[0040](0040-fast-i-merge.md), [0053](0053-when-work-stops-for-the-owner.md), [how premise is being made](../how-we-work.md).
