# 0013. The mistake that matters is a mismatch of intent

- Status: Accepted
- Scope: The product
- Date: 2026-11-20
- Decided by: The owner: "small bugs are no problem perhaps. The big mistakes are when there is a mismatch between the intent wanted and what was inferred". The owner agreed to what follows: "I agree on all."
- Source: [Conversation record](../record/conversation-2026-11-20.md); old docs/decisions.md entry 13.

## Context

- Answer to the assistant's point that accepting defects for speed only works if defects are cheap to find and fix.

## Decision

- Small bugs are tolerable.
- The big mistake is "a mismatch between the intent wanted and what was inferred".

## Reason

- Owner: "only in my opinion, I don't know where mistakes could come from".
- Agreed with it (Owner: "I agree"): the assistant's point that "Accepting defects for speed only works if defects are cheap to find and fix. So the loop back from 'this is wrong' to 'fixed' has to be in scope and fast. Without it the trade stops paying."

## Alternatives considered

| Alternative | Why rejected |
| --- | --- |
| None recorded | No alternative was put to the owner or recorded. |

## Consequences

- What follows (Assistant; Owner: "I agree on all"):
  - the product says back what it understood, in purpose terms, before spending real effort;
  - every built piece traces to a recorded intent, so it can be told whether the record was wrong or the build drifted;
  - it shows running software early, "because seeing it is the cheapest way to catch a mismatch."
- Vision principle 3: "The mistake that matters is a mismatch between what was wanted and what was understood."
- Carried by the say-back ([0020](0020-when-to-say-back.md), [0028](0028-say-back-as-assumptions-to-strike.md)) and the trace trailer ([0083](0083-trace-trailer-on-every-commit.md)).

## Related

[0014](0014-guard-against-further-big-mistakes.md), [0006](0006-llm-does-what-it-can.md).
