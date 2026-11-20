# 0049. Any kind of software; no first kind

- Status: Accepted
- Partly supersedes: [0033](0033-answers-to-the-ten-assumptions.md): item 8's "The first version proves itself on one kind the owner chooses"
- Scope: The product
- Date: 2026-11-21
- Decided by: The owner (call 7): "7: no, because premise is agnostic to what we are building completely. Could be webapps, servers, desktop apps, utilities, or even Aras customizations, anything that's not dependent on setup too much."
- Source: Old docs/decisions.md entry 49, which quotes the owner from the assistant's notes of the 2026-11-21 conversations; those notes are not kept in this repository.

## Context

- The assistant asked fourteen numbered calls (records 0043–0056), each with a recommendation, so that premise can be built without the owner ([0042](0042-plan-top-down-settle-owner-calls-first.md)).
- The owner's whole answer: "1, 2, 3, I agree / 4, 5, 6, I agree. My susbcription can be used. Spending limit: maybe we build usage-ledger and depend on it to make it easier. / 7: no, because premise is agnostic to what we are building completely. Could be webapps, servers, desktop apps, utilities, or even Aras customizations, anything that's not dependent on setup too much. / 8, 9, I agree. Public or private. / 10, 11, 12, I agree. / 13, License all rights reserved. / 14, I agree."
- The reasons the assistant gave with its recommendations were not kept, so the records the owner agreed to say "No reason was recorded."

## Decision

- premise is not built around one first kind of software.
- It is agnostic to the kind.

## Reason

- Owner: "7: no, because premise is agnostic to what we are building completely. Could be webapps, servers, desktop apps, utilities, or even Aras customizations, anything that's not dependent on setup too much."

## Alternatives considered

| Alternative | Why rejected |
| --- | --- |
| Proving the first version on one kind of software first ([0033](0033-answers-to-the-ten-assumptions.md), item 8; the assistant's call 7) | The owner: premise is agnostic to what is built. |

## Consequences

- Replaces item 8 of [0033](0033-answers-to-the-ten-assumptions.md) where it said the first version proves itself on one kind the owner chooses.
- **Changed later:** "not dependent on setup too much" stays out of the vision ([0057](0057-vision-stays-any-software.md)).
- Milestone 1 shows two softwares of different kinds ([0110](0110-two-sample-softwares.md)).

## Related

[0031](0031-the-product-is-general.md), [0057](0057-vision-stays-any-software.md), [0060](0060-first-software-does-not-hold-up-premise.md).
