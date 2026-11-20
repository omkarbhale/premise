# 0031. The product is general

- Status: Accepted
- Scope: The product
- Date: 2026-11-20
- Decided by: The owner: "the product in general should be able to be used for anything. It has all the prompts and application logic and stuff already decided ... The quality can depend on the LLM models used". The consequence was agreed by the owner: "I agree on your points".
- Source: [Conversation record](../record/conversation-2026-11-20.md); old docs/decisions.md entry 31.

## Context

- The fourth of four points the prior-art research raised: "Reusable product, or one setup bonded to each software?" The assistant called it "the one I'm least sure of".

## Decision

- Owner: "the product in general should be able to be used for anything. It has all the prompts and application logic and stuff already decided ... The quality can depend on the LLM models used".
- What is set per software at run time and what stays with the product is to be decided.

## Reason

- No further reason was recorded beyond the owner's words.

## Alternatives considered

| Alternative | Why rejected |
| --- | --- |
| A setup bonded to one application (the view of one voice in the research: "a general factory breaks on every model upgrade and must be built around one application") | The owner: the product should be usable for anything. |

## Consequences

- **Consequence** (Assistant; Owner: "I agree on your points"): "the product's logic should be about the line and the records, not workarounds for one model's weaknesses. Workarounds are what broke on upgrade in the case from the research. Built that way, a better model makes the product better without a rewrite."
- **Left open then:** the assistant's split, "the general part is the conversation, the record and the order of the line. The build setup for each software can be specific to it and regenerated when models change." The assistant called this "the one I'm least sure of". Owner: "What needs to be updated runtime per software and what stays with the product can be decided." The builders answered it in [0106](0106-per-software-and-with-premise.md).
- Vision principle 9: "It is general. It can be used for any software, and a better model makes it better."

## Related

[0049](0049-any-kind-of-software.md), [0105](0105-tier-aliases.md), [models and cost](../architecture/models-and-cost.md).
