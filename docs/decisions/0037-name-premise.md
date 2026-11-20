# 0037. Name: premise

- Status: Accepted
- Scope: The product
- Date: 2026-11-20
- Decided by: The owner: "premise sounds good." and, after the name check, "Yes premise it is."
- Source: [Conversation record](../record/conversation-2026-11-20.md); [shaping notes](../record/shaping-notes-2026-11-20.md); old docs/decisions.md entry 37.

## Context

- The owner asked: "Suggest a good name for this :)".

## Decision

- The product is named premise.

## Reason

- Assistant:
  - "It says what the product is about. Everything the product builds has to follow from a stated purpose."
  - "It sits naturally beside entail. A premise is what things follow from; entail is what follows."
  - "It's short, lowercase and easy to say".

## Alternatives considered

| Alternative | Why rejected |
| --- | --- |
| corollary | "longer and harder to type" |
| keel | Kept as the fallback "If the other project has grown". |
| slipway | Not chosen; the owner picked premise. |
| wright | "people may hear 'Playwright'" |
| "factory", "forge", "foundry" (avoided) | "They're heavily used already, and the research showed 'software factory' carries fifty years of baggage." |

## Consequences

- **Name check:**
  - no repository named premise existed under the owner's GitHub account;
  - the npm name "premise" is taken by an unrelated package;
  - a web search found a desktop app called Premise (mbenachour.github.io/premise) in an adjacent space, seen through a search summary only.
- Assistant's recommendation: keep premise, "It fits too well to drop over one small project".
- The other Premise project is an [open question](../open-questions.md); nothing in the plan depends on it.

## Related

[0021](0021-vocabulary-product-and-software.md), [0038](0038-premise-stands-alone.md), [0039](0039-public-repository.md).
