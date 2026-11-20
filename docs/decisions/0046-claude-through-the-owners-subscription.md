# 0046. Claude through the owner's subscription first

- Status: Accepted
- Scope: The plan
- Date: 2026-11-21
- Decided by: The owner, agreeing to the assistant's recommendation (call 4): "4, 5, 6, I agree. My susbcription can be used."
- Source: Old docs/decisions.md entry 46, which quotes the owner from the assistant's notes of the 2026-11-21 conversations; those notes are not kept in this repository.

## Context

- The assistant asked fourteen numbered calls (records 0043–0056), each with a recommendation, so that premise can be built without the owner ([0042](0042-plan-top-down-settle-owner-calls-first.md)).
- The owner's whole answer: "1, 2, 3, I agree / 4, 5, 6, I agree. My susbcription can be used. Spending limit: maybe we build usage-ledger and depend on it to make it easier. / 7: no, because premise is agnostic to what we are building completely. Could be webapps, servers, desktop apps, utilities, or even Aras customizations, anything that's not dependent on setup too much. / 8, 9, I agree. Public or private. / 10, 11, 12, I agree. / 13, License all rights reserved. / 14, I agree."
- The reasons the assistant gave with its recommendations were not kept, so the records the owner agreed to say "No reason was recorded."

## Decision

- premise uses Claude through the owner's subscription first.
- Other model providers come later.

## Reason

- No reason was recorded. Owner: "4, 5, 6, I agree. My susbcription can be used."

## Alternatives considered

| Alternative | Why rejected |
| --- | --- |
| None recorded | No alternative was put to the owner or recorded. |

## Consequences

- How the subscription is used, and its limits: [models and cost](../architecture/models-and-cost.md), [0071](0071-headless-claude-code-agents.md), [0076](0076-own-claude-code-configuration.md), [0103](0103-subscription-only-for-the-owner.md).
- Other providers come through the agent runner only ([0107](0107-one-part-knows-the-runtime.md)); model providers other than Claude are later ([roadmap](../product/roadmap.md)).

## Related

[0103](0103-subscription-only-for-the-owner.md), [0104](0104-model-tier-by-role.md).
