# 0034. First proof, and existing software after

- Status: Accepted
- Scope: The plan
- Date: 2026-11-20
- Decided by: The owner, agreeing to the assistant's assumption 10: "8, 9, 10, I agree."
- Source: [Conversation record](../record/conversation-2026-11-20.md); [scope page draft](../record/scope-page-draft-0.1.html), call 2; old docs/decisions.md entry 34.

## Context

- The owner put existing software in scope ([0018](0018-existing-software-and-automatic-intake.md)); the assistant said it would still build it after new software works end to end.

## Decision

- The first proof is one small brand-new software, end to end.
- Existing software follows once the line works.

## Reason

- Assistant: existing software is "the larger problem and could swallow the effort".
- The scope page: a brand-new software "Exercises the whole line once with nothing inherited"; and "If it comes first, the line may never be proven end to end."

## Alternatives considered

| Alternative | Why rejected |
| --- | --- |
| "An existing software of yours, taken on" (scope page) | "Useful sooner, but starts with the hardest part: rebuilding the record from what is already there". |
| "Both at once" (scope page) | "Finds out earliest what the two have in common, at the cost of two moving targets". |

## Consequences

- Milestone 1 is the thinnest line end to end for any small software; existing software is milestone 6; the line works after milestone 4 ([roadmap](../product/roadmap.md)).

## Related

[0018](0018-existing-software-and-automatic-intake.md), [0019](0019-existing-software-through-the-same-line.md), [0049](0049-any-kind-of-software.md), [0110](0110-two-sample-softwares.md).
