# Line engine specification

Status: Why to Plan, and sizing of every piece of work ([0184](../decisions/0184-how-sizing-of-work-is-built.md)), built in `src/line/`; Intake, in a thin form, is built in `src/intake/` and meets the line through `IntakeHooks` and `IntakeLine` ([0185](../decisions/0185-how-intake-in-a-thin-form-is-built.md)); existing software in a thin form is built with its own module `src/existing` ([0189](../decisions/0189-how-taking-on-existing-software-is-built.md)); Build, Check and Run are built in `src/build/` behind the line engine's hand-off ([0186](../decisions/0186-how-build-check-and-run-are-built.md)), and each milestone's report is written by the [reporter](reporter.md) ([0130](../decisions/0130-the-build-starts-and-covers-all-of-premise.md), [0183](../decisions/0183-how-the-line-engine-is-built.md)). Related: [the line](../architecture/the-line.md), [record keeper](record-keeper.md), [work queue](work-queue.md), [page](page.md), [agent tools](agent-tools.md), [prompts](../prompts/README.md).

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
| Bring in software | Page server (operator) | A folder on this machine or a clone address; optionally a name and what it is for | Software id; premise's own copy is made, then the software is sized and its record recovered (5.10) | `INVALID` (with what to give instead), `NAME_TAKEN` |
| Offer the record again | Page server (operator) | Software taken on from existing code | The gate asks again before adding its record to the operator's repository | `INVALID` (asked already, added already, or not taken on yet) |
| Answer ask | Page server | Ask id; answer (for a draft: per item kept, struck or edited; for a question: text; for an approval: approve or refuse) | The waiting job resumes, or the stage moves on | `ASK_CLOSED` |
| Chat message | Page server | Software, text | Where it went: the open draft, or an intake item ([0118](../decisions/0118-how-chat-messages-are-routed.md)). While an existing software is still being copied, or its copy failed, nothing is taken in and the reply says why | none |
| Send back | Page server (operator) | Software, stage | The software reopens that stage; later stages are marked to repeat | `NO_SUCH_STAGE`; `INVALID` (an existing software's copy is not ready) |
| Claim area | Page server | Software, role label, the area in its own words | Claim id | none |
| Set size class | Page server (operator) | Software, small, medium or large | New stage budgets | `INVALID` (the software is finished or dropped) |
| Set a piece's size | Page server (operator) | Work item, small, medium or large | New stage budgets for that piece; recorded as the operator's | `NOT_FOUND`, `INVALID` |
| Set a piece's stages | Page server (operator) | Work item, the stages it should go through | Its stages; what is always needed stays, and the answer says so | `INVALID` (finished, or nothing changed) |
| Undo a split | Page server (operator) | Work item | Its parts withdrawn; it goes through the line whole | `INVALID` (not split, or a part is built) |
| Set priority | Page server (operator) | Software, priority | The work queue orders by it | none |
| Set effort | Page server (operator) | Software, low, medium or high | The cut the next scope check starts on; budgets of the stages before building ([5.2b](#52b-the-scope-check-and-effort)) | `INVALID` |
| Milestone wait | Page server (operator) | Software, milestone, wait or not | The software stops after that milestone, or no longer does ([5.8a](#58a-milestones-and-waits)) | none |
| Job finished | Work queue | Job, result | Next step for the software | none |

Asks are rows in `asks`; drafts are asks of kind `draft` (no separate table, [0183](../decisions/0183-how-the-line-engine-is-built.md)); claims in `claims` ([storage](storage.md)).

As built: what goes through the line is a work item, and each software is one root item ([0181](../decisions/0181-the-line-works-on-work-items.md)). Why, Who, What, the say-back and Plan each queue one agent job (What exists: one research job) with the published brief from `docs/prompts`. The later stages are behind the `LaterStages` interface ([0183](../decisions/0183-how-the-line-engine-is-built.md)): Build, Check and Run are `src/build`, one milestone at a time ([0186](../decisions/0186-how-build-check-and-run-are-built.md)); Intake is a labelled stand-in. The plan the planner submits also names each task's milestone, what kind of software it is, and how to build, start and check it ([0167](../decisions/0167-premise-adapts-at-runtime-to-the-software.md)).

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
| An existing software being taken on | Why (its record recovered from the code), What exists, Say back, Intake | Why, Say back, Intake ([0189](../decisions/0189-how-taking-on-existing-software-is-built.md)) |
| One part of an existing software whose record is recovered part by part | Why | Why |
| An intake item's work: a bug | Build, Check, Run, Report| all four ([0192](../decisions/0192-effort-in-proportion-to-what-was-asked.md)) |
| An intake item's work: a change to what it must do | What exists, What, Plan, Build, Check, Run, Report | What (taken in without a question, [0274](../decisions/0274-a-change-asks-at-most-one-question.md)), Build, Check, Run, Report |
| An intake item's work: other new work | What exists, Plan, Build, Check, Run, Report | Build, Check, Run, Report |
| An intake item's work: a change of purpose the operator confirmed | Why to Report | Why, Say back, Build, Check, Run, Report ([0185](../decisions/0185-how-intake-in-a-thin-form-is-built.md)) |

  A say-back is added whenever Why or What is, where the piece may have one. Every change premise makes to the sizer's answer is part of the reason the page shows.
- Splitting: only completely separate parts, or a very long part; one heavy piece is not by itself a reason; when unsure, not at all. Two to `line.split_max_parts` parts. Parts and fixes are not split again. `line.splitting` turns it off.
- A sizer that fails or gives no answer leaves the piece at its size, through every stage it may have, whole; the reason says so.
- One piece of a software is worked on at a time. A split piece's parts go through the line one after another up to Check. Then the whole is checked through the `WholeCheck` hand-off (a labelled stand-in until the Check stage takes it), and the piece goes on with Run, Report and, for a software, Intake. When the whole does not pass, a fix goes through as one more part, up to three rounds.
- A confirmed plan's milestones become the piece's parts, each referring to its `M-n` record item; waits stay on the record items (5.8a). After the last milestone, the software goes on to Intake.
- An intake item that goes in normally becomes a work item of kind `intake` under the software's root, referring to its `I-n` ([0185](../decisions/0185-how-intake-in-a-thin-form-is-built.md)). Intake work waits until the software's own round reaches Intake, then goes one item after another; when it is done the software rests at Intake again. Its report is the short one written when a change reaches running.
- **A change is planned and built as a change** ([0273](../decisions/0273-a-change-is-planned-and-built-as-a-change.md)). Its What goes into the record when the drafter ends: what the person's words gave, and what the drafter assumed (marked assumed); the drafter's own suggestions are only offered. At Plan the planner gets the change plan brief and returns only the decisions the change adds or replaces and the task or few tasks it needs (at most `line.change_max_tasks`); the plan is kept per work item beside the software's plan. There is no milestones question. Build runs only the change's tasks (one task named after the change when it had no Plan step); Check judges the items the change touches plus every must already met; the report says what changed, what was checked for it and again, and what was not. A split change's parts are steps of the change.
- **Before a change is built, premise asks at most once** ([0274](../decisions/0274-a-change-asks-at-most-one-question.md)): only when it replaces or adds a foundation decision, or the drafter named a choice the person's words left open, or the software asks about every change. That one question carries what premise understood, what it assumed, the decisions and what it will build. Otherwise premise says it in one line and builds; the same lines stay on a card that waits on nobody, and a line struck there is struck from the record and comes in as a follow-up change. Suggestions are added one click each and come in as changes of their own. A bug is never asked about; a change of purpose has its say-back. The choice is per software (every change, when it matters, never), from `line.change_questions`, else the effort (high: every change).
- At start-up an open milestones question that belongs to a change (left by an older premise) is withdrawn and the change is planned again as a change, with one line in the conversation; nothing built is lost.
- The operator can change any piece's size and stages, and undo a split until a part reaches Build. Sending back applies to the piece being worked on, or to the nearest piece above it that went through that stage itself; parts made after that stage are withdrawn.
- The software's stage view gives each stage's position for the piece being worked on: done, current, ahead, or skipped with the reason.
- The first time a piece reaches Build, the time it spent before building is recorded on it and on every piece above it that had not reached Build yet (`build-started` events), so the first stages can be measured ([0172](../decisions/0172-premise-measures-its-own-return.md)).

### 5.2b The scope check and effort

As built ([0191](../decisions/0191-scope-check-effort-and-milestones.md), the owner's decision with the builders' reading):

- **Effort** is low, medium or high per software, chosen at the start (default `softwares.default_effort`) and changed at any time. It sets the cut the scope check starts on, scales the budgets of the stages before building (`line.low_effort_budget_percent`, `line.high_effort_budget_percent`), and is told to the sizer, the drafter and the planner.
- **The scope check** is one ask after the whole software's What is confirmed (a draft ask shown as kind `scope`). premise sorts the live W items into what the operator asked for (their own items and the musts, except a must that names only users premise assumed), what premise recommends (should) and what it could add (could). It shows three cuts, only what I asked for, plus recommended, everything, each with a rough estimate of agent sessions and minutes from there to running software (premise's own measured minutes per session once it has five, `line.estimate_minutes_per_session` until then). One click picks a cut; any item can be moved to the first version, a later milestone, or left out. It is skipped, everything in the first version, when premise has nothing to add, or when `line.scope_check` is false.
- What is left out is marked `left-out` in the record: kept, not planned, built, checked or said back. The plan brief gives the planner the scope; premise refuses a plan whose tasks serve a left-out item or put an addition in the first milestone.

### 5.3 The stages

| # | Stage | Agent role and job | What happens | Exit condition | Writes |
|---|---|---|---|---|---|
| 1 | Why | drafter, `draft` | premise asks the operator once what the software is for, in the operator's own words. The drafter drafts the problem as three to seven items, plus the size class. The operator strikes or edits. | The operator has seen the list and nothing struck is left open | `why.md` |
| 2 | Who | drafter, `draft` | The drafter drafts plausible kinds of user, and the roles the software needs: people with taste in a part, people who decide or do what an LLM cannot. The operator corrects the list. The roles become the labels on what premise asks from then on ([0065](../decisions/0065-one-open-session.md)). | As for Why | `who.md` |
| 3 | What exists | researcher, `research` | The researcher searches the web and reads sources, within its budget. It lists what exists, each finding as one short line with its source and whether it read the page, only a summary, or nothing (never "assumed"); each can be struck on its own with an optional reason, the rest is shown on request, and choosing against the recommendation has a one-line reason box ([0270](../decisions/0270-premises-own-figures-and-asks-that-cost-attention-honestly.md)). It recommends one outcome: do not build, build on something, or build something different. It reads the motive from Why: saving effort, or finding a gap ([0023](../decisions/0023-looking-at-what-exists.md)). A "do not build" recommendation comes with its one-line alternative and is shown first ([0192](../decisions/0192-effort-in-proportion-to-what-was-asked.md)). | The operator has decided the outcome. "Do not build" ends the line with a report | `exists.md` |
| 4 | What | drafter, `draft` | The drafter drafts what the software must do, in purpose terms, with priorities (must, should, could). It offers its own ideas, marked as suggestions, citing only what the research checked, and asks only where being wrong is costly. People claim areas for their taste here (5.6). For the whole software the scope check follows (5.2b). | The operator has seen the list and nothing struck is left open; the scope is chosen | `what.md`, `taste.md` |
| 5 | Say back | drafter, `draft` | A list of at most ten items: what premise understood and assumed, in purpose terms, with assumptions marked. The operator strikes what is wrong; each struck item goes back to its stage. | Nothing is struck, or every struck item has been redone at its stage and the say-back shown again | Nothing new; it confirms |
| 6 | Plan | planner, `plan`; researcher and reviewer for foundations | The planner makes the technical decisions, each a `D` item with its reason and the alternative rejected. Foundation decisions get a small "what exists" look and a review by the reviewer before building ([0014](../decisions/0014-guard-against-further-big-mistakes.md), [0113](../decisions/0113-agent-roles.md)). The security defaults apply ([0092](../decisions/0092-security-defaults.md)). It writes a working plan: ordered tasks, each naming its items and a separate outcome a checker can check. The first task is the smallest version that runs; the first milestone is what the operator asked for. premise refuses, with the reason, a task that serves no W item, only items another task of its milestone serves, a left-out item, or an addition in milestone 1 ([0192](../decisions/0192-effort-in-proportion-to-what-was-asked.md)). | Every foundation decision reviewed with no objection left open; the working plan exists | `decisions.md`; the working plan in the data folder |
| 7 | Build | builder, `build` | Unattended ([build, check and run](../architecture/build-check-run.md)) | Every task of the change built and committed | Code; `D` items it proposes |
| 8 | Check | checker, `check` | Scenarios are written from the record in their own checker session as soon as the working plan names a change's items, before any build task for it starts; a separate fresh checker session judges the commit ([0122](../decisions/0122-scenarios-written-before-the-build.md), [build, check and run](../architecture/build-check-run.md)) | Outcomes in 5.7 | Scenarios (data folder), verdicts |
| 9 | Run | server, `run` | [Runner](runner.md) | The checked commit runs (after `run.md`'s build lines); a start that fails holds the line here, goes back to Build once by itself, then asks the operator [0280](../decisions/0280-the-run-step-builds-first-and-the-headline-tells-the-truth.md) | `RELEASE-NOTES.md` |
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
- Before a claimed area is built, a proposal is shown in the session under the claiming role. It is decided there; other tasks go on ([0102](../decisions/0102-taste-proposals-before-building.md)). As built ([0196](../decisions/0196-roles-and-taste-in-one-session.md)): when Build starts a milestone, each open claim not yet decided gets a `prototype` job run by the planner, which submits one or two described options with `proposal_submit` and names the plan's tasks that build the area. No task starts until the proposals are made; then only the named tasks wait for the role's answer. If no proposal comes, the role is asked in plain words. A claim made while a milestone is being built applies from the next one. Screenshots of a quick prototype ([0115](../decisions/0115-taste-prototypes-on-a-throwaway-branch.md)) are left for later.
- What the role keeps or says becomes a `T` item under the role, and the held tasks start with it in their brief. Those that can be checked go into the checker's scenarios. A correction (the role says what to change) is read into the taste lessons ([learning](learning.md)).
- A claim can be released: a proposal still waiting is withdrawn, and the tasks it held go on with premise deciding the area.
- Small wishes come in as intake.

### 5.7 Check outcomes

- Every must item met and no floor finding: the change passes, and the run stage starts. Only then is it called "passed" ([0220](../decisions/0220-approvals-and-verdicts-tell-the-truth.md)).
- No must item failed, but some could not be checked: "no failure found, N not verified". If some must items were met, it lands and runs, marked not fully verified, and the report says which items and what is needed to check them. If none could be verified, premise asks once: land it unverified, write what the checker needs (it checks the same version again), or stop; `line.when_nothing_verified: land` lands it unverified without asking, saying so.
- A must item not met, or a floor finding: back to the builder as a new task, with the evidence.
- Should or could items not met, and small defects: accepted and reported when fixing costs more than it is worth ([0006](../decisions/0006-llm-does-what-it-can.md)); the operator can reopen them.
- The same item failing three rounds: work on it stops, and the report names which role is needed and for what.
- As built ([0186](../decisions/0186-how-build-check-and-run-are-built.md)): a check judges the items the milestone's tasks serve plus the must items of milestones already landed (for a change from intake: the items it touches plus every must already met, [0273](../decisions/0273-a-change-is-planned-and-built-as-a-change.md)); "could not check" does not hold a change back once something was verified (see above); at the round limit premise asks the operator to give more rounds or land it as it is.

### 5.8 Waiting

- An ask holds only the job that made it. A builder's task that needs a decision only a person can make waits; other tasks go on.
- The "needed" list on the page is every open ask, grouped by role ([page](page.md)).

### 5.8a Milestones and waits

Builders' reading, open to the owner's correction ([0129](../decisions/0129-builders-reading-of-effort-and-milestone-waits.md)); the owner's requirement is [0128](../decisions/0128-effort-per-software-and-milestone-waits.md). Optional per software.

- premise proposes a software's milestones from the plan; the operator edits them. A software's milestones are not premise's own roadmap milestones.
- Each milestone ends at running software and a report.
- The first milestone is what the operator asked for; premise's additions the operator kept come in later milestones. When what follows the first milestone is only those additions, its wait is on by default (`line.wait_after_asked`, [0191](../decisions/0191-scope-check-effort-and-milestones.md)); the operator can untick it on the milestone list.
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

As built, in a thin form ([0188](../decisions/0188-existing-softwares-record-and-hand-edits.md), [0189](../decisions/0189-how-taking-on-existing-software-is-built.md)):

- The operator brings software in from the page ("Bring in software you already have"): a folder on this machine that is a git repository, or a clone address. premise clones it into its data folder and works only on that copy; the operator's folder is only read. A copy cut off when premise stops is made again when it starts.
- The sizer sizes the software as a piece of origin `existing` and may split a large one into separate parts, whose records are recovered one after another.
- At Why (shown as "Recover"), a `recover` job gives the drafter a read-only copy, the latest commits' first lines and the recovery brief. It submits with `recovery_submit`; when the job ends, every item goes into the record `from: recovered`, unconfirmed, with `run.md` (how to build, start and check it) and `recovered-trace.md` (best-guess links from old code). What premise could not check is named, with what it needs. Issues are not read yet.
- A conflict or gap is the drafter's question under the role it is for; its answer is taken in as an intake item.
- What exists is the researcher's smaller look ("since"); the operator keeps it, uses what exists for part of it, or stops.
- The say-back is every recovered item nobody confirmed, made by premise from the record, grouped and paged, answered once. Kept items are confirmed and struck items struck; no stage is redone. The card says a recovered record usually misses things and that corrections come in as intake.
- Then the gate asks before adding the record to the operator's repository, on a branch of its own (`existing.record_branch`); declined, the record stays in premise's copy and the page offers it again. The software rests at Intake; each change from then on goes through the line, its commits name what they serve, and pushing it to that branch goes through the gate again. The page says that hand edits outside premise make the record drift until that is built ([0177](../decisions/0177-tolerating-commits-made-outside-premise-later.md)).

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
| `softwares.default_effort` | medium | Effort a new software gets: low, medium or high (5.2b) |
| `line.low_effort_budget_percent`, `line.high_effort_budget_percent` | 50, 150 | Budgets of the stages before building at low and high effort |
| `line.scope_check` | true | Whether premise asks how much to build after What |
| `line.wait_after_asked` | true | Whether premise stops after the first milestone when only its own additions follow |
| `line.estimate_minutes_per_session`, `line.estimate_items_per_build` | 3, 3 | The scope check's rough estimate, until premise has measured its own sessions |
| `line.agents_per_stage` | 1 | Agents one stage of one piece may use at once; only 1 is used today ([0181](../decisions/0181-the-line-works-on-work-items.md)) |
| `agents.tasks.size.*` | fast tier, low effort, 20 turns, 5 minutes | The sizer's model, effort and limits |
| `agents.tasks.recover.*` | strongest tier, medium effort, 60 turns, 20 minutes | The drafter's model, effort and limits when recovering an existing software's record |
| `line.budgets.recover.*` | 40, 80, 160 turns; 20, 40, 80 minutes | Recovery's budget by size class (per part when split) |
| `existing.record_branch` | `premise` | The branch of the operator's repository the record goes to, once approved |
| `existing.history_commits` | 200 | How many of the latest commits' first lines the drafter reads |
| `existing.clone_timeout_minutes` | 10 | How long premise waits for its copy of the repository |

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
- Milestone 3: roles as labels on every ask; questions in each role's terms; taste claims and proposals before building. Built ([0196](../decisions/0196-roles-and-taste-in-one-session.md)).
- Milestone 4: the way back to Why from intake ([intake](intake.md)).
- Milestone 6: existing software (5.10). Its first part, the thin form, is built ([0189](../decisions/0189-how-taking-on-existing-software-is-built.md)); conflicts settled with people inside the take-on, reading issues, and pruning best-guess links stay for the rest of milestone 6.
- Milestone 7: several softwares at once.
