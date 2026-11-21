# 0135. premise is usable by someone who has not read the user guide

- Status: Accepted
- Scope: The product
- Date: 2026-11-21
- Decided by: The owner: "please see that the user experience is also good, targetting somebody who hasn't read the entire user guide and wants to use it".
- Source: [The owner's instruction of 2026-11-21 that started the build](../record/instruction-2026-11-21-build-starts.md).

## Context

- People's attention is what the product spends least of ([0027](0027-spend-least-of-peoples-attention.md)); lists over long paragraphs ([0029](0029-lists-over-long-paragraphs.md)).

## Decision

- Every screen of premise, and every message it prints, makes sense to someone who has not read the user guide: it says what it is, what state things are in, and what to do next, in plain words.
- The setup check names what is missing and how to get it, one line each.
- Anything that is not real yet (a mocked figure, a scripted agent) is labelled as such where it is shown.
- The README's quick start works from a clean copy of the repository.

## Reason

- The owner, as quoted above.

## Alternatives considered

| Alternative | Why rejected |
| --- | --- |
| A thorough user guide as the way in | The owner targets someone who has not read it. |

## Consequences

- Each milestone's report says how a first-time user meets what it built.

## Related

[0027](0027-spend-least-of-peoples-attention.md), [0029](0029-lists-over-long-paragraphs.md), [0133](0133-usage-ledger-is-mocked-until-it-exists.md).
