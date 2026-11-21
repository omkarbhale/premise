# 0130. The build starts, and covers the whole of premise

- Status: Accepted
- Supersedes: [0061](0061-nothing-built-until-the-owner-says.md)
- Scope: Making premise
- Date: 2026-11-21
- Decided by: The owner: "When effort-milestones lands, I want you to take over and build the entirety of premise".
- Source: [The owner's instruction of 2026-11-21 that started the build](../record/instruction-2026-11-21-build-starts.md).

## Context

- [0061](0061-nothing-built-until-the-owner-says.md) held all building until the owner said to start.
- "effort-milestones" is the records change that added records 0126–0129. It has landed.

## Decision

- Building premise starts now.
- The build covers the whole of premise: every milestone of the [roadmap](../product/roadmap.md), in its order, without a new "start" from the owner before each one.
- It is built as a series of tasks; the first is the foundation (the package, configuration, storage, the work queue, the agent runner's seam, usage-ledger's seam and the setup check).

## Reason

- The owner: "I want you to take over and build the entirety of premise".

## Alternatives considered

| Alternative | Why rejected |
| --- | --- |
| Keep holding until the owner says to start each milestone ([0061](0061-nothing-built-until-the-owner-says.md)) | The owner said to build the whole of premise. |

## Consequences

- **Supersedes** [0061](0061-nothing-built-until-the-owner-says.md).
- Work still stops for the owner on destructive, security-sensitive, public-facing or money-spending actions ([0053](0053-when-work-stops-for-the-owner.md)), and one short report goes to the owner per finished milestone ([0054](0054-reports-to-the-owner.md)).
- The [roadmap](../product/roadmap.md), the [executive summary](../executive-summary.md), [how we work](../how-we-work.md), the README and the specifications no longer say that building is on hold.

## Related

[0042](0042-plan-top-down-settle-owner-calls-first.md), [0131](0131-changes-go-through-the-validation-pipeline.md)–[0136](0136-open-questions-chosen-for-the-owner.md).
