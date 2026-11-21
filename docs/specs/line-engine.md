# Line engine specification

Status: Why to Plan, and sizing of every piece of work ([0184](../decisions/0184-how-sizing-of-work-is-built.md)), built in `src/line/`; Intake, in a thin form, is built in `src/intake/` and meets the line through `IntakeHooks` and `IntakeLine` ([0185](../decisions/0185-how-intake-in-a-thin-form-is-built.md)); Build, Check and Run are built in `src/build/` behind the line engine's hand-off ([0186](../decisions/0186-how-build-check-and-run-are-built.md)), and each milestone's report is written by the [reporter](reporter.md) ([0130](../decisions/0130-the-build-starts-and-covers-all-of-premise.md), [0183](../decisions/0183-how-the-line-engine-is-built.md)). Related: [the line](../architecture/the-line.md), [record keeper](record-keeper.md), [work queue](work-queue.md), [page](page.md), [agent tools](agent-tools.md), [prompts](../prompts/README.md).

## 1. Purpose

The line engine knows where each software is on the line, picks the next step, and asks in the session, labelling each ask with its role. It is how the whole line is the product: no step exists where a person carries work to an LLM by hand ([0010](../decisions/0010-the-whole-line-is-the-product.md)). It is opinionated about where the conversation starts and where it goes ([0011](../decisions/0011-opinionated-about-conversation-and-records.md)).

## 2. Responsibilities and non-responsibilities

Responsible for:

- each software's current stage, its exit conditions, and moving it on;
- sending a software back to any stage when the operator asks;
- creating jobs for each stage in the [work queue](work-queue.md);
- placing every ask in the one session, labelled with the role it is for ([0065](../decisions/0065-one-open-session.md));
- applying who has the last word ([0084](../decisions/0084-who-has-the-last-word.md));
- stage effort budgets and size classes ([0085](../decisions/0085-stage-effort-budgets.md), [0117](../decisions/0117-size-classes-set-stage-budgets.md));
- the say-back and when it happens ([0020](../decisions/0020-when-to-say-back.md), [0028](../decisions/0028-say-back-as-assumptions-to-strike.md));
- taste claims and the proposals they need ([0022](../decisions/0022-people-can-put-in-their-taste.md), [0102](../decisions/0102-taste-proposals-before-building.md));
- applying check outcomes ([build, check and run](../architecture/build-check-run.md));
- routing chat messages ([0118](../decisions/0118-how-chat-messages-are-routed.md));
- taking on existing software (milestone 6).

Not responsible for:

- writing the record ([record keeper](record-keeper.md));
- running agents ([agent runner](agent-runner.md));
- floor actions ([gate](gate.md));
- triage and readings ([intake](intake.md));
- writing reports ([reporter](reporter.md)).

## 3. Interfaces

