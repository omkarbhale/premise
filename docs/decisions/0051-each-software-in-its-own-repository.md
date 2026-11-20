# 0051. Each software in its own repository

- Status: Accepted
- Scope: The plan
- Date: 2026-11-21
- Decided by: The owner, agreeing to the assistant's recommendation (call 9): "8, 9, I agree. Public or private."
- Source: Old docs/decisions.md entry 51, which quotes the owner from the assistant's notes of the 2026-11-21 conversations; those notes are not kept in this repository.

## Context

- The assistant asked fourteen numbered calls (records 0043–0056), each with a recommendation, so that premise can be built without the owner ([0042](0042-plan-top-down-settle-owner-calls-first.md)).
- The owner's whole answer: "1, 2, 3, I agree / 4, 5, 6, I agree. My susbcription can be used. Spending limit: maybe we build usage-ledger and depend on it to make it easier. / 7: no, because premise is agnostic to what we are building completely. Could be webapps, servers, desktop apps, utilities, or even Aras customizations, anything that's not dependent on setup too much. / 8, 9, I agree. Public or private. / 10, 11, 12, I agree. / 13, License all rights reserved. / 14, I agree."
- The reasons the assistant gave with its recommendations were not kept, so the records the owner agreed to say "No reason was recorded."

## Decision

- Each software premise builds gets its own repository on the owner's GitHub account, public or private.

## Reason

- No reason was recorded. Owner: "8, 9, I agree. Public or private."

## Alternatives considered

| Alternative | Why rejected |
| --- | --- |
| None recorded | No alternative was put to the owner or recorded. |

## Consequences

- **Left open then:** who chooses the visibility, and the default. Settled in [0059](0059-repository-visibility-per-software.md).
- The software's lasting record lives in its repository ([0080](0080-record-in-the-softwares-repository.md)); only the server creates repositories and pushes ([0077](0077-github-through-existing-cli-login.md)).

## Related

[0059](0059-repository-visibility-per-software.md), [0081](0081-nothing-about-people-in-the-repository.md).
