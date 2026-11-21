# 0243. Duplicates across sources, and counts per route

- Status: Accepted
- Scope: Milestone 4, the rest
- Date: 2026-11-21
- Decided by: The builders; the points marked "chosen for the owner" are the owner's to correct.
- Source: The [intake specification](../specs/intake.md) (routes, observability), [0185](0185-how-intake-in-a-thin-form-is-built.md), and the task that finished intake.

## Context

- The plan wants duplicates merged whichever source they come from, a sender told where their item stands, and counts per route in reports and measures. The triager already merges duplicates it spots among the software's other open items.

## Decision

1. **The triager sees where each open item came from,** so it can tell the same report made through the feedback page and as a GitHub issue.
2. **Exact repeats are merged without an agent.** An item that says the same, word for word, as another open item (ignoring case, spacing and punctuation, and only when at least 12 characters long) is merged into it at once, from any source. An item never joins a merged item; it joins the item the chain ends at. The operator can undo a merge on the Intake tab as for any other.
3. **A merged item's sender is told where the item it joined stands,** and that moves as the joined item moves (the feedback page shows the joined item's standing; a GitHub sender is told through the gate).
4. **Counts per route and per source** come from the intake table, for one software or all together: how many items went in normally, were asked, were held, were merged or closed, and from which source. They are shown on the Intake tab, as a section of each report, and in the measures. An item is counted by the route it first took.

## Reason

- Builders' note: an exact repeat needs no judgement, so it should cost no agent session; counting from the table keeps the figures real, as every measure is ([0172](0172-premise-measures-its-own-return.md)).

## Alternatives considered

| Alternative | Why rejected |
| --- | --- |
| Leave all duplicates to the triager | A repeat posted twice in a minute would cost a session each time. |
| Merge near-matches by similarity | A wrong merge hides a real item; judging similarity is the triager's work. |

## Consequences

- No new table: counts are read from `intake_items`.

## Related

[Intake](../specs/intake.md), [reporter](../specs/reporter.md), [measures](../specs/measures.md), [0172](0172-premise-measures-its-own-return.md).
