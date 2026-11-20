# 0030. The check is independent of the builder

- Status: Accepted
- Scope: The product
- Date: 2026-11-20
- Decided by: The owner, agreeing to the assistant's proposal: "Yeah, and it can be anything such as a review pass of an agent, or anything else. I agree with what you said though."
- Source: [Conversation record](../record/conversation-2026-11-20.md); old docs/decisions.md entry 30.

## Context

- The third of four points the prior-art research raised: agents game checks they can reach.

## Decision

- Whatever checks the software is a different agent from the builder, cannot be edited by it, and judges the running result against the intent, "not against the builder's account of what it did" (Assistant).
- Its form is free. Owner: "it can be anything such as a review pass of an agent, or anything else."

## Reason

- Assistant: "Agents game the checks they can touch." It is "also the best guard against the false report".

## Alternatives considered

| Alternative | Why rejected |
| --- | --- |
| None recorded | No alternative was put to the owner or recorded. |

## Consequences

- Vision line, step 8: "A different agent from the builder, out of the builder's reach, judges the running result against the intent."
- Carried by [0089](0089-checker-in-a-fresh-session.md), [0090](0090-scenarios-out-of-the-builders-reach.md), [0091](0091-checker-same-provider-strongest-tier.md) and [build, check and run](../architecture/build-check-run.md).

## Related

[0014](0014-guard-against-further-big-mistakes.md), [0013](0013-mismatch-of-intent-is-the-mistake-that-matters.md).
