# 0144. Reaching premise from other machines stays off by default

- Status: Accepted, chosen for the owner; open to the owner's correction
- Scope: The plan
- Date: 2026-11-21
- Decided by: The assistant, for the owner, on the owner's instruction "choose for me" ([0136](0136-open-questions-chosen-for-the-owner.md)). Open to the owner's correction.
- Source: [The owner's instruction of 2026-11-21 that started the build](../record/instruction-2026-11-21-build-starts.md); [open questions](../open-questions.md) as they stood before it.

## Context

- premise listens on localhost only; being reached from other machines is security-sensitive and was a later decision for the owner ([0079](0079-localhost-only.md), [0065](0065-one-open-session.md)).

## Decision

- premise listens on this machine only, and no setting opens it to other machines.
- Opening it stays a decision for the owner, when the owner asks for it; milestone 5 prepares it and does not turn it on.

## Reason

- Anything reachable from outside the machine is security-sensitive ([0053](0053-when-work-stops-for-the-owner.md)).

## Alternatives considered

| Alternative | Why rejected |
| --- | --- |
| A setting to listen on every address | Security-sensitive; it would decide the question by a setting. |

## Consequences

- The server's host setting accepts loopback addresses only, and says why when given another.

## Related

[0078](0078-session-token-and-header-checks.md), [0079](0079-localhost-only.md).
