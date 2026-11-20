# Glossary

The words premise's documents use, in plain language. Where a word was settled with the owner, the record is linked.

## People and parts

| Term | Meaning |
| --- | --- |
| Product | premise itself: what is being made ([0021](decisions/0021-vocabulary-product-and-software.md)). |
| Software | What premise builds ([0021](decisions/0021-vocabulary-product-and-software.md)). |
| Owner | The person premise is being made for. |
| Assistant | The LLM agent the owner shaped premise with. |
| Builders | The agents that build premise itself. |
| Operator | The person who knows what a software is for. That is all premise requires of them. One person or several, technical or not ([0008](decisions/0008-operator-knows-the-purpose.md)). |
| Role | A label on what premise asks of people: the operator, a role that claimed an area for taste, a role that decides or does what an LLM cannot. Every ask says which role it is for, in that role's terms ([0065](decisions/0065-one-open-session.md)). Roles a software needs are `R` items in its record. |
| Agent | One LLM session premise runs: Claude Code, headless, one child process ([0071](decisions/0071-headless-claude-code-agents.md)). |
| Agent role | What an agent is for, with its own instructions and tools: drafter, researcher, reviewer, planner, builder, checker, triager, reader, reporter ([0113](decisions/0113-agent-roles.md)). |
| Session | The one place on premise's page where everything is open and answerable: every stage, the record, reports, and what each role needs ([0065](decisions/0065-one-open-session.md)). Also used for one agent's run ("agent session"). |
| Server | The one Node.js process on the owner's machine that holds every module of premise ([0067](decisions/0067-one-process-agents-as-children.md)). |
| Data folder | premise's own folder in the user's home directory: its database, working copies, transcripts, job logs, check scenarios and evidence. Agents cannot read it ([0072](decisions/0072-sqlite-state.md), [0087](decisions/0087-agents-run-confined.md)). |
| Working copy | An agent's own copy of a software's repository, the only place it can write ([0086](decisions/0086-working-copy-and-branch-per-change.md)). |

## The line

| Term | Meaning |
| --- | --- |
| Line | The whole chain from idea to running software and back: Why, Who, What exists, What, Say back, Plan, Build, Check, Run, Report, Intake. The whole line is the product ([0010](decisions/0010-the-whole-line-is-the-product.md)). |
| Stage | One step of the line. Each has an exit condition and an effort budget ([0085](decisions/0085-stage-effort-budgets.md)). |
| Draft | premise's first attempt at a stage's output, as a short list people strike, keep or edit ([0027](decisions/0027-spend-least-of-peoples-attention.md)). |
| What exists | The stage that looks at what is already out there. Outcomes: do not build, build on something, build something different ([0023](decisions/0023-looking-at-what-exists.md)). |
| Say-back | A list of at most ten things premise understood and assumed, for the operator to strike out ([0020](decisions/0020-when-to-say-back.md), [0028](decisions/0028-say-back-as-assumptions-to-strike.md)). |
| Assumption | Something premise decided and shows instead of asking, because being wrong is cheap. Marked `from: assumed` in the record until someone strikes it ([0027](decisions/0027-spend-least-of-peoples-attention.md)). |
| Foundation decision | A technical choice that is costly to undo: language, framework, storage, how it runs, data model, who can get in. Gets a small "what exists" look and a review by a second agent ([0014](decisions/0014-guard-against-further-big-mistakes.md)). |
| Size class | Small, medium or large: proposed at Why, sets the stage budgets ([0117](decisions/0117-size-classes-set-stage-budgets.md)). |
| Check | The independent judgement of the running software against the record, by an agent other than the builder ([0030](decisions/0030-independent-check.md)). |
| Scenario | What the checker will try, written from the record into premise's data folder, out of the builder's reach ([0090](decisions/0090-scenarios-out-of-the-builders-reach.md)). |
| Verdict | The checker's finding per item: met, not met, or could not check, with evidence. |
| Running | The software started from a clean copy and open to people: a link, a command and its output, or a built program ([0017](decisions/0017-the-line-ends-at-running-software.md)). |
| Intake | Ideas and problems coming back in from people, the software's users and premise itself ([0018](decisions/0018-existing-software-and-automatic-intake.md)). Items get `I-n` IDs. |
| Triage | The triager agent reading an intake item against the record to give it a kind and a route ([0094](decisions/0094-triager-reads-every-item.md)). |
| Route | Where an intake item goes: in normally (the default), asked at once, held, or merged or closed ([0062](decisions/0062-intake-goes-in-normally.md)). |
| Held | Intake that means little alone and something together, read later with others like it ([0095](decisions/0095-what-is-held.md)). |
| Reading | The reader agent going through held items together and writing a short list for the operator ([0096](decisions/0096-when-held-items-are-read.md)). |
| Taste | What a person wants in a part of the software. By default premise decides; a person claims an area to see a proposal before it is built ([0022](decisions/0022-people-can-put-in-their-taste.md), [0102](decisions/0102-taste-proposals-before-building.md)). |
| Needed list | What is needed from which role, each with exactly what to do, grouped by role in the session ([0099](decisions/0099-notices-in-the-session.md)). |
| Existing software | Software premise did not build, taken on by recovering its record with people ([0019](decisions/0019-existing-software-through-the-same-line.md)). Recovered items are marked `recovered`. |

