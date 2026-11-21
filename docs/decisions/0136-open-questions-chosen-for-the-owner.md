# 0136. The assistant chooses the open questions for the owner, and records each choice

- Status: Accepted
- Scope: Making premise
- Date: 2026-11-21
- Decided by: The owner: "with all open questions for me which you chose for me (choose for me) after this, and have them in the repo."
- Source: [The owner's instruction of 2026-11-21 that started the build](../record/instruction-2026-11-21-build-starts.md).

## Context

- [Open questions](../open-questions.md) listed what was open with the owner.

## Decision

- The assistant chooses an answer for each question that was open with the owner, and for each such question that comes up later.
- Each choice is its own decision record, "Decided by: the assistant, for the owner", open to the owner's correction.
- [Open questions](../open-questions.md) lists each choice, so the owner can find and correct them in one place.

## Reason

- The owner: "choose for me".

## Alternatives considered

| Alternative | Why rejected |
| --- | --- |
| Keep the questions open and wait | The owner asked the assistant to choose. |

## Consequences

- Records [0137](0137-first-software-is-usage-ledger.md)–[0145](0145-no-api-key.md).
- A correction by the owner is a new record that supersedes the choice.

## Related

[0042](0042-plan-top-down-settle-owner-calls-first.md), [0053](0053-when-work-stops-for-the-owner.md).
