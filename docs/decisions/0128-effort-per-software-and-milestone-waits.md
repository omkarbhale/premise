# 0128. Per software, the owner decides how much effort it gets, and can set milestones to wait after

- Status: Accepted
- Scope: The product
- Date: 2026-11-21
- Decided by: The owner, a new requirement, verbatim: "Also, for some software (such as premise or entail or the other one I had, where I had to rebuild it because I chose to work on the wrong thing to fix my problem), I similarly want to decide how much effort to put (of weekly usages, or by priority), and make and wait after milestones if needed for that software."
- Source: [Conversation record, 2026-11-21](../record/conversation-2026-11-21.md).

## Context

- It came in the same conversation as [0126](0126-what-is-being-built-confirmed.md), in which the owner said they had rebuilt entail twice and one other project once because they "knew what I wanted to solve only vaguely".

## Decision

- For a software, the owner can decide how much effort it gets: as a share of weekly usage, or by priority.
- For a software, the owner can make milestones and have premise wait after them, if needed.
- Both are optional per software: the owner said "for some software".
- The builders' reading of how this works is in [0129](0129-builders-reading-of-effort-and-milestone-waits.md), a separate record, and is open to the owner's correction.

## Reason

- The owner's examples are premise, entail and "the other one I had, where I had to rebuild it because I chose to work on the wrong thing to fix my problem". The owner said "similarly", pointing to the same worry as in [0126](0126-what-is-being-built-confirmed.md).

## Alternatives considered

| Alternative | Why rejected |
| --- | --- |
| None recorded | No alternative was put to the owner or recorded. |

## Consequences

- A line is added to the vision under "Also part of the product", in the owner's meaning ([VISION.md](../../VISION.md#also-part-of-the-product)); the scope, roadmap, roles, models and cost, line engine, work queue and executive summary carry it.
- It adds to what is set per software ([0106](0106-per-software-and-with-premise.md) lists the builders' split before this); [0129](0129-builders-reading-of-effort-and-milestone-waits.md) is the builders' reading.
- Building is still on hold ([0061](0061-nothing-built-until-the-owner-says.md)).

## Related

[0016](0016-coarse-cost-tracking.md), [0048](0048-a-spending-limit.md), [0064](0064-cost-and-spending-limit-from-usage-ledger.md), [0106](0106-per-software-and-with-premise.md), [0129](0129-builders-reading-of-effort-and-milestone-waits.md).
