# 0083. Every commit carries a Premise-Trace trailer

- Status: Accepted
- Scope: The plan
- Date: 2026-11-21
- Decided by: The builders, in the plan of 2026-11-21. The owner did not make this choice.
- Source: Old docs/plan.md, P17 (section 3, "How built pieces trace to it").

## Context
- Every built piece traces to the intent behind it, so it can be told whether the record was wrong or the build drifted ([0013](0013-mismatch-of-intent-is-the-mistake-that-matters.md)).

## Decision
- Every commit premise makes carries a trailer naming what it serves: `Premise-Trace: W-7, D-3`, plus `I-12` when the work came from intake.
- Every builder task names the items it serves.
- The server refuses to push a commit without the trailer, or with one naming an ID that does not exist.

## Reason
From any line of code, `git blame` leads to a commit and its items; from any item, to every commit that names it. That tells a wrong record apart from a drifted build ([0013](0013-mismatch-of-intent-is-the-mistake-that-matters.md)).

## Alternatives considered
| Alternative | Why rejected |
| --- | --- |
| IDs in code comments | Noise that goes stale. |

## Consequences
- Carried in [the record](../architecture/the-record.md); implemented by the [record keeper](../specs/record-keeper.md) and [runner](../specs/runner.md) specs (push refusal).

## Related
[0082](0082-record-as-markdown-with-ids.md), [0093](0093-server-merges-no-pull-requests.md).
