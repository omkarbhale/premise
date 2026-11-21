# The owner's later conversation, 2026-11-21: the first real run, scope, learning, clean-up and workers

What the owner said later on 2026-11-21, once the build had started ([instruction record](instruction-2026-11-21-build-starts.md)) and after the exchange on scale and direction ([record](scale-and-direction-2026-11-21.md)). "Owner" is the person premise is being made for; "the assistant" is the LLM agent the owner shaped premise with. The owner's words are verbatim, including spelling. The assistant's side is recorded in substance. Where the owner's words are already kept in a decision record, this entry points there and does not copy them again.

## Making premise: intake, and not rushing

After agreeing to the assistant's suggestions on direction, the owner said:

> Thanks, let me know when a small real software can go through this pipeline. Don't compromise quality or structure of planning because of intake to premise from me. (As premise will/should, haha)

This became [0249](../decisions/0249-the-owners-requests-during-the-build-are-intake-and-never-cost-structure.md): the owner's requests during the build are intake, sized and slotted, never rushed in at the cost of the structure of the planning.

## The first real run, and the assistant's review of it

The first real run took a tiny command-line tool (printing a file's lines in reverse) through the whole line with real agents, every one on the fast tier at low effort ([0187](../decisions/0187-kept-demos-and-one-real-run.md)). The owner asked what it had built and whether the agents had made the right call; the owner's question is not kept word for word. The assistant reviewed the run. In substance:

- **Right:**
  - the "do not build, a tool for this already exists" recommendation at the look at what exists (`tac` does it);
  - guesses marked as guesses, not stated as facts;
  - sensible priorities among the things it found.
- **Wrong:**
  - things the agents themselves had marked as optional ("could") were built without being asked for;
  - one suggestion was justified by a gap in the software that had not been checked;
  - a second user was invented, and its needs became work;
  - the work was split into more pieces than the size of the software called for.
- **Cost:** about three times what was asked for (26 agent sessions, three milestones, 18 minutes for two behaviours; [0191](../decisions/0191-scope-check-effort-and-milestones.md)).
- **The assistant's first fix:** suggestions are not built unless kept, and a small software gets one milestone.

The owner replied:

> But to be fair, in a real software all these are things you could want. So two things, maybe bringing human in for scope check, and effort level which is already in our plan, and perhaps milestones where premise waits. What do you think?

The assistant agreed and replaced its fixed defaults: the scope check is one ask with tiers and a rough cost; the software's effort level sets the default cut; milestone 1 is what was asked and premise waits after it when only its own additions follow; no suggestion is justified by a gap nobody checked; no over-splitting; bug reports go straight to build. These are [0191](../decisions/0191-scope-check-effort-and-milestones.md) and [0192](../decisions/0192-effort-in-proportion-to-what-was-asked.md).

## Learning is two things

The owner's words and the assistant's answer are in [0195](../decisions/0195-two-kinds-of-learning.md).

## Taking on existing software

The owner's "Those two are fine as they are" is in [0188](../decisions/0188-existing-softwares-record-and-hand-edits.md).

## Making premise: clean-up and workers

The owner said:

> Yes you can cleanup copies that don't lose anything from now on

This is [0250](../decisions/0250-copies-that-lose-nothing-may-be-cleaned-up.md). After the assistant had dropped to one worker at 83% of the week's usage, the owner said:

> Thanks! You can go back to three/four workers, don't worry!

This is [0251](../decisions/0251-three-or-four-workers-at-a-time-while-building.md).

## Wording

The owner asked for the name of the assistant's tooling to be reworded to "the assistant" in the public quote of the instruction; the rule that the repository never names it is [0252](../decisions/0252-the-assistants-tooling-is-not-named-in-the-repository.md).

## What followed

- The decisions are records [0249](../decisions/0249-the-owners-requests-during-the-build-are-intake-and-never-cost-structure.md)–[0252](../decisions/0252-the-assistants-tooling-is-not-named-in-the-repository.md).
- During validation the assistant also chose, for the owner, four things that needed records: [0245](../decisions/0245-reports-are-about-one-named-version.md)–[0248](../decisions/0248-sent-back-to-why-is-recorded-only-once-it-has-started.md). Two more already had records: the resume after a weekly overrun in [0200](../decisions/0200-how-cost-and-the-spending-limit-are-built.md), and what "passed" means and when nothing could be verified in [0220](../decisions/0220-approvals-and-verdicts-tell-the-truth.md). All are open to the owner's correction.
