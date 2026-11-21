# 0138. Priority between softwares is a field on each software from milestone 1; usage shares stay with usage-ledger

- Status: Accepted, chosen for the owner; open to the owner's correction
- Partly supersedes: [0129](0129-builders-reading-of-effort-and-milestone-waits.md) (that effort by priority comes in milestone 7)
- Scope: The plan
- Date: 2026-11-21
- Decided by: The assistant, for the owner, on the owner's instruction "choose for me" ([0136](0136-open-questions-chosen-for-the-owner.md)). Open to the owner's correction.
- Source: [The owner's instruction of 2026-11-21 that started the build](../record/instruction-2026-11-21-build-starts.md); [open questions](../open-questions.md) as they stood before it.

## Context

- The owner asked to decide how much effort a software gets, "of weekly usages, or by priority" ([0128](0128-effort-per-software-and-milestone-waits.md)).
- The builders' reading put priority with several softwares in milestone 7, and shares with cost in milestone 2 ([0129](0129-builders-reading-of-effort-and-milestone-waits.md)); whether that reading was right was open with the owner.

## Decision

- Every software has a priority from milestone 1: a number from 1 (most important) to 5, default 3, set per software, with the default a setting ([0132](0132-sensible-things-are-configurable.md)).
- The work queue starts the startable job of the most important software first.
- Effort as a share of weekly usage stays with usage-ledger, mocked until it exists ([0133](0133-usage-ledger-is-mocked-until-it-exists.md)).
- The rest of [0129](0129-builders-reading-of-effort-and-milestone-waits.md) stands.

## Reason

- A field costs little and lets the owner set priority as soon as a second software exists, instead of waiting for milestone 7.
- Shares need usage figures, which only usage-ledger gives.

## Alternatives considered

| Alternative | Why rejected |
| --- | --- |
| Priority in milestone 7 ([0129](0129-builders-reading-of-effort-and-milestone-waits.md)) | Later than needed for a field this small. |
| Shares counted inside premise | Against [0064](0064-cost-and-spending-limit-from-usage-ledger.md). |

## Consequences

- Carried in the [work queue](../specs/work-queue.md) and [storage](../specs/storage.md) specifications and the [roadmap](../product/roadmap.md).

## Related

[0128](0128-effort-per-software-and-milestone-waits.md), [0129](0129-builders-reading-of-effort-and-milestone-waits.md), [0074](0074-two-agent-sessions-at-once.md).
