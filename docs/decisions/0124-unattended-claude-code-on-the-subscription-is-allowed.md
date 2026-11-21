# 0124. Unattended use of Claude Code on the owner's subscription is allowed

- Status: Accepted
- Scope: The plan
- Date: 2026-11-21
- Decided by: The owner: "It is allowed. Anthropic blocks organizations that run claude login in other harnesses, not using claude code itself. If they didn't want to they would have not given non-interactive access in the first place."
- Source: The owner's ruling after the [subscription and sandbox test](../record/subscription-sandbox-test-2026-11-21.md), which could not check the terms because web searches were not allowed.

## Context

- [0103](0103-subscription-only-for-the-owner.md) limits the owner's subscription to Anthropic's own Claude Code, logged in as the owner, on the owner's machine, for the owner's own use. The roadmap's milestone 1 step 1 point 8 asks that the use stays within it.
- The test of 2026-11-21 ran headless Claude Code unattended on the owner's subscription login with no API key, and it worked. It did not check Anthropic's terms: no web access was allowed, and nothing local says whether unattended use is permitted.

## Decision

- Unattended use of Claude Code on the owner's subscription is allowed.
- premise runs Claude Code itself, headless and non-interactive, as the owner, on the owner's machine. It does not log in to Claude through any other harness.

## Reason

- Owner: "It is allowed. Anthropic blocks organizations that run claude login in other harnesses, not using claude code itself. If they didn't want to they would have not given non-interactive access in the first place."

## Alternatives considered

| Alternative | Why rejected |
| --- | --- |
| Check the terms before going on | The owner ruled on it. The test had no web access, so there was nothing further to check offline. |
| An API key | It spends money ([0053](0053-when-work-stops-for-the-owner.md)) and is not needed if the use is allowed. |

## Consequences

- Milestone 1 step 1 point 8 is settled by this record. [0103](0103-subscription-only-for-the-owner.md) still holds: this record does not widen the use to anyone but the owner.
- The terms question in [open questions](../open-questions.md) is closed.

## Related

[0046](0046-claude-through-the-owners-subscription.md), [0071](0071-headless-claude-code-agents.md), [0076](0076-own-claude-code-configuration.md), [0103](0103-subscription-only-for-the-owner.md).
