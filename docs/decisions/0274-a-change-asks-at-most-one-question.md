# 0274. A change asks at most one question before it is built, and otherwise tells

- Status: Accepted; chosen for the owner by the assistant from [VISION.md](../../VISION.md) principle 6, open to the owner's correction
- Partly supersedes: [0192](0192-effort-in-proportion-to-what-was-asked.md) point 5 (the plain confirm of What that a wish changing What got before it was planned)
- Scope: The product
- Date: 2026-11-23
- Decided by: The assistant for the owner, from vision principle 6, on the owner's question about his first real run: "Does every intake go through drafted list with human approval, or does it decide for me which to automatically take forward? And what should happen ideally? Intake also went through this drafted list, followed by milestones approval."
- Source: The owner's first real run: his change got two blocking questions in a row, a five-line list to confirm and then the milestones question ([0273](0273-a-change-is-planned-and-built-as-a-change.md)).

## Context

- Vision principle 6: "When being wrong is cheap it decides and shows its assumptions; when it is not, it asks."
- A wish that changed what the software must do was asked to confirm its What list, and then (the fault in 0273) the milestones.

## Decision

1. **A change gets at most one blocking question before it is built,** and only when at least one of these holds: it replaces a foundation decision or adds one, so it is costly to undo; it touches the floor; it touches purpose; or the person's own words left a real choice open that premise cannot settle (the drafter names it as `open_choice`, for example "not sure whether effort matters"). The floor and purpose keep their existing routes: triage asks at once for the floor, and a change of purpose goes back to Why and is said back, which is its one question.
2. **That one question carries everything together:** what premise understood from the person's words, what it assumed and has not checked (marked assumed), the decisions the change makes (naming the one it replaces and why), and what it will build. It is asked once, just before Build, after the plan and any foundation review. Each line can be kept, struck or edited.
3. **Otherwise premise proceeds at once** on the person's words and says, without blocking, what it understood and assumed ("I-1 taken as ...; assumed, not checked with you: ...; building now: ..."). The same lines are shown on a card that waits on nobody; each line stays strikeable while the change builds. A line struck after the fact is struck from the record and comes in as a follow-up change, and learning reads the strike as it reads any correction. The card closes when the change is done.
4. **What premise adds beyond the person's words stays optional** and is never built on silence: its suggestions are offered on the same card, one click each to add, and an added one comes in as a change of its own.
5. **A bug still gets no question** and no notice beyond the line's usual words.
6. **A setting per software chooses this:** ask about every change, only when it matters (the default), or never ask, just tell me. It is on the Line tab ("Changes you send"); `line.change_questions` sets it for every software, and when that is unset the effort decides: high effort asks about every change, low and medium only when it matters.
7. **At most one question is per plan of a change.** When a change is planned again (a send-back, or the person's correction), premise asks again only if what it would put to the person differs from what they already answered: a different decision replaced, a new assumption not checked, a new open choice. It keeps a fingerprint of what was asked on the change's notes. When the question would be the same, premise says in one line that it kept the earlier answer and builds. Keeping the earlier answer means keeping what the person answered, decision by decision, read from the stored answer to the earlier question: a decision they kept is kept, one they edited keeps their edit, one they struck stays struck, not recorded and not built. A decision of the new plan that the earlier answer does not cover is a changed question: premise asks once, about those only, and says in the question's instruction what the earlier answer already settled.
8. **On the page a change shows one compact card:** the person's words, what premise took from them, what it assumed (marked not checked), and what it is doing now.

## Reason

- Principle 6, as quoted above: being wrong about a change premise tells the person about is cheap, because they can strike it while it builds; being wrong about a foundation decision or an open choice is not, so premise asks, once.
- Two questions for one change cost the owner's attention twice for one decision ([0027](0027-spend-least-of-peoples-attention.md)).

## Alternatives considered

| Alternative | Why rejected |
| --- | --- |
| Keep the What confirm for every change that changes What | It blocks every change on a question whose answer is almost always "yes"; principle 6 says to decide and show. |
| Ask at What and again before Build when a foundation changes | Two questions for one change, the very complaint. |
| Build premise's suggestions unless struck | Suggestions are premise's ideas, not the person's words; building them on silence spends their money on what they did not ask for. |

## Consequences

- The line engine takes a change's What into the record when the drafter ends (`takeInChangeWhat`), and before Build asks once (`change-confirm`) or tells (`change-notice`, an ask marked as a notice, not counted as waiting on you).
- New API: `POST /api/softwares/:id/change-questions` and `POST /api/asks/:id/suggestions/:key/add`.
- The drafter's What brief says how to mark what was assumed, what is a suggestion and what is an open choice.

## Related

[0020](0020-when-to-say-back.md), [0028](0028-say-back-as-assumptions-to-strike.md), [0185](0185-how-intake-in-a-thin-form-is-built.md), [0192](0192-effort-in-proportion-to-what-was-asked.md), [0273](0273-a-change-is-planned-and-built-as-a-change.md).
