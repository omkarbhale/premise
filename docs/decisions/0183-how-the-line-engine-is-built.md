# 0183. How the line engine runs Why to Plan in their thinnest form

- Status: Accepted
- Scope: Making premise
- Date: 2026-11-21
- Decided by: The builders, while building the line engine. The owner did not make these choices.
- Source: [line engine](../specs/line-engine.md), [the line](../architecture/the-line.md), [0020](0020-when-to-say-back.md), [0028](0028-say-back-as-assumptions-to-strike.md), [0084](0084-who-has-the-last-word.md), [0085](0085-stage-effort-budgets.md), [0118](0118-how-chat-messages-are-routed.md), [0154](0154-a-stand-in-line-until-the-line-engine-exists.md).

## Context

- The specification fixes the stages, their exit conditions, who has the last word and the say-back's form. It leaves to the builders how a draft becomes a record change, how a struck say-back item goes back, and how the stages built later plug in.

## Decision

Each is a builders' choice, open to correction:

1. **One job per stage draft.** Entering Why, Who, What or the say-back queues one `draft` job; What exists one `research` job; Plan one `plan` job. Each job's brief is the published brief from `docs/prompts`, filled in. Each job gets its stage's budget (by size class) as its turn and time limits, when those are smaller than the task's own.
2. **A draft is an ask.** An agent's `draft_submit` becomes an ask of kind `draft` (What exists: a question with the findings and a recommended outcome; say-back: kind `say-back`). The drafted items, with their kinds and priorities, are kept with the ask. No separate `drafts` table is made.
3. **What the operator confirmed goes into the record as the operator's decision.** On purpose, users and priorities the operator has the last word ([0084](0084-who-has-the-last-word.md)), so the line engine gives a confirmed list the review verdict "consistent" itself, writes it through the record keeper, and merges it. Kept items keep their mark; edited ones are `from: operator`; struck ones are added and then struck with the operator's reason, so the record shows what was rejected and why.
4. **The size class is not a record item.** The Why draft's "Size: ..." item sets the software's size class when kept or edited.
5. **A struck say-back item strikes the record items it stands for.** Each say-back item names the record items it rests on. Striking it strikes them in the record, with the reason, and sends the software to the earliest stage they came from. That stage is drafted again (the drafter is told what was struck and why), and once it is confirmed the line goes straight back to the say-back, not through the stages between.
6. **Chat while a list is open goes onto the list, then to the drafter.** The message is added at once as an item in the operator's words, and a `draft` job with the chat corrections brief may redraft the list. A drafter that says the message is "not about the draft" takes it off the list and it becomes intake. Otherwise chat is intake ("Taken as I-n").
7. **A stage that ends without its draft asks the operator,** with "Try again" and "Try again with twice the budget", and says nothing was lost.
8. **Plan:** the planner submits its decisions, milestones and ordered tasks with `draft_submit`; the working plan is kept in the data folder (`plans/<software>/`). Foundation decisions get one review job; an objection gets one revision by the planner, and an objection left after that is said in the session while the line goes on. The operator then confirms the milestones (each with a "stop after it" box); the decisions, the milestones and any changes agents proposed with `record_propose` go into the record together.
9. **The repository outside this machine is asked through the gate, and building does not wait for it** ([0182](0182-how-the-gate-is-built.md)).
10. **Build, Check, Run, Report and Intake are behind one interface** (`LaterStages`), opened per milestone. Until the line hands them to their modules, a scripted stand-in completes Build, Check, Run and Intake, labelled on the page; the report that ends each milestone is written by the reporter ([0164](0164-how-the-reporter-is-built.md)). A milestone's report ends it; a milestone with a wait stops the software (`waiting-milestone`, so no job starts for it) and asks "go on" or "go back to Why".
11. **An agent's `ask` does not hold its session.** The question is asked under its role; the agent carries on with its best attempt, and the answer goes into the next brief at that stage.
12. **The scripted agent calls premise's tools in-process,** through the same checks as a real agent, so tests and demos run the real line engine without AI.

## Reason

- 1, 2, 12: the thinnest form the specification asks for, through seams that already exist (work queue, agent runner, asks).
- 3: the specification says the operator decides these; a reviewer job on every confirmed list would ask a model to check a person's decision.
- 5: the owner's instruction for this step asks for the record to change to match a struck assumption; redoing every later stage would spend the operator's attention on stages nothing changed.
- 9: only the work that depends on an answer waits ([0101](0101-the-gate-asks-in-the-session.md)).

## Alternatives considered

| Alternative | Why rejected |
| --- | --- |
| A `drafts` table beside `asks` | The same rows twice; an ask already holds a list with per-item answers. |
| Redo every stage after a struck say-back item | More of the operator's attention for stages that rest on nothing that changed. |
| Leave struck draft items out of the record | The drafter and the reports could not see what was rejected and why. |
| Block building until the repository question is answered | Holds all work on one answer that only a copy depends on. |

## Consequences

- The stand-in line of [0154](0154-a-stand-in-line-until-the-line-engine-exists.md) is replaced; only the later stages remain a stand-in, labelled.
- The line engine's specification and the storage specification say so.

## Related

[0154](0154-a-stand-in-line-until-the-line-engine-exists.md), [0159](0159-how-the-record-keeper-is-built.md), [0160](0160-milestones-are-record-items.md), [0180](0180-premise-uses-real-agents-by-default.md), [0181](0181-the-line-works-on-work-items.md), [0182](0182-how-the-gate-is-built.md).
