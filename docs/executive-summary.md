# Executive summary

> **Status: being built.** The owner said to build the whole of premise ([0130](decisions/0130-the-build-starts-and-covers-all-of-premise.md)). The foundation comes first: the package, configuration, storage, the work queue, a scripted agent standing in for Claude, a mock of usage-ledger marked as mocked, and the setup check ([roadmap](product/roadmap.md)).

## The problem

- Before premise, the loop from a stated intent to a deployed change existed, as the assistant described it, "in pieces held together by hand". It broke on 2026-11-20, and the assistant later said "Today's loop broke at exactly those hand-carried joins" ([how we work](how-we-work.md#why-premise-is-being-made), [0010](decisions/0010-the-whole-line-is-the-product.md)).
- The owner chose to make something new rather than build on that loop: "I want to rethink everything, and I want to also decide what is in and what is not in this." ([0002](decisions/0002-rethink-everything.md))
- The prior-art research found that nothing built covers the whole line from idea to running software ([report](prior-art/report.md)):
  - crowded: building, spec and plan checkpoints, AI code review, migrations with tests to check against;
  - thin: deciding what to build, several people entering at their own steps, reporting at a detail the operator chooses, cost against value, recovering intent from existing code;
  - not found anywhere: a product that owns the conversation and will not build until the problem and users are settled; routing each question to the right person in their own terms; keeping a record of rejected alternatives.
- What the research says goes wrong: intent mismatch is the top reported failure; human attention, not build speed, is the bottleneck; agents game checks they can reach; non-expert operators are where security incidents cluster.
- The owner confirmed this problem statement, and eight points of what is being built, on 2026-11-21 ([0126](decisions/0126-what-is-being-built-confirmed.md)).

## The product

premise is one product that takes software from an idea to running software, and keeps taking work back in, with LLMs doing everything an LLM can do ([VISION.md](../VISION.md)).
- It is for someone who knows what the software is for. That is all it requires of them ([0008](decisions/0008-operator-knows-the-purpose.md)).
- Per software, the operator can decide how much effort it gets, as a share of weekly usage or by priority, and can make milestones and have premise wait after them ([0128](decisions/0128-effort-per-software-and-milestone-waits.md)).
- Every other person the software needs is also a user, asked in their own terms at their step ([0009](decisions/0009-everyone-needed-is-a-user.md)).
- If an LLM can do it, an LLM does it; return on effort decides, not perfection. If an LLM cannot reliably do it, it proposes and a person decides ([0006](decisions/0006-llm-does-what-it-can.md), [0007](decisions/0007-llm-does-not-decide-what-it-cannot.md)).

## What makes it different

- **The whole line is the product.** Why, Who, What exists, What, Say back, Plan, Build, Check, Run, Report, Intake, with no step where a person carries work to an LLM by hand ([0010](decisions/0010-the-whole-line-is-the-product.md)).
- **It owns the conversation.** It clears the problem first, drafts users when they are missing, and decides where the conversation goes ([0011](decisions/0011-opinionated-about-conversation-and-records.md)).
- **It spends least of people's attention.** It drafts and shows its assumptions instead of asking when being wrong is cheap; it speaks in lists ([0027](decisions/0027-spend-least-of-peoples-attention.md), [0029](decisions/0029-lists-over-long-paragraphs.md)).
- **It guards against the mistake that matters:** a mismatch between what was wanted and what was understood. It says back a short list to strike out, traces every built piece to the record, and shows running software early ([0013](decisions/0013-mismatch-of-intent-is-the-mistake-that-matters.md)).
- **The check is out of the builder's reach.** A different agent judges the running result against the record and never sees the builder's account ([0030](decisions/0030-independent-check.md)).
- **It keeps a lasting record**, in each software's own repository, with decisions, reasons and rejected alternatives, changed in the same commit as the code ([0025](decisions/0025-two-kinds-of-record.md), [0080](decisions/0080-record-in-the-softwares-repository.md)).
- **It reports honestly**, from recorded facts only, including what failed and what it could not check ([0097](decisions/0097-reports-from-recorded-facts.md)).
- **Some things are never traded for speed:** losing data, security holes, spending money, acting publicly in someone's name, false reports. Agents hold no credentials and run confined; a gate asks before any of these ([0056](decisions/0056-what-is-on-the-floor.md), [0101](decisions/0101-the-gate-asks-in-the-session.md)).
- **It is general.** Any kind of software; its logic is about the line and the records, so a better model makes it better ([0031](decisions/0031-the-product-is-general.md), [0049](decisions/0049-any-kind-of-software.md)).

## How it runs

- One Node.js server in TypeScript on the owner's machine, one browser page with one session where everything is open, Claude Code agents run headless on the owner's subscription, each confined, each software in its own GitHub repository, cost and the spending limit from usage-ledger ([architecture overview](architecture/overview.md)).

## What milestone 1 delivers

- **First:** proof that premise can drive LLM work unattended through the owner's Claude subscription on the owner's machine, with confinement that holds. If that cannot be proven, work stops for the owner.
- **Then:** the thinnest line, end to end: one software at a time, only the operator, Why to Plan in their thinnest form, one builder and one independent checker, the server's merge and push, running software with a link or a command, and a report each time a change reaches running.
- **Also:** work sized per piece, with splitting only where the parts are separate or very long ([0167](decisions/0167-any-piece-of-work-goes-through-the-same-line-at-its-own-size.md), [0169](decisions/0169-what-may-be-split-is-decided-by-strong-prompting.md)); the page showing three phases, Understand, Build and Running, with the eleven stages as detail ([0173](decisions/0173-the-page-shows-three-phases.md)); a software's milestones, with a wait after any the operator sets ([0129](decisions/0129-builders-reading-of-effort-and-milestone-waits.md), the builders' reading).
- **Shown by:** two small softwares of different kinds, a command-line utility and a small web app, each taken from a one-paragraph idea to running software with a scripted operator; in each, one assumption struck in the say-back and one planted defect caught by the checker ([roadmap](product/roadmap.md)).

## What comes later

The owner's first software goes through premise as early as possible, before the later milestones are built ([0127](decisions/0127-first-software-is-one-the-owner-needs.md)); chosen for the owner: usage-ledger ([0137](decisions/0137-first-software-is-usage-ledger.md)). In order ([roadmap](product/roadmap.md), [0178](decisions/0178-the-roadmap-is-reordered.md)): intake in a thin form; existing software in a thin form ([0170](decisions/0170-existing-software-much-earlier-in-a-thin-form.md)); premise's own measures, and learning from corrections ([0171](decisions/0171-premise-measures-its-own-return.md), [0172](decisions/0172-premise-learns-from-corrections.md)); real use, usage-ledger first, then premise's own remaining work ([0174](decisions/0174-premise-is-used-for-real-as-soon-as-milestone-1-runs.md)); every role in one session, and cost and the spending limit, mocked until usage-ledger exists ([0133](decisions/0133-usage-ledger-is-mocked-until-it-exists.md)), with the rest of intake and existing software. Last, after two real softwares have run through premise: other people setting premise up (hosting, accounts), and software kept live on public hosts, with several softwares at once ([0177](decisions/0177-hosting-for-others-accounts-and-public-deployment-pushed-later.md)). Later, with an issue each: the checker on a different model from the builder; tolerating commits made outside premise.

## Main risks, and what meets them

| Risk | What meets it |
| --- | --- |
| The conversation turns into paperwork | Drafts instead of interviews; stage budgets; a say-back of at most ten items |
| A say-back that confirms the wrong thing | The smallest running version first; the checker judges against the record |
| Existing software swallows the effort | It comes in a thin form first, after thin intake |
| The whole line is a lot | The thinnest line first, one milestone at a time |
| Agents gaming their checks; false reports | Scenarios out of the builder's reach; a checker that never sees the builder's claims; reports from facts only |
| Destructive actions | No credentials for agents; confinement; the gate |
| Model changes breaking premise | Instructions about the line, not one model; tier aliases; one part that knows the runtime |
| Insecure defaults | Security defaults applied and checked on every change |

The full list is in the [architecture overview](architecture/overview.md#where-this-can-go-wrong-and-what-meets-it). What is still open is in [open questions](open-questions.md).
