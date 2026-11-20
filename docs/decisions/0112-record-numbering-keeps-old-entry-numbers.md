# 0112. Decision records keep the old entry numbers

- Status: Accepted
- Scope: Making premise
- Date: 2026-11-21
- Decided by: The builders, in the documentation restructure of 2026-11-21. The owner did not make this choice.
- Source: The documentation restructure of 2026-11-21.

## Context
- The single `docs/decisions.md` (entries 1–65) and the P-numbered choices in `docs/plan.md` (P1–P44) are split into one record per decision ([0066](0066-documents-follow-the-aras-insight-layout.md)).
- The raw records, the commit history and earlier pull requests cite "entry N" and "P{n}".

## Decision
- Old `docs/decisions.md` entries 1–65 become records 0001–0065, with the same numbers.
- The owner's layout decision is 0066.
- Plan choices P1–P44 become 0067–0110 in order (P{n} = 0066+n).
- Later records take the next free number. Numbers are never reused.

## Reason
Keeping the numbers keeps every existing citation of "entry N" and "P{n}" findable.

## Alternatives considered
| Alternative | Why rejected |
| --- | --- |
| Renumbering by theme | Breaks every existing citation. |
| A separate P-numbered series | Two numbering schemes for one kind of record. |

## Consequences
- Each record's Source line names the old entry or P-number it carries.
- The old files remain in git history at commit f62615a.
- The [index](README.md) groups records by theme and keeps the numbers.

## Related
[0066](0066-documents-follow-the-aras-insight-layout.md).
