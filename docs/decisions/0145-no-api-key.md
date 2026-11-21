# 0145. No API key is used

- Status: Accepted, chosen for the owner; open to the owner's correction
- Scope: The plan
- Date: 2026-11-21
- Decided by: The assistant, for the owner, on the owner's instruction "choose for me" ([0136](0136-open-questions-chosen-for-the-owner.md)). Open to the owner's correction.
- Source: [The owner's instruction of 2026-11-21 that started the build](../record/instruction-2026-11-21-build-starts.md); [open questions](../open-questions.md) as they stood before it.

## Context

- An API key was the named option if the subscription could not be driven unattended, and for milestone 5's clean-machine demo; it spends money, so it waited for the owner ([0103](0103-subscription-only-for-the-owner.md), [0053](0053-when-work-stops-for-the-owner.md)).

## Decision

- premise uses no API key. The agent runner removes any API key from an agent's environment, and the setup check says so when it finds one.
- Milestone 5's clean-machine demo runs with the scripted agent ([0134](0134-the-owners-claude-login-only-when-strictly-necessary.md)).

## Reason

- An API key spends money, and the subscription works unattended ([0124](0124-unattended-claude-code-on-the-subscription-is-allowed.md)).

## Alternatives considered

| Alternative | Why rejected |
| --- | --- |
| An API key for the clean-machine demo | Spends money; the scripted agent proves the procedure. |

## Consequences

- Closes the API-key question in [open questions](../open-questions.md); other people who set premise up still bring their own model access (milestone 5).

## Related

[0046](0046-claude-through-the-owners-subscription.md), [0103](0103-subscription-only-for-the-owner.md).
