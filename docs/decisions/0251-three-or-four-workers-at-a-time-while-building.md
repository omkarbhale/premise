# 0251. Three or four workers at a time while building premise

- Status: Accepted
- Scope: Making premise
- Date: 2026-11-21
- Decided by: The owner: "You can go back to three/four workers, don't worry!"
- Source: [The owner's later conversation of 2026-11-21](../record/later-conversation-2026-11-21.md). The assistant had dropped to one worker when the week's usage reached 83%.

## Context

- Building premise runs several workers at once. The assistant cut this to one when the week's usage was high and told the owner.

## Decision

1. **Three or four workers may run at once** while premise is built, as before.
2. **This is about making premise,** not about premise's own setting for how many agent sessions run at once, which is a setting of premise ([0132](0132-sensible-things-are-configurable.md)).

## Reason

- The owner, as quoted above: usage was not a worry.

## Alternatives considered

| Alternative | Why rejected |
| --- | --- |
| Stay at one worker | The owner said to go back. |

## Consequences

- The build goes at the pace of three or four workers.

## Related

[0130](0130-the-build-starts-and-covers-all-of-premise.md), [0134](0134-the-owners-claude-login-only-when-strictly-necessary.md).
