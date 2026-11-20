# 0022. People can put their own taste into the software

- Status: Accepted
- Scope: The product
- Date: 2026-11-20
- Decided by: The owner: "if the users of our products have their own taste in parts of the software ... then they should be able to do that as well." The default was the assistant's assumption 9, agreed by the owner: "I agree".
- Source: [Conversation record](../record/conversation-2026-11-20.md); [scope page draft](../record/scope-page-draft-0.1.html), call 1; old docs/decisions.md entry 22.

## Context

- The owner raised taste unprompted, while answering the assistant's second round of opinions.

## Decision

- People with their own taste in parts of the software (user experience, technical things, minor features) can assert it.
- Minor wishes can come in as intake; review before building can be chosen per area.
- Shape left open on purpose.
- **Default** (the assistant's assumption 9, Owner: "I agree"): the product decides; a person claims the areas they want to see before they are built.

## Reason

- Owner: "I'm just rambling here and I'd rather avoid premature thinking for our product, but at the same time make it good."
- For the default, the scope page gave the reason: "Follows the return-on-effort rule: every review point costs speed, so they exist only where someone asked for one."

## Alternatives considered

| Alternative | Why rejected |
| --- | --- |
| "A person reviews by default and releases the areas they do not care about." (scope page) | Scope page: "Safer against surprises, slower, and leans on the person knowing what to look for." The product-decides default was agreed. |

## Consequences

- Vision, Taste: "By default the product decides. A person claims the areas they want to see before they are built. Small wishes come in as intake."
- How claims and proposals work: [intake and reporting](../architecture/intake-and-reporting.md), "Taste" ([0102](0102-taste-proposals-before-building.md)).

## Related

[0033](0033-answers-to-the-ten-assumptions.md) item 9, [0027](0027-spend-least-of-peoples-attention.md).