| Operation | Caller | Inputs | Outputs | Errors |
|---|---|---|---|---|
| Start software | Page server (operator, in the session) | A name, and optionally the first words about it | Software id; a repository created by the server ([runner](runner.md)); the Why stage open | `NAME_TAKEN` |
| Answer ask | Page server | Ask id; answer (for a draft: per item kept, struck or edited; for a question: text; for an approval: approve or refuse) | The waiting job resumes, or the stage moves on | `ASK_CLOSED` |
| Chat message | Page server | Software, text | Where it went: the open draft, or an intake item ([0118](../decisions/0118-how-chat-messages-are-routed.md)) | none |
| Send back | Page server (operator) | Software, stage | The software reopens that stage; later stages are marked to repeat | `NO_SUCH_STAGE` |
| Claim area | Page server | Software, role label, the area in its own words | Claim id | none |
| Set size class | Page server (operator) | Software, small, medium or large | New stage budgets | `INVALID` (the software is finished or dropped) |
| Set a piece's size | Page server (operator) | Work item, small, medium or large | New stage budgets for that piece; recorded as the operator's | `NOT_FOUND`, `INVALID` |
| Set a piece's stages | Page server (operator) | Work item, the stages it should go through | Its stages; what is always needed stays, and the answer says so | `INVALID` (finished, or nothing changed) |
| Undo a split | Page server (operator) | Work item | Its parts withdrawn; it goes through the line whole | `INVALID` (not split, or a part is built) |
| Set priority | Page server (operator) | Software, priority | The work queue orders by it | none |
| Milestone wait | Page server (operator) | Software, milestone, wait or not | The software stops after that milestone, or no longer does ([5.8a](#58a-milestones-and-waits)) | none |
| Job finished | Work queue | Job, result | Next step for the software | none |

Asks are rows in `asks`; drafts are asks of kind `draft` (no separate table, [0183](../decisions/0183-how-the-line-engine-is-built.md)); claims in `claims` ([storage](storage.md)).

As built: what goes through the line is a work item, and each software is one root item ([0181](../decisions/0181-the-line-works-on-work-items.md)). Why, Who, What, the say-back and Plan each queue one agent job (What exists: one research job) with the published brief from `docs/prompts`. The later stages are behind the `LaterStages` interface ([0183](../decisions/0183-how-the-line-engine-is-built.md)): Build, Check and Run are `src/build`, one milestone at a time ([0185](../decisions/0185-how-build-check-and-run-are-built.md)); Intake is a labelled stand-in. The plan the planner submits also names each task's milestone, what kind of software it is, and how to build, start and check it ([0167](../decisions/0167-premise-adapts-at-runtime-to-the-software.md)).

## 4. Data owned

`softwares` (current stage, size class, state), `stage_runs`, `asks`, `drafts`, `claims`, `chat_messages` ([storage](storage.md)).

## 5. Behaviour

### 5.1 Rules for every stage

- premise drafts first and people correct ([0027](../decisions/0027-spend-least-of-peoples-attention.md)). A question is asked only when being wrong is costly.
- Each question is labelled with the role it is for, in that role's terms, and asked in the one session ([0009](../decisions/0009-everyone-needed-is-a-user.md), [0065](../decisions/0065-one-open-session.md)). Whoever is in the session answers it.
- Every output is a short list. Each item can be struck, kept or edited on the page, one at a time ([0029](../decisions/0029-lists-over-long-paragraphs.md)).
- A software moves on when the stage's exit condition holds. The operator can send it back to any stage.
- Each stage has an effort budget sized to the software; a small software gets short stages ([0085](../decisions/0085-stage-effort-budgets.md)).

### 5.2 Size classes and budgets

- At Why, the drafter proposes a size class (small, medium, large) as an assumption on the Why draft, which the operator can strike ([0117](../decisions/0117-size-classes-set-stage-budgets.md)). The operator can change it at any time.
- The class sets each stage's budget in agent turns and minutes, from the table in 6. When a stage's budget is used up, the stage ends with what it has: its draft is shown with what is missing marked, and the operator decides whether to go on or give more.

### 5.2a Sizing each piece of work

As built ([0184](../decisions/0184-how-sizing-of-work-is-built.md)); the owner's decisions are [0168](../decisions/0168-any-piece-of-work-goes-through-the-same-line-at-its-own-size.md) and [0170](../decisions/0170-what-may-be-split-is-decided-by-strong-prompting.md).

- Before a piece of work's first stage, a sizer job ([docs/prompts/sizer.md](../prompts/sizer.md)) decides, each with a reason: its size class, the stages it needs, and whether it splits into parts. A piece is the software itself, one of its milestones, one part of a split piece, or (with intake) an intake item. It is sized when the line comes to it.
- The rules premise holds the sizer to:

| Piece | May go through | Always goes through |
|---|---|---|
| A new software | every stage | Why, What, Say back, Plan, Build, Check, Run, Report, Intake (so only Who and What exists can be skipped) |
| A milestone of a confirmed plan | Build, Check, Run, Report | all four |
| A part of a split piece, or a fix | Why to Check | Build, Check |
| An intake item's work | Why to Report | Build, Check, Run, Report; for a change of purpose the operator confirmed, also Why and Say back ([0185](../decisions/0185-how-intake-in-a-thin-form-is-built.md)) |

  A say-back is added whenever Why or What is. Every change premise makes to the sizer's answer is part of the reason the page shows.
- Splitting: only completely separate parts, or a very long part; one heavy piece is not by itself a reason; when unsure, not at all. Two to `line.split_max_parts` parts. Parts and fixes are not split again. `line.splitting` turns it off.
- A sizer that fails or gives no answer leaves the piece at its size, through every stage it may have, whole; the reason says so.
- One piece of a software is worked on at a time. A split piece's parts go through the line one after another up to Check. Then the whole is checked through the `WholeCheck` hand-off (a labelled stand-in until the Check stage takes it), and the piece goes on with Run, Report and, for a software, Intake. When the whole does not pass, a fix goes through as one more part, up to three rounds.
- A confirmed plan's milestones become the piece's parts, each referring to its `M-n` record item; waits stay on the record items (5.8a). After the last milestone, the software goes on to Intake.
- An intake item that goes in normally becomes a work item of kind `intake` under the software's root, referring to its `I-n` ([0185](../decisions/0185-how-intake-in-a-thin-form-is-built.md)). Intake work waits until the software's own round reaches Intake, then goes one item after another; when it is done the software rests at Intake again. Its report is the short one written when a change reaches running.
- The operator can change any piece's size and stages, and undo a split until a part reaches Build. Sending back applies to the piece being worked on, or to the nearest piece above it that went through that stage itself; parts made after that stage are withdrawn.
- The software's stage view gives each stage's position for the piece being worked on: done, current, ahead, or skipped with the reason.
- The first time a piece reaches Build, the time it spent before building is recorded on it and on every piece above it that had not reached Build yet (`build-started` events), so the first stages can be measured ([0172](../decisions/0172-premise-measures-its-own-return.md)).

### 5.3 The stages

| # | Stage | Agent role and job | What happens | Exit condition | Writes |
|---|---|---|---|---|---|
| 1 | Why | drafter, `draft` | premise asks the operator once what the software is for, in the operator's own words. The drafter drafts the problem as three to seven items, plus the size class. The operator strikes or edits. | The operator has seen the list and nothing struck is left open | `why.md` |
| 2 | Who | drafter, `draft` | The drafter drafts plausible kinds of user, and the roles the software needs: people with taste in a part, people who decide or do what an LLM cannot. The operator corrects the list. The roles become the labels on what premise asks from then on ([0065](../decisions/0065-one-open-session.md)). | As for Why | `who.md` |
| 3 | What exists | researcher, `research` | The researcher searches the web and reads sources, within its budget. It lists what exists, with sources, and recommends one outcome: do not build, build on something, or build something different. It reads the motive from Why: saving effort, or finding a gap ([0023](../decisions/0023-looking-at-what-exists.md)). | The operator has decided the outcome. "Do not build" ends the line with a report | `exists.md` |
| 4 | What | drafter, `draft` | The drafter drafts what the software must do, in purpose terms, with priorities (must, should, could). It offers its own ideas, marked as suggestions, and asks only where being wrong is costly. People claim areas for their taste here (5.6). | The operator has seen the list and nothing struck is left open | `what.md`, `taste.md` |
| 5 | Say back | drafter, `draft` | A list of at most ten items: what premise understood and assumed, in purpose terms, with assumptions marked. The operator strikes what is wrong; each struck item goes back to its stage. | Nothing is struck, or every struck item has been redone at its stage and the say-back shown again | Nothing new; it confirms |
| 6 | Plan | planner, `plan`; researcher and reviewer for foundations | The planner makes the technical decisions, each a `D` item with its reason and the alternative rejected. Foundation decisions get a small "what exists" look and a review by the reviewer before building ([0014](../decisions/0014-guard-against-further-big-mistakes.md), [0113](../decisions/0113-agent-roles.md)). The security defaults apply ([0092](../decisions/0092-security-defaults.md)). It writes a working plan: ordered tasks, each naming its items and small enough to check. The first task is the smallest version that runs. | Every foundation decision reviewed with no objection left open; the working plan exists | `decisions.md`; the working plan in the data folder |
| 7 | Build | builder, `build` | Unattended ([build, check and run](../architecture/build-check-run.md)) | Every task of the change built and committed | Code; `D` items it proposes |
| 8 | Check | checker, `check` | Scenarios are written from the record in their own checker session as soon as the working plan names a change's items, before any build task for it starts; a separate fresh checker session judges the commit ([0122](../decisions/0122-scenarios-written-before-the-build.md), [build, check and run](../architecture/build-check-run.md)) | Outcomes in 5.7 | Scenarios (data folder), verdicts |
| 9 | Run | server, `run` | [Runner](runner.md) | The checked commit runs | `RELEASE-NOTES.md` |
| 10 | Report | reporter, `report` | [Reporter](reporter.md) | Report written | The report |
| 11 | Intake | triager, reader | [Intake](intake.md) | Each item routed | Intake items |

What exists repeats at a smaller size before a large feature or a foundation choice. The operator can send a software back to any stage; the stages after it repeat only where the reopened stage changed something they rest on.

### 5.4 The say-back

- When ([0020](../decisions/0020-when-to-say-back.md)):
  - at the start of a new software;
  - on taking on an existing one;
  - later, for a change that replaces a `Y` or `U` item, a must item, or a foundation decision, or that is costly to undo.
- Form: a short list of assumptions to strike out, not a document to agree with ([0028](../decisions/0028-say-back-as-assumptions-to-strike.md)). At most ten items.
- It is only the cheap first check. Running software shown early is the real one, so the plan's first task is always the smallest version that runs.

### 5.5 Who has the last word

Applied to every decision a stage meets ([0084](../decisions/0084-who-has-the-last-word.md)):

| Kind of decision | premise | Person |
|---|---|---|
| Anything that follows from the record and is cheap to undo | Decides and records why | Nobody is asked, unless the area is claimed |
| Purpose, users, priorities | Drafts and suggests | The operator decides |
| An area claimed for taste | Proposes | Decided under the role that claimed it |
| What an LLM cannot reliably know or do: an intent nobody stated, real-world acts, accountability | Gives its best attempt with its reasons ([0007](../decisions/0007-llm-does-not-decide-what-it-cannot.md)) | Asked under the role that decides or acts |
| The floor | Requests through the gate | The gate asks ([gate](gate.md)) |

### 5.6 Taste

- An area is claimed in the session under a role, in its own words ("the look of the main screen", "the API's naming") ([0022](../decisions/0022-people-can-put-in-their-taste.md)).
- By default premise decides; a person claims the areas they want to see before they are built.
- Before a claimed area is built, a proposal is shown in the session under the claiming role: a screenshot of a quick prototype, or a short list. It is decided there; other tasks go on ([0102](../decisions/0102-taste-proposals-before-building.md)). The builder builds the prototype on a throwaway branch and the server takes the screenshot ([0115](../decisions/0115-taste-prototypes-on-a-throwaway-branch.md)).
- What the role says becomes `T` items. Those that can be checked go into the checker's scenarios.
- Small wishes come in as intake.

### 5.7 Check outcomes

- Every must item met and no floor finding: the change passes, and the run stage starts.
- A must item not met, or a floor finding: back to the builder as a new task, with the evidence.
- Should or could items not met, and small defects: accepted and reported when fixing costs more than it is worth ([0006](../decisions/0006-llm-does-what-it-can.md)); the operator can reopen them.
- The same item failing three rounds: work on it stops, and the report names which role is needed and for what.
- As built ([0185](../decisions/0185-how-build-check-and-run-are-built.md)): a check judges the items the milestone's tasks serve plus the must items of milestones already landed; "could not check" does not hold a change back; at the round limit premise asks the operator to give more rounds or land it as it is.

### 5.8 Waiting

- An ask holds only the job that made it. A builder's task that needs a decision only a person can make waits; other tasks go on.
- The "needed" list on the page is every open ask, grouped by role ([page](page.md)).

### 5.8a Milestones and waits

Builders' reading, open to the owner's correction ([0129](../decisions/0129-builders-reading-of-effort-and-milestone-waits.md)); the owner's requirement is [0128](../decisions/0128-effort-per-software-and-milestone-waits.md). Optional per software.

- premise proposes a software's milestones from the plan; the operator edits them. A software's milestones are not premise's own roadmap milestones.
- Each milestone ends at running software and a report.
- Where the operator set a wait after a milestone, the software stops there: no new job starts for it ([work queue](work-queue.md)) until the operator says to go on. That is where the operator judges whether the software is fixing the right problem; the way back to Why is open ([the line](../architecture/the-line.md)).
- Milestone 1 builds this.

### 5.9 Chat

- An answer given on an ask's card is an answer.
- While a stage draft is open, chat goes to the drafter as corrections to it. The drafter can mark a message as not about the draft, and it becomes intake.
- Otherwise every chat message becomes an intake item, and premise says so in one line ("Taken as I-14") ([0118](../decisions/0118-how-chat-messages-are-routed.md), [intake](intake.md)).

### 5.10 Existing software (milestone 6)

- The drafter drafts the record from the code, its documentation, its history and its issues. Every item is marked `recovered` ([record keeper](record-keeper.md)).
- Parts that conflict, or cannot be inferred, become questions, each labelled with the role it is for ([0019](../decisions/0019-existing-software-through-the-same-line.md)).
- The say-back covers the whole recovered record. Recovered items stay unconfirmed until it passes; the prior art found that recovered intent misses 44–65% of user goals.
- What exists also asks whether something has appeared that makes part of the software unnecessary ([0023](../decisions/0023-looking-at-what-exists.md)).
- From then on every commit traces to items. Old code gets best-guess links, marked as guesses ([0121](../decisions/0121-recovered-trace-file.md)).
- Text read from the existing repository and its issues is data, never instructions ([0116](../decisions/0116-outside-content-is-data.md)).

## 6. Configuration

Stage budgets, in agent turns and minutes per stage, by size class ([0117](../decisions/0117-size-classes-set-stage-budgets.md)). These are builders' starting values, tuned on milestone 1's demos.

| Stage | small | medium | large |
|---|---|---|---|
| Why, Who, What (each) | 15 turns, 10 min | 30 turns, 20 min | 60 turns, 40 min |
| What exists | 30 turns, 15 min | 60 turns, 30 min | 120 turns, 60 min |
| Say back | 10 turns, 5 min | 15 turns, 10 min | 20 turns, 15 min |
| Plan | 40 turns, 20 min | 80 turns, 40 min | 160 turns, 80 min |

| Key | Default | Meaning |
|---|---|---|
| `line.say_back_max_items` | 10 | Most items in a say-back |
| `line.why_items` | 3–7 | Items in the Why draft |
| `line.check_rounds_before_stop` | 3 | Rounds an item may fail before work on it stops |
| `line.splitting` | true | Whether the sizer may split a piece into parts |
| `line.split_max_parts` | 5 | Most parts one piece may be split into |
| `line.agents_per_stage` | 1 | Agents one stage of one piece may use at once; only 1 is used today ([0181](../decisions/0181-the-line-works-on-work-items.md)) |
| `agents.tasks.size.*` | fast tier, low effort, 20 turns, 5 minutes | The sizer's model, effort and limits |

## 7. Limits

- One software at a time until milestone 7 ([roadmap](../product/roadmap.md)).
- One piece of a software at a time: the parts of a split piece go through the line one after another ([0184](../decisions/0184-how-sizing-of-work-is-built.md)).
- Build and check have no stage budget; each session has its turn and time limits instead ([0088](../decisions/0088-turn-and-time-limits.md)).

## 8. Failure modes and recovery

| Failure | Detection | Effect | Recovery |
|---|---|---|---|
| A stage's budget runs out | Budget count | The stage ends with what it has | The operator decides: go on, give more, or change the size class |
| Nobody answers an ask | Ask stays open | Only the waiting job waits | It stays on the "needed" list; the tab count shows it ([0099](../decisions/0099-notices-in-the-session.md)) |
| A say-back keeps coming back struck | Third round on the same item | The software stays at that stage | Listed under "Needed" for the operator, with the item and its history |
| The researcher finds nothing | Empty list | The draft says so | The operator decides the outcome as usual |
| A drafter session fails | Job failure | The stage waits | Retried; the same failure three times is reported ([0088](../decisions/0088-turn-and-time-limits.md)) |
| The sizer fails or gives no answer | Its job ends without an answer | The piece goes through every stage it may have, whole, at its size; the reason says so | The operator changes it on the Line tab |
| premise stops while a piece is being sized | The sizer's job is found running at start | The sizing resumes | Nothing to do |

## 9. Security considerations

- An ask that touches the floor is the gate's, not the line engine's ([gate](gate.md)).
- The session is the only place people answer; there are no per-person links ([0065](../decisions/0065-one-open-session.md)).

## 10. Observability

- Every stage entered and left is a `stage_runs` row and an event, with its budget used.
- Reports count questions asked per role (milestone 3 reports this per role).

## 11. Milestones

- Milestone 1 step 2 (Why to Plan built; later stages stand in): stages Why to Plan in their thinnest form: one draft per stage, corrections in chat, a strike-out say-back, a short look at what exists. Only the operator; no taste claims; one software at a time. Milestones and waits (5.8a).
- Milestone 3: roles as labels on every ask; questions in each role's terms; taste claims and proposals before building.
- Milestone 4: the way back to Why from intake ([intake](intake.md)).
- Milestone 6: existing software (5.10).
- Milestone 7: several softwares at once.
