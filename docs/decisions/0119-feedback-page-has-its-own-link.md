# 0119. The feedback page has its own link, which can only submit feedback

- Status: Accepted
- Scope: The plan
- Date: 2026-11-21
- Decided by: The builders, in the documentation restructure of 2026-11-21. The owner did not make this choice.
- Source: The documentation restructure of 2026-11-21, writing the [intake](../specs/intake.md) and [page server](../specs/page-server.md) specifications.

## Context

The plan gives each software a feedback page for its users, whose link premise gives to the operator; giving it to users is the operator's act (old `docs/plan.md`, section 6). Every other request to premise needs the session's token, which gives full control of premise ([0078](0078-session-token-and-header-checks.md)). The plan does not say how the feedback page is reached without that token.

## Decision

- Each software's feedback page has its own link, with its own long random token.
- That link can only submit a feedback item for that one software, and show the sender where that item stands (taken, held, done, closed) from a receipt given on submission.
- It shows no other item, no record, no report, and cannot reach the session's API.
- The link can be revoked and replaced from the session.

## Reason

- The session's token gives full control of premise; handing it to a software's users would hand them premise.
- A link that can do one thing keeps the feedback page safe to give out, which is the operator's act, not premise's.

## Alternatives considered

| Alternative | Why rejected |
| --- | --- |
| The feedback page behind the session's token | Anyone given the link could drive premise. |
| A feedback page with no token at all | Any web page in the same browser could post items into premise ([0078](0078-session-token-and-header-checks.md) exists to stop exactly that). |

## Consequences

- While premise listens on localhost only ([0079](0079-localhost-only.md)), the feedback page opens only on the owner's machine. Users elsewhere reach a software through its GitHub issues until the owner decides on being reached from other machines.
- Feedback text is data, never instructions ([0116](0116-outside-content-is-data.md)).

## Related

[Intake](../specs/intake.md), [page server](../specs/page-server.md), [storage](../specs/storage.md), [0078](0078-session-token-and-header-checks.md), [0079](0079-localhost-only.md).
