# 0244. A feedback sender sees only their own words and a plain status

- Status: Accepted
- Scope: Milestone 4, the rest
- Date: 2026-11-21
- Decided by: The builders; chosen for the owner by the assistant, open to correction.
- Source: Review of the feedback page ([0241](0241-how-the-feedback-page-is-built.md)) and [0243](0243-duplicates-across-sources-and-counts-per-route.md).

## Context

- A feedback item can be joined to an earlier item of any source, including an operator's own session question that was answered. The receipt page followed the joined item and could show the answer written for it.

## Decision

1. **The receipt page shows the sender's own words and a plain status.** The statuses are: being understood, being built, running, held, closed.
2. **When the item was joined to another,** the page says it was joined with an earlier report of the same thing and shows that item's plain status.
3. **Answer text is shown only when the sender's own item is the answered one.** Text written for or by another sender or the operator is never shown.

## Reason

- Builders' note: what the operator or another sender wrote was not written for this sender; a status carries what they need.

## Alternatives considered

| Alternative | Why rejected |
| --- | --- |
| Show the joined item's answer | It may hold text meant for the operator or for another sender. |

## Consequences

- A sender whose item was joined to an answered question is told it was answered, not what the answer was.

## Related

[0241](0241-how-the-feedback-page-is-built.md), [0243](0243-duplicates-across-sources-and-counts-per-route.md).
