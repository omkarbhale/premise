# 0191. A scope check after What, an effort level per software, and the first milestone for what was asked

- Status: Accepted. The owner's words are the decision; the builders' reading below is open to the owner's correction.
- Scope: The product
- Date: 2026-11-21
- Decided by: The owner, verbatim: "But to be fair, in a real software all these are things you could want. So two things, maybe bringing human in for scope check, and effort level which is already in our plan, and perhaps milestones where premise waits." How it works is the builders' reading, marked below.
- Source: The owner's answer, given through the supervising assistant, to the builders' first proposal after the one real run ([0187](0187-kept-demos-and-one-real-run.md)). That proposal made two things fixed defaults: premise's own suggestions never built unless the operator kept each one, and a small software always getting one milestone. The owner set both aside with the words above. The effort level is the one the owner already asked for in [0128](0128-effort-per-software-and-milestone-waits.md) ("how much effort to put").

## Context

- The one real run built a tool that prints a file's lines in reverse. The operator, scripted, kept every list. premise took 26 agent sessions, three milestones and 18 minutes for the two behaviours asked for. Its own suggestions (reading standard input, huge files) and an invented second user's needs (help text, a test suite) became the second and third milestones because nobody struck them.
- The owner's point: in a real software these are things a person could want. So the answer is not to drop premise's ideas but to let the person choose how much, once, with what it costs in sight, and to stop after what they asked for.

## Decision

The owner's decision, in the owner's words above: a scope check that brings the person in; an effort level, already in the plan ([0128](0128-effort-per-software-and-milestone-waits.md)); milestones where premise waits.

The builders' reading, open to the owner's correction:

1. **A scope check: one ask after What, before planning.** premise sorts what the software must do into three tiers: what you asked for (the operator's own items and the musts), what premise recommends adding (should), and what it could also add (could). Each of the three cuts (only what I asked for, plus what premise recommends, everything) shows a rough cost in agent sessions and minutes, labelled as a rough estimate. One click picks a cut; any item can be moved to the first version, a later milestone, or left out. It is one ask, not an interview, and it is skipped when premise has nothing to add. What is left out stays in the record, marked `left-out`, and is not planned, built or checked; it can be brought back later.
2. **An effort level per software: low, medium or high.** It is set when the software is started or changed at any time on the Line tab, with the default from the setting `softwares.default_effort` (medium). It sets the cut the scope check starts on (low: only what was asked; medium: plus recommended; high: everything), and it scales the budgets of the stages before building (`line.low_effort_budget_percent`, 50; `line.high_effort_budget_percent`, 150). The sizer is told it. The weekly share and priority fields stay as they are.
3. **Milestones: the first is what was asked for.** The first milestone is what the person asked for, the smallest version that runs; what premise added goes into later milestones. premise refuses a plan that puts an addition in the first milestone or serves anything left out. When what follows the first milestone is only premise's own additions, premise stops after it by default (`line.wait_after_asked`), so the person tries the software before more is built. The stop can be unticked on the milestone list, or the person says go on at once.
4. **Assumed users stay marked as assumed.** What a user premise assumed needs (an item that names only assumed users) goes in the recommended or could tier, never in "what you asked for", even when the drafter wrote it as a must.
5. **The estimate** uses premise's own measured minutes per agent session once it has five finished sessions, and `line.estimate_minutes_per_session` (3) until then; one builder session is taken to cover `line.estimate_items_per_build` (3) items.
6. **This replaces** "one milestone for a small item" and "suggestions are never built unless kept", which the builders had proposed as fixed defaults.

## Reason

- The owner: "in a real software all these are things you could want." A person chooses once, seeing the cost, instead of premise either building everything unasked or never offering it.
- The stop after the first milestone is where the person judges whether the software fixes the right problem ([0128](0128-effort-per-software-and-milestone-waits.md), [0129](0129-builders-reading-of-effort-and-milestone-waits.md)).
- Builders' reasons: medium as the default keeps premise's recommendations on offer, as the owner's words suggest, while the stop after the first milestone keeps the cost of them behind the person's own look at running software. The scope check is kept as a draft ask in the database and shown as its own kind, because the asks table's kinds are fixed and the gate's requests refer to it.

## Alternatives considered

| Alternative | Why rejected |
| --- | --- |
| premise's suggestions never built unless kept one by one | Set aside by the owner: in a real software they are things a person could want. |
| One milestone for every small software | Set aside by the owner; replaced by "the first milestone is what was asked for". |
| The scope check as one more draft card of keep and strike | Keep and strike says nothing of cost or of later; three cuts with a rough cost answer "how much" in one click. |
| Low effort as the default | Builders' choice against it: it would hide premise's recommendations from someone who has not read the guide; medium offers them and the stop after the first milestone protects the person's time. Open to the owner's correction. |

## Consequences

- Carried in the [line engine](../specs/line-engine.md), the [page](../specs/page.md), the [record keeper](../specs/record-keeper.md) (the `left-out` mark), the [storage](../specs/storage.md) (schema 8), the [drafter](../prompts/drafter.md), [planner](../prompts/planner.md) and [sizer](../prompts/sizer.md) prompts, and the [configuration reference](../reference/configuration.md).
- The choices made for the owner are listed in the [open questions](../open-questions.md).

## Related

[0128](0128-effort-per-software-and-milestone-waits.md), [0129](0129-builders-reading-of-effort-and-milestone-waits.md), [0117](0117-size-classes-set-stage-budgets.md), [0187](0187-kept-demos-and-one-real-run.md), [0192](0192-effort-in-proportion-to-what-was-asked.md).
