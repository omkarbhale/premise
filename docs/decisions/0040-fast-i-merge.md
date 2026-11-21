# 0040. How changes to premise ship: "Fast, I merge"

- Status: Partly superseded by [0131](0131-changes-go-through-the-validation-pipeline.md): that a change goes to a pull request with no automated review-and-test run; the assistant still merges
- Scope: Making premise
- Date: 2026-11-20
- Decided by: The owner: "Fast, I merge".
- Source: [Conversation record](../record/conversation-2026-11-20.md); old docs/decisions.md entry 40.

## Context

- Before creating the repository, the assistant asked, as a multiple-choice question, how changes to premise should ship.

## Decision

- Every change goes straight to a pull request with no automated review-and-test run, and the assistant merges it.

## Reason

- No reason was recorded. The option as offered: "Fastest, least checked."

## Alternatives considered

| Alternative | Why rejected |
| --- | --- |
| "Checked, I merge (recommended)": product changes go through the full automated review-and-test run before a pull request; internal-only changes go straight to a pull request; the assistant merges anything that passes and is in scope; destructive or security-sensitive merges still go to the owner | Not chosen by the owner. No reason was recorded. |
| "Checked, you merge": the same checks, with every pull request waiting for the owner's approval ("This is the standard default; it costs your attention on each change") | Not chosen by the owner. No reason was recorded. |

## Consequences

- **Reconfirmed:** [0052](0052-fast-i-merge-reconfirmed.md).
- How changes ship is described in [how premise is being made](../how-we-work.md).

- **Partly superseded by** [0131](0131-changes-go-through-the-validation-pipeline.md): every change now goes through the no-mistakes validation pipeline; the assistant still merges.

## Related

[0052](0052-fast-i-merge-reconfirmed.md), [0053](0053-when-work-stops-for-the-owner.md).
