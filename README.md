# premise

One product that takes software from an idea to running software, and keeps taking work back in, with LLMs doing everything an LLM can do.

- It is for someone who knows what the software is for. That is all the product requires of them.
- Every other person the software needs is also a user of the product, and is asked in their own terms at their step.
- If an LLM can do it, an LLM does it; return on effort decides, not perfection. If an LLM cannot reliably do it, it proposes and a person decides.

The full statement is in [VISION.md](VISION.md).

premise is being built, and most of the line already works: see the [status page](docs/status.md) for what is in and what is not.

## Quick start

You need [Node.js](https://nodejs.org) 22.13 or later and git.

```sh
git clone https://github.com/omkarbhale/premise.git
cd premise
npm install
npm run build
npm run doctor    # checks this machine; creates nothing
```

Then pick one:

| I want to… | Run | What happens |
| --- | --- | --- |
| **Use my Claude Code login** (real agents) | `npm start` | Agents are Claude Code sessions on your login; no API key. On Linux and WSL2 they also need bubblewrap and socat (`sudo apt install bubblewrap socat`); `npm run doctor` says what is missing. |
| **Look around without AI** | `npm run demo` | Scripted agents follow a script and call no AI; the software built is a placeholder. The page labels them. If you bring in software of your own, writing premise's record to your repository is still real, and its approval card says so. |

Either prints a link such as `http://localhost:4610/#token=…`. Open it, describe a software in a sentence or two, and the page says what happens next. The link holds a private token; restarting gives a new one, and `npm run new-link` prints a new one any time (older links stop working). If real agents cannot start, premise still starts, says on the page what is missing, and offers "look around with scripted agents".

`npm install` may print a note that esbuild's install script is allowed; that is expected and harmless. It should report no vulnerabilities.

More:

- `npm run demo:cli` and `npm run demo:web` run a whole scripted build, check and run in the terminal, and stop ([0187](docs/decisions/0187-kept-demos-and-one-real-run.md)). `npm run demo:web` does not leave a link running; use `npm run demo` to click around.
- `npm run real-run -- --confirm` takes a tiny tool through the whole line with real agents on your login (haiku, low effort, the software at low effort so only what was asked is built). Use it sparingly.
- Usage figures are mocked until usage-ledger exists; the page labels them "Mocked". Each software can be given a budget (a share of the week's usage or dollars a week); when it is used up, only that software pauses and you choose what happens next. `premise demo budget` shows it.
- Change settings (how many agents run at once, the model and effort for each type of task, and more) in `config.json` in the data folder (`~/.premise` by default), or with environment variables: [configuration reference](docs/reference/configuration.md).
- Another port or data folder: `npm start -- --port 4700`, `npm start -- --data <folder>`. `--help` anywhere prints help; a flag premise does not know is an error and starts nothing.

For working on premise: `npm run dev` (rebuilds the server on change), `npm test`, `npm run lint`, `npm run typecheck`. `npm test` needs the page built (`npm run build`) and Playwright's headless Chromium (`npx playwright install chromium-headless-shell`) for its one browser test, which saves screenshots of each main state in `test-artifacts/screenshots/`. Every change goes through the no-mistakes validation pipeline ([0131](docs/decisions/0131-changes-go-through-the-validation-pipeline.md)); CI runs the same checks.

## The code

One TypeScript package ([0075](docs/decisions/0075-one-package.md)):

| Folder | What it is | Specification |
| --- | --- | --- |
| `src/config/` | The settings: one list with defaults and checks, loaded from `config.json` and `PREMISE_*` variables | [configuration reference](docs/reference/configuration.md) |
| `src/storage/` | The SQLite database in the data folder, with numbered migrations | [storage](docs/specs/storage.md) |
| `src/queue/` | The work queue: jobs that survive a restart, the parallel limit, priority, the same-failure rule, the usage-limit pause | [work queue](docs/specs/work-queue.md) |
| `src/agents/` | The agent runner's interface; the scripted agent used by every test; real Claude Code sessions (confinement, limits, stop and resume); the tools agents reach premise through | [agent runner](docs/specs/agent-runner.md), [agent tools](docs/specs/agent-tools.md) |
| `src/usage-ledger/` | usage-ledger's interface (the contract it has to meet), and its mock | [usage-ledger contract](docs/specs/usage-ledger.md) |
| `src/usage/` | Usage per software, step, change and item beside premise's own counts; budgets; pausing a software that overruns | [usage and budgets](docs/specs/usage.md) |
| `src/record/` | The record keeper: the record's format, proposed changes, trace trailers, the reading API; `premise record check <folder>` | [record keeper](docs/specs/record-keeper.md) |
| `src/git/` | The one small module for git, and the repository host seam | [record keeper](docs/specs/record-keeper.md#54a-repositories) |
| `src/runner/` | The runner: starts a built software from a clean copy by its `run.md`, confined, on a local port; restarts it a few times when it crashes; shows the link or the command and the latest output | [runner](docs/specs/runner.md) |
| `src/reporter/` | The reporter: gathers recorded facts and builds the report (short by default, more on request), release-note drafts and milestone reports | [reporter](docs/specs/reporter.md) |
| `src/doctor/` | The setup check | [page server](docs/specs/page-server.md#51-prerequisites) |
| `src/server/` | The page server: the session token, Host and Origin checks, the API, the event stream, and the service interfaces the rest of premise answers | [page server](docs/specs/page-server.md) |
| `src/line/` | The line engine: work items, the stages Why to Plan run by agent jobs with briefs from `docs/prompts`, and the hand-off to the later stages | [line engine](docs/specs/line-engine.md), [0183](docs/decisions/0183-how-the-line-engine-is-built.md), [0181](docs/decisions/0181-the-line-works-on-work-items.md) |
| `src/build/` | Build, Check and Run for each milestone: scenarios first, a builder per task, a fresh checker per commit, fix rounds, and the server landing and starting the checked commit | [build, check and run](docs/architecture/build-check-run.md), [0186](docs/decisions/0186-how-build-check-and-run-are-built.md) |
| `src/demo/` | The scripted agent's scripts, the two kept demos, and the one real run | [0187](docs/decisions/0187-kept-demos-and-one-real-run.md) |
| `src/intake/` | Intake: items numbered `I-n` from the session, the page's report box, the feedback page (its own link), a software's GitHub issues (behind an interface with a local fixture) and premise itself; the triager's job and premise's rules for its answer; the routes (in normally onto the line, asked, held, merged or closed); duplicates merged across sources; readings of held items with the items behind each line, the operator's say on each and the way back to Why; where each item stands, in plain words, on the page, on the feedback page and (through the gate) on GitHub; counts per route | [intake](docs/specs/intake.md), [0185](docs/decisions/0185-how-intake-in-a-thin-form-is-built.md), [0240](docs/decisions/0240-how-github-issues-are-read-and-answered.md)–[0243](docs/decisions/0243-duplicates-across-sources-and-counts-per-route.md) |
| `src/existing/` | Existing software in a thin form: where it comes from (a folder or a clone address), premise's own copy of it, what the drafter recovered from its code, `run.md` and `recovered-trace.md`, and pushing the record to a branch of the operator's repository once the gate allows | [line engine](docs/specs/line-engine.md) 5.10, [0189](docs/decisions/0189-how-taking-on-existing-software-is-built.md) |
| `src/measures/` | premise's own return from recorded events: attention while the page is in front of someone, time to answer, idea to running, problem to fix, things reported working that came back as bugs, sessions per change; "not enough yet" when too few | [measures](docs/specs/measures.md), [0193](docs/decisions/0193-how-the-measures-are-built.md) |
| `src/learning/` | Learning from corrections: each correction read into one place (this software, the operator's taste, premise itself, or nothing), short lists of lessons agents follow, and improvements for premise that never change it | [learning](docs/specs/learning.md), [0194](docs/decisions/0194-how-learning-from-corrections-is-built.md) |
| `src/gate/` | The gate: asks before a floor action, approvals (once, or a kind for one software), declines | [gate](docs/specs/gate.md), [0182](docs/decisions/0182-how-the-gate-is-built.md) |
| `src/shared/` | The API's types and the stages, shared by the server and the page | |
| `web/` | The page (React, built with Vite), and its component tests | [page](docs/specs/page.md) |
| `test/` | Vitest tests, and one headless browser test; none calls an LLM or the network. Real agents are tested against a stand-in `claude` that replays recorded events; one real session is opt-in only | |

## The problem

- **The line from an idea to running software is held together by hand.** Before premise, the owner's loop from intent to a deployed change existed, as the assistant described it, "in pieces held together by hand", and broke at the hand-carried joins ([how we work](docs/how-we-work.md#why-premise-is-being-made)).
- **Nothing covers the whole line.** The prior-art research found tools crowded around building, spec checkpoints and code review, and thin or absent where premise cares most: deciding what to build, bringing in several people at their own steps, reporting, cost against value, and keeping rejected alternatives ([report](docs/prior-art/report.md)).
- **The big mistake is building the wrong thing.** Intent mismatch is the top reported failure: agents guess rather than ask.
- **People's attention is the bottleneck,** not build speed. Every question and report costs the scarcest thing.
- **Checks and reports are only as good as their independence.** Agents game checks they can reach, and self-reports have been false.

## Key capabilities

- **The whole line in one product.** Why, Who, What exists, What, Say back, Plan, Build, Check, Run, Report, Intake. No step where a person carries work to an LLM by hand ([the line](docs/architecture/the-line.md)).
- **Drafts first, people correct.** premise drafts each stage as a short list and shows its assumptions; it asks only where being wrong is costly ([0027](docs/decisions/0027-spend-least-of-peoples-attention.md)).
- **Looks at what exists before building,** and may recommend not building at all ([0023](docs/decisions/0023-looking-at-what-exists.md)).
- **Says back what it understood** as at most ten items to strike out ([0028](docs/decisions/0028-say-back-as-assumptions-to-strike.md)).
- **Makes the technical decisions itself,** each recorded with its reason and the alternative rejected; foundation choices get a second agent's review.
- **Builds unattended, checks independently.** The checker never sees the builder's account and keeps its scenarios out of the builder's reach ([build, check and run](docs/architecture/build-check-run.md)).
- **Ends at running software** people can open: a link, a command and its output, or a built program ([0017](docs/decisions/0017-the-line-ends-at-running-software.md)).
- **A lasting record in each software's repository,** one item per line, every commit traced to the items it serves ([the record](docs/architecture/the-record.md)).
- **Every role in one session,** each ask labelled with the role it is for and phrased in that role's terms ([0065](docs/decisions/0065-one-open-session.md)).
- **Intake that goes in normally,** with only what needs holding held and read together ([intake and reporting](docs/architecture/intake-and-reporting.md)).
- **Honest reports** from recorded facts only, every line linked to its evidence ([0097](docs/decisions/0097-reports-from-recorded-facts.md)), including how premise itself is doing: the attention it took, how long things took, and how often something it said worked came back as a bug ([measures](docs/specs/measures.md)).
- **Learns from corrections.** Each strike or turned-down draft becomes one short lesson its agents follow, for that software or as your taste; what premise itself should do better is kept apart and never changes it on its own ([learning](docs/specs/learning.md)).
- **A floor never traded for speed,** enforced by confinement and a gate, not by instructions ([the floor and the gate](docs/architecture/the-floor-and-the-gate.md)).
- **Cost per piece of work** through usage-ledger ([models and cost](docs/architecture/models-and-cost.md)).

## How it works

```mermaid
flowchart LR
    P[Operator and every role<br/>one session] --> PG[Page]
    PG --> SV[Server on the owner's machine<br/>line engine, record keeper,<br/>work queue, gate, runner,<br/>intake, reporter]
    SV --> AG[Agents: Claude Code, headless,<br/>confined, one per job]
    AG -->|tools only| SV
    SV --> REPO[(Each software's repository<br/>code + premise/ record)]
    SV --> RUN[Running software]
    RUN -->|logs, feedback, issues| SV
    SV --> UL[usage-ledger]
```

Simplified view; see the [architecture overview](docs/architecture/overview.md) for every part.

- People use premise through one browser page holding one session where everything is open.
- The server, one process on the owner's machine, moves each software along the line, asks in the session, and runs agents for the work: drafting, research, review, planning, building, checking, triage, readings and reports.
- Agents hold no credentials. They reach premise only through the tools their role gets, cannot write the record or push, and run confined. The server keeps the record, pushes, runs the software and passes every floor action through the gate.
- The checked software runs from a clean copy; what comes back from it and from people is intake, judged against the record.

## Scope summary

| Category | Examples |
| --- | --- |
| In the product | The whole line; every role a software needs; taste claims; the lasting record and traces; honest reports; intake, automatic and held; existing software; cost per piece of work; what the software's users read; several softwares at once; other people setting premise up; any kind of software |
| First milestone | Proof of unattended LLM work on the owner's subscription; then the thinnest line, end to end, for a small command-line utility and a small web app; then usage-ledger, the owner's first software ([0137](docs/decisions/0137-first-software-is-usage-ledger.md)) |
| Not the product's job | Acting in the real world (opening accounts, paying, signing); selling or supporting the software; finding out on its own whether real people want the software |

Details: [scope](docs/product/scope.md); order: [roadmap](docs/product/roadmap.md).

## Documentation map

**Start here**
- [VISION.md](VISION.md): what premise is, who it is for, its principles, the line, the record, and what is not yet worked out. Stays at the root ([0111](docs/decisions/0111-vision-stays-at-the-root.md)).
- [Executive summary](docs/executive-summary.md): premise in two pages.
- [Glossary](docs/glossary.md): the words the documents use.
- [Status](docs/status.md): what is built and what is not.
- [Open questions](docs/open-questions.md): what is still open, and the questions the assistant chose for the owner.
- [Configuration reference](docs/reference/configuration.md): every setting, its default and its meaning.

**Product**
- [Scope](docs/product/scope.md): what is in, what is not the product's job, what is not yet worked out.
- [Roles and use cases](docs/product/roles-and-use-cases.md): premise's roles and what each is asked.
- [Roadmap](docs/product/roadmap.md): the build order agreed with the owner, and the nine milestones.

**Architecture and decisions**
- [Architecture overview](docs/architecture/overview.md): the parts, how they talk, the risks.
- [Where premise runs and how people reach it](docs/architecture/where-it-runs.md)
- [The record](docs/architecture/the-record.md)
- [The line, stage by stage](docs/architecture/the-line.md)
- [Build, independent check and run](docs/architecture/build-check-run.md)
- [Intake, reporting and taste](docs/architecture/intake-and-reporting.md)
- [The floor and the gate](docs/architecture/the-floor-and-the-gate.md)
- [Models and cost](docs/architecture/models-and-cost.md)
- [Decision records](docs/decisions/README.md): every decision, one per file, grouped by theme, each saying who decided.

**Module specifications** ([index](docs/specs/README.md))
- [Page server](docs/specs/page-server.md), [page](docs/specs/page.md), [line engine](docs/specs/line-engine.md), [record keeper](docs/specs/record-keeper.md), [work queue](docs/specs/work-queue.md), [agent runner](docs/specs/agent-runner.md), [agent tools](docs/specs/agent-tools.md), [gate](docs/specs/gate.md), [runner](docs/specs/runner.md), [intake](docs/specs/intake.md), [reporter](docs/specs/reporter.md), [measures](docs/specs/measures.md), [learning](docs/specs/learning.md), [storage](docs/specs/storage.md).

**Prompts and skills**
- [Prompts](docs/prompts/README.md): the full text of every agent role's prompt and the fixed wording premise shows without a model.
- [Skills](docs/skills/README.md): the shared guidance every agent role loads.

**How premise is being made**
- [How we work](docs/how-we-work.md): why and how premise is being made, the working rules, the method, how changes ship, and the prior-art research.

**Raw history, never edited**
- [docs/record/conversation-2026-11-20.md](docs/record/conversation-2026-11-20.md): the whole conversation in order, both sides.
- [docs/record/conversation-2026-11-21.md](docs/record/conversation-2026-11-21.md): the exchange of 2026-11-21 in which the owner doubled back on the planning.
- [docs/record/shaping-notes-2026-11-20.md](docs/record/shaping-notes-2026-11-20.md): the assistant's running notes during the conversation.
- [docs/record/instruction-2026-11-21-build-starts.md](docs/record/instruction-2026-11-21-build-starts.md): the owner's instruction that started the build.
- [docs/record/subscription-sandbox-test-2026-11-21.md](docs/record/subscription-sandbox-test-2026-11-21.md): the first test of the plan, unattended Claude Code on the owner's subscription inside Claude Code's sandbox.
- [docs/record/scope-page-draft-0.1.html](docs/record/scope-page-draft-0.1.html): a review page drafted mid-conversation and later dropped in favour of the vision statement.
- [docs/prior-art/report.md](docs/prior-art/report.md): the prior-art research report.
- [docs/prior-art/ask.md](docs/prior-art/ask.md): what that research was asked to do.

## Licence

All rights reserved ([LICENSE](LICENSE), [0055](docs/decisions/0055-all-rights-reserved.md)).
