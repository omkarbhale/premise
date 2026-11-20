# 0053. When work stops for the owner

- Status: Accepted
- Scope: Making premise
- Date: 2026-11-21
- Decided by: The owner, agreeing to the assistant's recommendation (call 11): "10, 11, 12, I agree."
- Source: Old docs/decisions.md entry 53, which quotes the owner from the assistant's notes of the 2026-11-21 conversations; those notes are not kept in this repository.

## Context

- The assistant asked fourteen numbered calls (records 0043–0056), each with a recommendation, so that premise can be built without the owner ([0042](0042-plan-top-down-settle-owner-calls-first.md)).
- The owner's whole answer: "1, 2, 3, I agree / 4, 5, 6, I agree. My susbcription can be used. Spending limit: maybe we build usage-ledger and depend on it to make it easier. / 7: no, because premise is agnostic to what we are building completely. Could be webapps, servers, desktop apps, utilities, or even Aras customizations, anything that's not dependent on setup too much. / 8, 9, I agree. Public or private. / 10, 11, 12, I agree. / 13, License all rights reserved. / 14, I agree."
- The reasons the assistant gave with its recommendations were not kept, so the records the owner agreed to say "No reason was recorded."

## Decision

- Work stops for the owner only on destructive, security-sensitive, public-facing (making something public, publishing, sending messages as the owner) or money-spending actions.
- Everything else proceeds and is reported.

## Reason

- No reason was recorded. Owner: "10, 11, 12, I agree."

## Alternatives considered

| Alternative | Why rejected |
| --- | --- |
| None recorded | No alternative was put to the owner or recorded. |

## Consequences

- It holds for building premise; the gate holds the same rule for the software premise builds ([0101](0101-the-gate-asks-in-the-session.md)).
- Being reached from other machines is security-sensitive, so it waits for the owner ([0079](0079-localhost-only.md), [where it runs](../architecture/where-it-runs.md)).

## Related

[0056](0056-what-is-on-the-floor.md), [0054](0054-reports-to-the-owner.md), [roadmap](../product/roadmap.md).