## The record

| Term | Meaning |
| --- | --- |
| Lasting record | Purpose, users, what the software must do, decisions with their reasons, rejected alternatives. Kept current by premise as part of every change ([0025](decisions/0025-two-kinds-of-record.md)). For a software, its `premise/` folder. |
| Working record | Plans, transcripts, job logs, check evidence: as detailed as the work needs, kept but not maintained ([0025](decisions/0025-two-kinds-of-record.md)). |
| `premise/` folder | Where a software's lasting record lives, at the root of its repository: `why.md`, `who.md`, `exists.md`, `what.md`, `taste.md`, `decisions.md`, `run.md` ([0080](decisions/0080-record-in-the-softwares-repository.md)). |
| Item | One line of the record with a stable ID, for example `- [W-7] People can export their list as a CSV file. (must; from: operator; 2026-11-21)` ([0082](decisions/0082-record-as-markdown-with-ids.md)). |
| ID prefixes | `Y` why, `U` users, `R` roles, `E` what exists, `W` what it must do, `T` taste, `D` decisions, `I` intake. |
| Must, should, could | The priority of a `W` item. Every must item has to be met for a change to pass. |
| `run.md` | How to build, start and open the software. The checker runs it from a clean copy every time. |
| Trace trailer | The `Premise-Trace:` line on every commit premise makes, naming the items it serves ([0083](decisions/0083-trace-trailer-on-every-commit.md)). |
| Record keeper | The only writer of a software's lasting record ([spec](specs/record-keeper.md)). |

## Safety

| Term | Meaning |
| --- | --- |
| Floor | What is never traded for speed: losing data, security holes, spending money, acting publicly in someone's name, false reports ([0056](decisions/0056-what-is-on-the-floor.md)). |
| Floor action | A concrete action on the floor that the gate recognises ([0100](decisions/0100-floor-actions.md)). |
| Gate | The part every floor action passes through; it asks in the session under the role whose call it is ([0101](decisions/0101-the-gate-asks-in-the-session.md)). |
| Approval | A recorded yes from the gate's ask, for one action or a named kind of action for one software; can be withdrawn. |
| Confinement | Claude Code's sandbox plus permission rules: an agent writes only in its working copy, cannot read premise's data folder or credentials, and reaches only allowed hosts ([0087](decisions/0087-agents-run-confined.md)). |
| Security defaults | What every software gets unless the operator decides otherwise, applied in the plan and checked by the checker ([0092](decisions/0092-security-defaults.md)). |

## Tools and models

| Term | Meaning |
| --- | --- |
| Claude Code | Anthropic's coding agent, run headless as each of premise's agents ([0071](decisions/0071-headless-claude-code-agents.md)). |
| MCP | The protocol premise uses to serve each agent its tools, with a token per session ([0073](decisions/0073-mcp-tools-with-session-tokens.md)). |
| Tier alias | A name for a model tier (strongest, fast) rather than a pinned version, so a better model makes premise better without a change ([0105](decisions/0105-tier-aliases.md)). |
| usage-ledger | A separate project of the owner's that reads what agents and accounts record and gives cost figures and budgets. premise uses it and builds no cost tracking of its own ([0064](decisions/0064-cost-and-spending-limit-from-usage-ledger.md)). |
| entail | Another project of the owner's. premise may build on it underneath; nobody has to use both ([0063](decisions/0063-premise-may-depend-on-other-tools.md)). |
| Skill | Shared written guidance appended to an agent role's prompt ([0114](decisions/0114-prompts-and-skills-as-files.md), [catalog](skills/README.md)). |
| Prompt | An agent role's instructions and task briefs ([prompts](prompts/README.md)). |

## Making premise

| Term | Meaning |
| --- | --- |
| Milestone | One step of building premise, finished with a demo shown running and a short report ([roadmap](product/roadmap.md)). |
| Shown running | A recorded run with its evidence kept. |
| Scripted operator | Answers written before a demo run and fed in by a test script ([0108](decisions/0108-scripted-operator-for-demos.md)). |
| Decision record | One decision per file in [docs/decisions](decisions/README.md), with who decided, the reason and the alternatives rejected. Never edited to reverse it; a later record supersedes it. |
| Prior art | The research into what already exists for a product like premise ([report](prior-art/report.md)). |
