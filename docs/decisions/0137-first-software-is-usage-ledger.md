# 0137. The first software through premise is usage-ledger

- Status: Accepted, chosen for the owner; open to the owner's correction
- Scope: The plan
- Date: 2026-11-21
- Decided by: The assistant, for the owner, on the owner's instruction "choose for me" ([0136](0136-open-questions-chosen-for-the-owner.md)). Open to the owner's correction.
- Source: [The owner's instruction of 2026-11-21 that started the build](../record/instruction-2026-11-21-build-starts.md); [open questions](../open-questions.md) as they stood before it.

## Context

- The first software through premise is one the owner needs, as early as possible ([0127](0127-first-software-is-one-the-owner-needs.md)); it was the owner's pick ([0050](0050-first-software-is-the-owners-pick.md)) and open.
- premise depends on usage-ledger for cost and the spending limit ([0064](0064-cost-and-spending-limit-from-usage-ledger.md)), and mocks it until it exists ([0133](0133-usage-ledger-is-mocked-until-it-exists.md)).

## Decision

- The first software through premise is usage-ledger.
- It goes through with real agents when the owner allows real agent work on the owner's Claude login ([0134](0134-the-owners-claude-login-only-when-strictly-necessary.md)). Until then, demos use the scripted agent.

## Reason

- The owner needs it: the owner named it as what cost and the spending limit should come from.
- premise depends on it, so building it through premise also replaces premise's own mock.

## Alternatives considered

| Alternative | Why rejected |
| --- | --- |
| entail, or another of the owner's projects | Rebuilding an existing project is milestone 6's work (existing software); usage-ledger is new. |
| A sample software only | [0127](0127-first-software-is-one-the-owner-needs.md): the first is one the owner needs; the samples stay as extra proof. |

## Consequences

- Answers the open question of which software goes first ([open questions](../open-questions.md)).
- Running it with real agents is a use of the owner's login that waits for the owner's word.

## Related

[0050](0050-first-software-is-the-owners-pick.md), [0110](0110-two-sample-softwares.md), [0127](0127-first-software-is-one-the-owner-needs.md), [0133](0133-usage-ledger-is-mocked-until-it-exists.md).
