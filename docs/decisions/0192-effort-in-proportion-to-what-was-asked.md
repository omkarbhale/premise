# 0192. Effort in proportion to what was asked: prompts, plan checks, triage and measures

- Status: Accepted
- Scope: The product
- Date: 2026-11-21
- Decided by: The builders. The owner's decision on scope, effort and milestones is [0191](0191-scope-check-effort-and-milestones.md); everything here is the builders' choice, open to the owner's correction.
- Source: The one real run with real agents ([0187](0187-kept-demos-and-one-real-run.md)): its record, plan, transcripts and log, and a fresh-eyes walkthrough of premise.

## Context

The one real run (a tool that prints a file's lines in reverse; every agent on haiku at low effort; a scripted operator who kept every item) took 26 agent sessions, 3 milestones and 18 minutes for two asked behaviours. Its causes, besides those [0191](0191-scope-check-effort-and-milestones.md) answers:
- A suggestion was justified by a gap nobody checked: "handle files too large to hold in memory, since that is the gap E-7 named for tac", where the research had only raised it as a hypothetical.
- The planner split what one change covers: a separate task for "plain errors" that task 1 had already done. The builder found nothing to commit, and the task was tried again about eight times.
- Builders twice left out the trace trailer, and the task was tried again.
- The research recommended "do not build: an alias to tac does the job", the cheapest outcome of all, but it read as one line among others.
- In the walkthrough, a reported bug was read as a wish and reopened What and the say-back: two interview questions for something the record already required.

## Decision

1. **Suggestions rest on what was checked.** The researcher marks each finding as checked (the page itself read) or not checked, and writes a supposed gap as "not checked". The drafter may cite only what was checked for a suggestion; otherwise the line says "not checked" and is a could. The planner may not justify extra work by an unchecked gap.
2. **Each task is a separate outcome a checker can check.** The planner prompt says to fold a task whose outcome another task necessarily delivers, and that a small software usually has one build task per milestone. premise refuses a plan, with the reason, when a task serves no W item (nothing to check on its own), when a task serves only W items another task of the same milestone serves, or when a task names a milestone the plan does not have. The planner fixes it and submits again.
3. **The trace line is given, and hard to leave out.** The builder's brief carries the exact trailer line for its task (for example `Premise-Trace: W-1, D-2`). The builder's working copy has a commit-msg hook that adds that line to a message naming no trace; a message that names one is left alone. The server's check on push stays, and a refused commit's message still says exactly what to add.
4. **"Do not build" comes first.** The researcher gives, with a "do not build" recommendation, the one line the operator would use instead (`alternative`, for example an alias). premise then titles the ask "premise recommends not building it", leads with "Instead: ...", lists "Do not build it" first, and records the alternative with the outcome.
5. **A bug is built and checked straight away.** The triager says whether an item changes what the software must do (`changes_what`). A bug, something the record already requires that does not work, never does: its work goes through Build, Check, Run and Report only. A wish that changes what it must do reopens What, with one plain confirm ("This changes what it must do; confirm to change it") and no say-back after it. Other new work is planned and built without reopening What. A change of purpose is unchanged: Why and the say-back, with the operator's confirmation first.
6. **premise measures its own proportion.** Per software, the report's "Effort" section gives the agent sessions and the time from the idea to the first running version, and the sessions in all, from premise's own records (the agent sessions and runs tables), not from usage-ledger's figures.
7. **The kept demos and the real run follow.** The scripted operators take the scope check's starting choice as it is. The command-line demo has one premise suggestion, so it shows the scope check; the web demo's planted wrong assumption is a must, so the say-back still shows it. The real run runs at low effort and says what it expects: one milestone and at most about 15 agent sessions.

## Reason

- 1: a suggestion that rests on a guess adds work nobody needed; in the real run it was a whole milestone.
- 2: the repeated "plain errors" task cost about eight builder sessions. A check in code holds the rule when a weaker model does not follow the prompt; the subset rule cannot catch every overlap, so the prompt carries the rest.
- 3: two of the real run's retries were for the trailer alone. The hook adds only the line premise itself gave, naming the items the task serves, so the trace stays true.
- 4: not building is the cheapest outcome, so it is said first.
- 5: a bug report on something already required is not a new wish; asking What and the say-back again spends the person's attention on nothing new ([0027](0027-spend-least-of-peoples-attention.md)). The say-back stays for changes of purpose ([0020](0020-when-to-say-back.md)).
- 6: proportion can only be seen if it is measured ([0172](0172-premise-measures-its-own-return.md)).

## Alternatives considered

| Alternative | Why rejected |
| --- | --- |
| Only prompt changes, no plan checks | The real run's planner was given the prompt and split anyway; a refusal with the reason is cheap and the planner fixes it in the same session. |
| A hard cap on tasks per milestone for a small software | Too blunt: two separate outcomes are two tasks. The subset rule and the prompt address the real cause, overlap. |
| Writing the trailer onto commits in the server after the build | The commit then differs from what the builder made and tested; a hook in the builder's own git keeps one commit. |
| A wish that changes What also said back | Two asks for one change; the What confirm is the say-back for it, in one plain sentence. |
| Session counts from usage-ledger | It does not exist yet and is mocked ([0133](0133-usage-ledger-is-mocked-until-it-exists.md)); premise's own tables already hold the facts. |

## Consequences

- Carried in the [drafter](../prompts/drafter.md), [researcher](../prompts/researcher.md), [planner](../prompts/planner.md), [builder](../prompts/builder.md), [sizer](../prompts/sizer.md) and [triager](../prompts/triager.md) prompts; the [line engine](../specs/line-engine.md), [intake](../specs/intake.md), [reporter](../specs/reporter.md), [agent tools](../specs/agent-tools.md) and [storage](../specs/storage.md) specifications.
- Ideas left out of this change are filed as GitHub issues on the repository.

## Related

[0083](0083-trace-trailer-on-every-commit.md), [0172](0172-premise-measures-its-own-return.md), [0184](0184-how-sizing-of-work-is-built.md), [0185](0185-how-intake-in-a-thin-form-is-built.md), [0186](0186-how-build-check-and-run-are-built.md), [0187](0187-kept-demos-and-one-real-run.md), [0191](0191-scope-check-effort-and-milestones.md).
