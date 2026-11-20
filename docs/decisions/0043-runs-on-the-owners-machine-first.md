# 0043. premise runs on the owner's machine first

- Status: Accepted
- Scope: The plan
- Date: 2026-11-21
- Decided by: The owner, agreeing to the assistant's recommendation (call 1): "1, 2, 3, I agree".
- Source: Old docs/decisions.md entry 43, which quotes the owner from the assistant's notes of the 2026-11-21 conversations; those notes are not kept in this repository.

## Context

- The assistant asked fourteen numbered calls (records 0043–0056), each with a recommendation, so that premise can be built without the owner ([0042](0042-plan-top-down-settle-owner-calls-first.md)).
- The owner's whole answer: "1, 2, 3, I agree / 4, 5, 6, I agree. My susbcription can be used. Spending limit: maybe we build usage-ledger and depend on it to make it easier. / 7: no, because premise is agnostic to what we are building completely. Could be webapps, servers, desktop apps, utilities, or even Aras customizations, anything that's not dependent on setup too much. / 8, 9, I agree. Public or private. / 10, 11, 12, I agree. / 13, License all rights reserved. / 14, I agree."
- The reasons the assistant gave with its recommendations were not kept, so the records the owner agreed to say "No reason was recorded."

## Decision

- premise runs on the owner's machine first.
- Hosting comes later, together with other people setting premise up.

## Reason

- No reason was recorded. Owner: "1, 2, 3, I agree".

## Alternatives considered

| Alternative | Why rejected |
| --- | --- |
| None recorded | No alternative was put to the owner or recorded. |

## Consequences

- Item 7 of [0033](0033-answers-to-the-ten-assumptions.md): other people setting premise up comes sooner than the other later items.
- Where it runs and how people reach it: [where it runs](../architecture/where-it-runs.md); hosting is milestone 5 ([roadmap](../product/roadmap.md)).

## Related

[0033](0033-answers-to-the-ten-assumptions.md), [0079](0079-localhost-only.md).
