# 0082. The record is Markdown, one item per line with a stable ID

- Status: Accepted
- Scope: The plan
- Date: 2026-11-21
- Decided by: The builders, in the plan of 2026-11-21. The owner did not make this choice.
- Source: Old docs/plan.md, P16 (section 3, "Format").

## Context
- The product speaks to people in lists ([0029](0029-lists-over-long-paragraphs.md)).
- Lasting records hold purpose, users, what the software must do, decisions with their reasons, and rejected alternatives ([0025](0025-two-kinds-of-record.md)).

## Decision
- The record is Markdown: one item per list line, each with a stable ID.
- Files in `premise/`: `why.md` (`Y-n`), `who.md` (users `U-n`, roles `R-n`), `exists.md` (`E-n`, with sources and the outcome), `what.md` (`W-n`, priority must, should or could), `taste.md` (`T-n`), `decisions.md` (`D-n`), `run.md` (how to build, start and open the software).
- Example line: `- [W-7] People can export their list as a CSV file. (must; from: operator; 2026-11-21)`.
- `from:` is a role, or `assumed` for an assumption of premise's that nobody struck.
- A changed item gets a new ID and `replaces: W-3`.
- A dropped item is struck through with its reason, not deleted, so rejected alternatives stay ([0025](0025-two-kinds-of-record.md)).
- The record keeper parses every file on every change. A malformed line, a duplicate ID, or a reference to a missing ID fails the change.

## Reason
- People read it on GitHub and on the page.
- LLMs read and write it well.
- It is lists ([0029](0029-lists-over-long-paragraphs.md)).

## Alternatives considered
| Alternative | Why rejected |
| --- | --- |
| JSON or YAML | Harder for people to read and correct. |

## Consequences
- `run.md` is run by the checker from a clean copy every time, so it cannot go stale without the check failing.
- Carried in [the record](../architecture/the-record.md); implemented by the [record keeper](../specs/record-keeper.md) spec.

## Related
[0080](0080-record-in-the-softwares-repository.md), [0083](0083-trace-trailer-on-every-commit.md).
