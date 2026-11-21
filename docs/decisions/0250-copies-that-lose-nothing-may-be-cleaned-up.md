# 0250. Copies of work that lose nothing may be cleaned up

- Status: Accepted
- Scope: Making premise
- Date: 2026-11-21
- Decided by: The owner: "Yes you can cleanup copies that don't lose anything from now on"
- Source: [The owner's later conversation of 2026-11-21](../record/later-conversation-2026-11-21.md). Earlier the owner had said, of a stale local commit: "If nothing is lost when cleaned up, clean it up".

## Context

- While premise is built, copies of work pile up: working copies, stale local commits, scratch folders.

## Decision

1. **From now on a copy may be cleaned up without asking when nothing is lost by it:** everything in it is already somewhere else, checked against that other place first.
2. **If anything would be lost, it is not cleaned up,** and the owner is asked.

## Reason

- The owner, as quoted above.

## Alternatives considered

| Alternative | Why rejected |
| --- | --- |
| Ask each time | The owner said no need when nothing is lost. |
| Clean up without checking | Losing data is on the floor ([0056](0056-what-is-on-the-floor.md)). |

## Consequences

- Clean-up needs a check that nothing is lost, not an approval.

## Related

[0056](0056-what-is-on-the-floor.md), [0149](0149-left-out-suggestions-become-github-issues.md).
