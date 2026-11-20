# 0019. Existing software goes through the same line, with people

- Status: Accepted
- Scope: The product
- Date: 2026-11-20
- Decided by: The owner, agreeing to the assistant's proposal and adding the people: "Yes, and along with people, not fully automatically, if the parts of software conflict with each other or not automatically inferrable for example."
- Source: [Conversation record](../record/conversation-2026-11-20.md); old docs/decisions.md entry 19.

## Context

- The assistant proposed: "Existing software should go through the same line. The factory would first reconstruct the record a from-scratch conversation would have produced".

## Decision

- The product first reconstructs the record a from-scratch conversation would have produced (why it exists, for whom, what it must do), "along with people, not fully automatically, if the parts of software conflict with each other or not automatically inferrable" (Owner).

## Reason

- Proposed by the assistant; the owner added the people. No further reason was recorded.
- The prior-art research later found recovered intent misses 44–65% of user goals; the assistant said this "backs your 'with people, not fully automatic'".

## Alternatives considered

| Alternative | Why rejected |
| --- | --- |
| Reconstructing the record fully automatically | The owner: "along with people, not fully automatically, if the parts of software conflict with each other or not automatically inferrable for example." |

## Consequences

- Vision: "Existing software enters the same line: the product rebuilds the record a from-scratch conversation would have produced, with people wherever parts conflict or cannot be inferred."
- How it works is in [the line](../architecture/the-line.md), "Existing software"; it is milestone 6 ([roadmap](../product/roadmap.md)).

## Related

[0018](0018-existing-software-and-automatic-intake.md), [0034](0034-first-proof-new-software.md).
