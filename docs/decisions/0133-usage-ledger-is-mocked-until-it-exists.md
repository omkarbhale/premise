# 0133. usage-ledger's output is mocked until it exists, and the page says so

- Status: Partly superseded by [0330](0330-real-sessions-read-the-real-usage-ledger.md): usage-ledger exists, real sessions read it, and the mock stays only as demo figures for scripted agents
- Partly supersedes: [0064](0064-cost-and-spending-limit-from-usage-ledger.md) (that usage-ledger being usable is a prerequisite of milestone 2)
- Scope: The plan
- Date: 2026-11-21
- Decided by: The owner: "Assume usage-ledger will be built later, and mock all of its output. Randomized or same each time. In the user interface, mark that this is mocked."
- Source: [The owner's instruction of 2026-11-21 that started the build](../record/instruction-2026-11-21-build-starts.md).

## Context

- [0064](0064-cost-and-spending-limit-from-usage-ledger.md): cost tracking and the spending limit come from usage-ledger, built as its own project; usage-ledger being usable was milestone 2's prerequisite, and milestone 3 went first if it was not.

## Decision

- premise talks to usage-ledger through one interface. Until usage-ledger exists, a mock answers for it.
- The mock gives either the same figures every time, or random figures from a seed; which is a setting.
- Every figure the mock gives carries a mark that it is mocked, and the page shows that mark wherever the figure appears.
- Milestone 2 is built against the mock; it does not wait for usage-ledger.

## Reason

- The owner, as quoted above.

## Alternatives considered

| Alternative | Why rejected |
| --- | --- |
| Wait for usage-ledger before milestone 2 ([0064](0064-cost-and-spending-limit-from-usage-ledger.md)) | The owner: assume it is built later and mock it. |
| Count usage inside premise | Against [0064](0064-cost-and-spending-limit-from-usage-ledger.md), which stands: premise builds no cost tracking of its own. |

## Consequences

- **Partly supersedes** [0064](0064-cost-and-spending-limit-from-usage-ledger.md): the prerequisite. That premise only uses usage-ledger, and builds none of its own, stands.
- The real connection is a setting that is not built yet; choosing it stops premise at start with a plain message.
- The [roadmap](../product/roadmap.md) no longer orders milestone 3 before milestone 2 for want of usage-ledger.

## Related

[0016](0016-coarse-cost-tracking.md), [0048](0048-a-spending-limit.md), [0129](0129-builders-reading-of-effort-and-milestone-waits.md), [0137](0137-first-software-is-usage-ledger.md).
