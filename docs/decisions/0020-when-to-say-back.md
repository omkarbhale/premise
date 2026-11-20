# 0020. When the product says back what it understood

- Status: Accepted
- Scope: The product
- Date: 2026-11-20
- Decided by: The owner, agreeing to the assistant's proposal: "I agree on the one call you asked for me as well."
- Source: [Conversation record](../record/conversation-2026-11-20.md); old docs/decisions.md entry 20.

## Context

- The assistant's call: "should the factory always play back what it understood before building?"

## Decision

- Always at the start of a new software or when taking on an existing one.
- For later changes, only when the change touches the purpose or would be costly to undo.

## Reason

- Proposed by the assistant as its view; no further reason was recorded.
- Owner: "I agree on the one call you asked for me as well."

## Alternatives considered

| Alternative | Why rejected |
| --- | --- |
| None recorded | No alternative was put to the owner or recorded. |

## Consequences

- Vision line, step 5 (Say back).
- **Changed later:** the say-back is a short list of assumptions to strike out, not a document to agree with ([0028](0028-say-back-as-assumptions-to-strike.md)). That changes its form; when it happens stands.
- The plan makes "touches the purpose" concrete: a change that replaces a `Y` or `U` item, a must item or a foundation decision ([the line](../architecture/the-line.md)).

## Related

[0013](0013-mismatch-of-intent-is-the-mistake-that-matters.md), [0028](0028-say-back-as-assumptions-to-strike.md).
