# 0118. How chat messages are routed

- Status: Accepted
- Scope: The plan
- Date: 2026-11-21
- Decided by: The builders, in the documentation restructure of 2026-11-21. The owner did not make this choice.
- Source: The documentation restructure of 2026-11-21.

## Context
- The plan: in milestone 1, corrections to a stage's draft come in chat; and "something said in chat that is not an answer to a current question becomes an intake item, and premise says so in one line ("Taken as I-14")".
- More detail is available when asked, in chat ("more on W-7") ([0012](0012-reporting-with-a-product-default.md)).
- The plan does not say how an answer, a correction and intake are told apart.

## Decision
- An answer given on an ask's card is an answer.
- While a stage draft is open, chat goes to the drafter as corrections to it. The drafter can mark a message as not about the draft, and it becomes intake.
- Otherwise every chat message becomes an intake item ("Taken as I-14"), and triage routes it.
- A request for more detail ("more on W-7") is triaged as a question and answered by the reporter from the record and the evidence.

## Reason
The plan says corrections come in chat during a stage and that chat that is not an answer becomes intake, but not how the two are told apart; tying it to what is open on the page needs no extra agent and no tagging by people.

## Alternatives considered
| Alternative | Why rejected |
| --- | --- |
| Making people tag each message | Attention ([0027](0027-spend-least-of-peoples-attention.md)). |
| An extra agent session classifying every message before anything else | Slower, and the triager already classifies intake. |

## Consequences
- Implemented by the [line engine](../specs/line-engine.md), [intake](../specs/intake.md) and [page](../specs/page.md) specs.

## Related
[0094](0094-triager-reads-every-item.md), [0113](0113-agent-roles.md).
