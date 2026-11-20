# The plan for premise

- **Status: plan only. Nothing is built until the owner says to start** ([decisions](decisions.md), entry 61).
- Written 2026-11-21 from [VISION.md](../VISION.md) and [decisions.md](decisions.md).
- This is a working record (entry 25): detailed for building, not kept current afterwards. When a choice in it changes, the change is a new entry in [decisions.md](decisions.md) naming the choice it replaces.

## How to read this plan

- Top-down: the parts and how they talk; where premise runs and how people reach it; the record; the line, stage by stage; build, check and run; intake and reporting; models and cost; milestones in order.
- "Entry N" is a decision in [decisions.md](decisions.md), made by the owner or with the owner.
- "P1", "P2", … are choices the owner did not make. The builders made them. Each gives the choice, why, and the alternative rejected.
- Words:
  - the **product** is premise; the **software** is what premise builds;
  - the **operator** is the person who knows what a software is for;
  - an **agent** is one LLM session premise runs;
  - the **builders** are the agents that build premise itself.

## What the plan stays inside

Settled before this plan:
- One browser page: a chat, plus views of the record and of reports (entry 44).
- premise is written in TypeScript (entry 47).
- It runs on the owner's machine first; hosting comes later, with other people setting it up (entry 43).
- A link per person; no accounts until other people set it up (entry 45).
- Any kind of software; no first kind (entries 49, 57).
- Each software in its own repository on the owner's GitHub; visibility per software or whatever GitHub says; premise enforces none (entries 51, 59).
- The check is a different agent from the builder, out of its reach, judging the running result against the intent (entry 30).
- Lasting records are kept current by the product as part of every change; working records are not maintained; a description of what exists is not maintained (entries 25, 26).
- Lists over long paragraphs (entry 29).
- Nobody has to use another tool alongside premise; premise may be built on other tools underneath (entry 63).
- Claude through the owner's subscription first; other providers later (entry 46).
- Cost tracking and the spending limit come from usage-ledger; premise builds none of its own (entry 64).
- The floor: losing data, security holes, spending money, acting publicly in someone's name, false reports (entry 56).
- While premise is being built: work stops for the owner only on destructive, security-sensitive, public-facing or money-spending actions (entry 53); one short report per finished milestone (entry 54); changes ship as pull requests the assistant merges (entry 52).
- Nothing is built until the owner says to start (entry 61).

## 1. The parts and how they talk

### Parts
1. **The server.** One Node.js process on the owner's machine. Its modules:
   - **Page server:** serves the page and its API.
   - **Line engine:** knows where each software is on the line, picks the next step, asks people.
   - **Record keeper:** the only writer of each software's lasting record; checks its format and its trace links.
   - **Work queue:** jobs (draft, research, plan, build, check, run, report, triage, reading), stored so that a restart resumes them.
   - **Agent runner:** starts, watches and stops agent sessions; gives each its own working copy, confinement and limits.
   - **Gate:** every action on the floor passes here; it asks the named person or lets the action through.
   - **Runner:** starts the built software from a clean copy and keeps it up while premise runs.
   - **Intake:** takes items in from every source and routes them.
   - **Reporter:** writes reports from recorded facts.
2. **Agents.** Claude Code sessions run headless, one child process each. Each has a role (drafter, researcher, planner, builder, checker, triager, reporter), instructions that ship with premise, and only the tools its role needs.
3. **The page.** One browser page: chat, record view, report view, and "needed from you".
4. **Storage.** premise's own database and data folder on the owner's machine; each software's repository on GitHub.
5. **Tools underneath** (entry 63): Claude Code, git, the GitHub CLI and usage-ledger, driven by the server. People never have to use them alongside premise.

### How they talk
- Page to server: an HTTP request for every action; one server-sent event stream per open page for live updates.
- Inside the server: plain function calls. Anything that must survive a crash goes through the work queue's table.
- Server to agents: each agent is a child process whose streamed JSON events the server reads.
- Agents to premise: only through tools the server serves to that one session: read the record, propose a record change, ask a person, request a gated action, report progress. Agents cannot write the record, push, or reach another session's tools.
- Server to GitHub: only the server creates repositories, pushes and reads issues.
- Server to usage-ledger: the server records which task each agent session did, where usage-ledger reads it, and asks usage-ledger for usage and budget figures (section 7).

### Choices
- **P1. One Node.js process holds every module; agents are its child processes.**
  - Why: one command starts premise on the owner's machine; nothing to wire together or keep in step.
  - Rejected: separate services for the page, the line and the agents.
- **P2. The server uses Fastify on the current Node.js LTS.**
  - Why: typed request validation is built in; Node.js is what Claude Code itself runs on.
  - Rejected: Express (no built-in validation); Bun or Deno (less common under the tools premise drives).
- **P3. The page is React, built with Vite, served by the server as static files.**
  - Why: the builders are LLM agents, and they are most reliable on the most common stack.
  - Rejected: hand-written DOM code (more code to get right); less common frameworks.
- **P4. Page and server talk by HTTP requests plus server-sent events.**
  - Why: actions are plain requests; only updates flow the other way, which is exactly what server-sent events do.
  - Rejected: WebSockets (two-way machinery the page does not need); polling (slow to show progress).
- **P5. Agents are Claude Code run headless (`claude -p` with streamed JSON output), as child processes.**
  - Why: it is Claude Code's documented way to be scripted, and it runs on the owner's own subscription login. One process per agent makes limits, confinement and stopping simple.
  - Rejected: the Claude Agent SDK package (its documentation says products built on it should not offer claude.ai login unless approved, and should use API keys, which spend money; revisit with P37). Calling the Messages API directly (needs an API key, and premise would rebuild tools Claude Code already has).
- **P6. premise keeps its own state in SQLite, in a data folder in the user's home directory (configurable).**
  - Why: one file, no database server to run, and transactions keep the work queue safe across crashes.
  - Rejected: JSON files (no transactions); a database server (setup that a local-first product should not need).
- **P7. The server serves each agent's tools over MCP, with a token per session.**
  - Why: Claude Code connects to MCP servers natively; the token binds every call to one session and one role, so a builder cannot call the checker's tools.
  - Rejected: agents calling premise through shell commands (no per-role limits).
- **P8. At most two agent sessions run at once by default.**
  - Why: every session draws on the same subscription limits; more sessions at once mostly reach the limit sooner.
  - Rejected: unbounded parallel agents.
- **P9. premise's code lives in this repository as one package: server, page, agent instructions, and the scripted demo runs.**
  - Why: one thing to install and version; agent instructions change together with the code that uses them.
  - Rejected: several packages in one repository (machinery before it is needed).

## 2. Where it runs and how people reach it

- premise runs on the owner's machine (entry 43). One command starts it and prints the owner's link.
- Installed once and checked at every start; premise names whatever is missing:
  - Node.js LTS and git;
  - Claude Code, logged in once with the owner's subscription in premise's own configuration folder (P10);
  - the GitHub CLI, logged in as the owner (P11);
  - on Linux and WSL2, bubblewrap and socat, which Claude Code's sandbox needs (P21). Installing them needs the owner's administrator password, so premise names them and the owner installs them;
  - usage-ledger, once it is usable (entry 64; milestone 2).
- **P10. premise runs Claude Code with its own configuration folder, logged in once by the owner.**
  - Why: the owner's personal hooks, skills, memory and settings would otherwise load into every agent and change what it does. premise's sessions also stay apart from the owner's own.
  - Rejected: the owner's default configuration; Claude Code's bare mode (it does not use subscription login).
- **P11. premise reaches GitHub through the machine's existing GitHub CLI login, used only by the server.**
  - Why: no new secret to create or store, and agents never hold it.
  - Rejected: a personal access token stored by premise.

### Links (entry 45)
- **P12. Each person's link carries a long random token. Every request needs one, the owner's included. The server also checks the Host and Origin headers.**
  - Why: with no accounts, the token is the only lock; without it, any web page open in the same browser could drive premise on localhost.
  - Rejected: no token for requests from the owner's own machine.
- The operator makes a link on the page, naming the person and their role. A link can be withdrawn at any time.

### Reach
- **P13. premise listens on localhost only.**
  - Why: anything reachable from outside the machine is security-sensitive (entries 53, 56).
  - Rejected: listening on every network interface by default.
- Other people need premise reachable from their machines. premise prepares that (a local-network address or a tunnel) and the operator decides it, because it is security-sensitive. Until then, other people can only use premise at the owner's machine.
- Built software runs on the same machine (section 5).
- Hosting premise itself comes with milestone 5. Accounts are decided then (entry 45).

## 3. The record

### Where it lives
- **P14. Each software's lasting record lives in its own repository, in a `premise/` folder at the root.**
  - Why: it is versioned with the code; a change and its record land in one commit, so the record cannot fall behind (entry 25). It outlives premise; the prior art found records lost when the tool holding them shut down.
  - Rejected: keeping the record in premise's database.
- **P15. Nothing about real people goes into a software's repository.** Names, links, contacts and conversations stay in premise's data folder. The record names roles, not people.
  - Why: visibility is not premise's to enforce (entry 59), so the repository must be safe to make public.
  - Rejected: conversation transcripts in the repository.
- Working records (transcripts, plans, job logs, check evidence) stay in premise's data folder. They are kept, not maintained (entry 25). Deleting them is losing data, so only a person does it.

### Format
- **P16. The record is Markdown: one item per list line, each with a stable ID.**
  - Why: people read it on GitHub and on the page; LLMs read and write it well; it is lists (entry 29).
  - Rejected: JSON or YAML (harder for people to read and correct).
- Files in `premise/`:
  - `why.md`: the problem, and why to build (`Y-1`, `Y-2`, …);
  - `who.md`: who the software is for (`U-n`) and the roles it needs (`R-n`);
  - `exists.md`: what already exists, with sources, and the outcome: do not build, build on something, or build something different (`E-n`);
  - `what.md`: what it must do, each with priority must, should or could (`W-n`);
  - `taste.md`: what people said about areas they claimed (`T-n`);
  - `decisions.md`: decisions, with reasons and rejected alternatives (`D-n`);
  - `run.md`: how to build, start and open the software. The checker runs it from a clean copy every time, so it cannot go stale without the check failing.
- One item per line, for example: `- [W-7] People can export their list as a CSV file. (must; from: operator; 2026-11-21)`.
  - `from:` is a role, or `assumed` for an assumption of premise's that nobody struck.
  - A changed item gets a new ID and `replaces: W-3`.
  - A dropped item is struck through with its reason, not deleted, so rejected alternatives stay (entry 25).
- The record keeper parses every file on every change. A malformed line, a duplicate ID, or a reference to a missing ID fails the change.

### How built pieces trace to it
- **P17. Every commit premise makes carries a trailer naming what it serves: `Premise-Trace: W-7, D-3`, plus `I-12` when the work came from intake.**
  - Why: from any line of code, `git blame` leads to a commit and its items; from any item, to every commit that names it. That tells a wrong record apart from a drifted build (entry 13).
  - Rejected: IDs in code comments (noise that goes stale).
- Every builder task names the items it serves.
- The server refuses to push a commit without the trailer, or with one naming an ID that does not exist.

### Keeping it true
- Silent contradiction (entry 14): an agent compares every proposed record change with the whole record.
  - A conflicting change must name the item it replaces; two live items never disagree.
  - Replacing an item about purpose (`Y`, `U`, a must `W`) or a foundation decision goes to the say-back.
- **P18. Who has the last word, taken from the scope page draft:**
  - anything that follows from the record and is cheap to undo: premise decides and records why; nobody is asked unless they claimed the area;
  - purpose, users, priorities: premise drafts and suggests; the operator decides;
  - an area someone claimed for their taste: premise proposes; that person decides;
  - what an LLM cannot reliably know or do (an intent nobody stated, real-world acts, accountability): premise gives its best attempt with its reasons; a named person decides or acts;
  - the floor: the gate asks (section 6).
  - Why: it spends people's attention only where being wrong is costly (entry 27).
  - Rejected: asking people about every record change.

## 4. The line, stage by stage

Rules for every stage:
- premise drafts first and people correct (entry 27). A question is asked only when being wrong is costly.
- Each question goes to the person named for that step, in their terms.
- Every output is a short list. Each item can be struck, kept or edited on the page, one at a time.
- A software moves on when the stage's exit condition holds. The operator can send it back to any stage.
- **P19. Each stage has an effort budget sized to the software; a small software gets short stages.**
  - Why: depth follows return on effort (entry 6), and a long conversation up front is the scope page's first risk.
  - Rejected: the same full depth for every software.

1. **Why.**
   - premise asks the operator once what the software is for, in the operator's own words.
   - It drafts the problem as three to seven items. The operator strikes or edits.
   - Exit: the operator has seen the list and nothing struck is left open. Writes `why.md`.
2. **Who.**
   - premise drafts plausible kinds of user, and the roles the software needs: people with taste in a part, people who decide or do what an LLM cannot.
   - The operator corrects, and names a person for each role or keeps it.
   - Writes `who.md`. The named people stay in premise's database (P15).
3. **What exists.**
   - The researcher agent searches the web and reads sources, within its budget (P19).
   - It lists what exists, with sources, and recommends one outcome: do not build, build on something, or build something different. It reads the motive from Why: saving effort, or finding a gap (entry 23).
   - The operator decides the outcome. "Do not build" ends the line with a report.
   - It repeats at a smaller size before a large feature or a foundation choice. Writes `exists.md`.
4. **What.**
   - premise drafts what the software must do, in purpose terms, with priorities. It offers its own ideas, marked as suggestions, and asks only where being wrong is costly.
   - People claim areas for their taste here (section 6). Writes `what.md` and `taste.md`.
5. **Say back.**
   - A list of at most ten items: what premise understood and assumed, in purpose terms, with assumptions marked.
   - The operator strikes what is wrong; each struck item goes back to its stage.
   - When (entry 20): at the start of a new software; on taking on an existing one; later, for a change that replaces a `Y` or `U` item, a must item or a foundation decision, or that is costly to undo.
   - It is only the cheap first check. Running software shown early is the real one, so the plan's first task is always the smallest version that runs.
6. **Plan.**
   - The planner agent makes the technical decisions, each a `D` item with its reason and the alternative rejected.
   - Foundation decisions (language, framework, storage, how it runs, data model, who can get in) get a small "what exists" look and a review by a second agent before building (entry 14: a wrong early foundation).
   - The security defaults apply (P26).
   - It writes a working plan: ordered tasks, each naming its items and small enough to check. The first task is the smallest version that runs.
7. **Build.** Unattended. Section 5.
8. **Check.** Section 5.
9. **Run.** Section 5.
10. **Report.** Section 6.
11. **Intake.** Section 6.

### Existing software (milestone 6)
- An agent drafts the record from the code, its documentation, its history and its issues. Every item is marked `recovered`.
- Parts that conflict, or cannot be inferred, become questions to named people (entry 19).
- The say-back covers the whole recovered record. Recovered items stay unconfirmed until it passes; the prior art found that recovered intent misses 44–65% of user goals.
- "What exists" also asks whether something has appeared that makes part of the software unnecessary (entry 23).
- From then on every commit traces to items. Old code gets best-guess links, marked as guesses.

## 5. Build, independent check and run

### Build
- **P20. The builder works in its own working copy of the software's repository, on a branch per change.**
  - Why: a change can be checked, and thrown away, without touching what runs.
  - Rejected: building on the default branch directly.
- **P21. Every agent runs confined: Claude Code's sandbox for shell commands, plus permission rules for its file tools.**
  - Writes only in its working copy and a temporary folder.
  - Reads denied for premise's data folder, the checker's scenarios, and credential files (SSH keys, the GitHub login, Claude Code's login).
  - Network only to the package registries the plan names.
  - Why: an unattended agent with the owner's files and logins within reach is how the prior art's worst incidents happened. Claude Code's sandbox covers shell commands only, so file tools are limited by permission rules as well.
  - Rejected: no confinement. A container per agent (stronger, but it makes Docker a prerequisite); it is the fallback if milestone 1 shows the sandbox leaks.
- The builder holds no credentials. It commits; the server pushes (P11).
- For each task the builder:
  - makes the change;
  - writes or updates its own tests and runs them;
  - updates what users read where the task touches it (help text, guides);
  - commits with the trace trailer (P17).
- The builder never writes the record. It proposes changes, such as a new `D` item, through its tool; the record keeper checks them.
- If a task needs a decision only a person can make, the builder asks through its tool. That task waits; other tasks go on.
- **P22. Each session has a turn limit and a time limit. The same failure three times stops the task, and the task is reported.**
  - Why: a stuck agent otherwise loops through the subscription's limits.
  - Rejected: letting a session run until it says it is done.

### Check (entry 30)
- **P23. The checker is a fresh session with its own working copy of the commit under check. It never sees the builder's transcript, summary or claims.**
  - Why: it judges the running result against the intent, not the builder's account (entry 30).
  - Rejected: a review of the builder's diff and report.
- **P24. The checker writes its scenarios from the record into premise's data folder, where builders cannot read them.**
  - Why: agents game the checks they can touch (entry 30).
  - Rejected: scenarios kept in the software's repository.
- It builds and starts the software from `run.md` in its own copy, and uses it as a user would:
  - a browser driven by Playwright for web pages;
  - HTTP calls for servers;
  - commands for command-line tools;
  - the built program for desktop apps, where it can run on the machine.
- Its verdict per item: met, not met, or could not check, each with evidence (a screenshot, output, a log).
- It also checks that `run.md` works from a clean copy, that the security defaults hold (P26), and that what users read matches what the software does.
- Outcomes:
  - every must item met and no floor finding: the change passes;
  - a must item not met, or a floor finding: back to the builder as a new task, with the evidence;
  - should or could items not met, and small defects: accepted and reported when fixing costs more than it is worth (entry 6); the operator can reopen them;
  - the same item failing three rounds: work on it stops, and the report names who is needed and for what.
- **P25. The checker uses the same provider, in a fresh session, with different instructions, at the strongest model tier.**
  - Why: Claude through the owner's subscription is the only provider for now (entry 46).
  - Rejected: a second provider (another subscription or an API key, which spends money).
  - A checker that shares the builder's model is a known limit of every checker the prior art found. Reports say so.
- **P26. Security defaults for every software, applied in the plan and checked by the checker:**
  - no secrets in the repository; secrets in a local file that git ignores;
  - anything that listens on a network binds to localhost unless the operator decided otherwise (a gated act);
  - anything other people can reach has a lock on it, decided in the plan;
  - dependencies from the main registries, pinned by a lock file, checked for known advisories;
  - input from people validated; database queries parameterized;
  - stored data backed up before any change that migrates it.
  - Why: when the operator cannot judge security, the defaults are the security (the prior art's insecure-defaults failure).
  - Rejected: leaving security to each software's plan.

### Run
- **P27. After a pass, the server merges the branch into the default branch and pushes. No GitHub pull requests.**
  - Why: the line ends at running software (entry 17), and people follow the work on premise's page; nobody has to use GitHub alongside premise (entry 63).
  - Rejected: a GitHub pull request per change (a second place to look and approve).
- The runner starts the checked commit from a clean copy using `run.md`, confined like an agent (P21):
  - web apps and servers: on a local port, opened from a link on the page;
  - command-line tools and libraries: the page shows the command and a sample run's output;
  - desktop apps: the page shows the built program and how to start it on the owner's machine.
- It restarts a crashed software a few times, then reports. It keeps the software's logs; errors in them become intake.
- Release notes for each change that reaches running are drafted from the record items it served.
- When a software needs what an LLM cannot provide (an account with an outside service, a licensed system to run against, a payment), premise names the person and exactly what is needed, and runs what it can meanwhile.
- Keeping software live for its real users is milestone 7.

## 6. Intake and reporting

### Intake sources
- People, through their links: something said in chat that is not an answer to a current question becomes an intake item, and premise says so in one line ("Taken as I-14").
- The software's users: a feedback page per software. premise gives its link to the operator; giving it to users is the operator's act.
- The software's GitHub issues, read by the server on a timer.
- premise itself: check failures, errors in a running software's logs, dependency advisories, budget warnings from usage-ledger.

### Triage and routes
- **P28. A triager agent reads every item against the record:** its kind (bug, wish, change of purpose, question, opinion, duplicate, noise), the items it touches, its rough size, and whether it touches the floor.
  - Why: routing by what an item touches needs the record, which an LLM can read; no person is needed for it.
  - Rejected: people sorting intake by hand.
- Routes (entry 62: intake goes in normally; only what needs holding is held):
  - **In normally, the default:** bugs and wishes that fit the record become changes on the line: plan, build, check, run. A say-back only if the change touches purpose or is costly to undo.
  - **Asked at once:** an item that touches purpose, an area someone claimed, or the floor goes to the named person.
  - **Held:** only the items that need holding (P29).
  - **Merged or closed:** duplicates join their item; noise is closed with its reason. Both are counted in reports.
- **P29. Held means only items that mean little one at a time and something together:**
  - opinions on whether the software is wanted or useful;
  - wishes that pull against the record's purpose or users;
  - one user's request that conflicts with what other users asked;
  - ideas whose worth is unclear without more like them.
  - Why: these are where patterns show what people want (entry 41); acting on each alone would pull the software back and forth.
  - Rejected: holding by default (entry 62); acting on every item at once.
- **P30. Held items are read together when a software has ten held, when two weeks have passed with at least one held, or when the operator asks.**
  - Why: enough items to see a pattern, without leaving senders unanswered for long.
  - Rejected: readings only when someone asks (they would not happen while nobody is watching).
- A reading ends in a short list for the operator: what people seem to want, what keeps coming up, and whether the software's purpose or users should change.
  - The operator decides any change of purpose.
  - When people do not want the software, premise goes back to Why with the operator (entry 36).
- Senders are told where their item stands (taken, held, done, closed) on the page, for people with links. A comment on a GitHub issue is public and in the owner's name, so it goes through the gate (P35).

### Reporting
- **P31. Reports are built from recorded facts only: check verdicts, job outcomes, gate decisions, usage-ledger figures. Every line links to its evidence. No agent's account of its own work is a source.**
  - Why: a false report is on the floor (entry 56), and self-reports were the source of the prior art's false reports.
  - Rejected: reports written from agents' summaries.
- The report view, always current, for each software (entry 12):
  - **Decided:** record items and decisions since the last report.
  - **Running:** what runs, which commit, and where to open it.
  - **Needed:** what is needed and from whom, each with exactly what to do.
  - **Failed or not checked:** every item not met or not checked.
  - **Cost:** from usage-ledger, once it is usable (section 7).
- **P32. A short report each time a change reaches running; an immediate notice only when someone is needed.**
  - Why: it is the rhythm the owner chose for premise's own building (entry 54).
  - Rejected: a report per task (noise); reports only when asked.
- **P33. Notices: each person's "needed from you" list on their page, a count in the browser tab, and browser notifications while the page is open.**
  - Why: it needs no outside account and sends nothing in anyone's name.
  - Rejected for now: email or chat messages (an outside account, and messages sent outside premise).
- More detail when asked, in chat ("more on W-7"), answered from the record, the evidence and the working records.

### The floor, and how premise slows down for it (entries 15, 56)
- **P34. Floor actions:**
  - losing data: deleting or overwriting anything outside a working copy, force-pushing, deleting repositories or branches with unmerged work, dropping a running software's stored data;
  - security holes: handling credentials, exposing anything beyond localhost, changing who can get in;
  - spending money: paid services, API keys, cloud resources, paid extra usage on a subscription;
  - acting publicly in someone's name: making a repository public, publishing a package or release, posting comments or messages;
  - false reports: prevented by P31 rather than asked about.
  - Why: these are the owner's floor (entry 56), made concrete enough for the gate to recognise.
  - Rejected: leaving it to each agent to judge what is risky.
- Agents cannot take a floor action. They hold no credentials and run confined (P21), and can only request one through their tool. Instructions are not access control; the prior art's destructive incidents all had credentials within reach.
- **P35. The gate asks the named person, saying exactly what will happen and why. Only the work that depends on the answer waits.**
  - A person can approve one action, or a named kind of action for one software, such as status comments on its issues. Approvals are recorded and can be withdrawn.
  - Deleting data and spending money are always asked one at a time.
  - Why: the floor is slow on purpose; everything else proceeds and is reported. Entry 53 holds the same rule for building premise.
  - Rejected: asking for every action; approvals that cover every software.

### Taste (entry 22)
- A person claims an area on the page, in their own words ("the look of the main screen", "the API's naming").
- **P36. Before a claimed area is built, its person sees a proposal: a screenshot of a quick prototype, or a short list. They decide; other tasks go on.**
  - Why: something to look at is the cheapest way to catch a mismatch (entry 13). Review points exist only where someone claimed an area (entry 22).
  - Rejected: a written description to approve; review of every area by default (entry 22).
- What they say becomes `T` items. Those that can be checked go into the checker's scenarios.
- Small wishes come in as intake.

## 7. Models and cost

### Models
- All LLM work goes through the agent runner, which runs Claude Code on the owner's subscription (entry 46; P5, P10).
- **P37. The owner's subscription is used only through Anthropic's own Claude Code, logged in as the owner, on the owner's machine, for the owner's own use. premise never offers that login to anyone else.**
  - Why: the owner approved subscription use (entry 46). Anthropic's Agent SDK documentation says products may not offer claude.ai login unless approved.
  - Rejected: sharing the owner's login with other people's setups of premise.
  - So other people who set premise up bring their own model access, such as an API key. On the owner's account that spends money, so it waits for the owner (entry 53).
- **P38. Model tier by role: the strongest tier for conversation, plan, build, check and readings; a fast tier for triage and for drafting reports.**
  - Why: a mistake in intent or in the build costs more rounds than the usage saved; triage and report drafting are easy work.
  - Rejected: one model for everything; a cheaper tier for building (more failed checks).
- **P39. Models are named by Claude Code's tier aliases, not pinned versions.**
  - Why: a better model makes premise better without a change (entry 31).
  - Rejected: pinned model versions.
- **P40. What is set per software, and what stays with premise:**
  - per software: its record; its `run.md` and build setup, written by the builder in its repository and regenerated when needed; its people and claimed areas; its approvals;
  - with premise: the line, the agent instructions, the record format, the roles and their models, the floor and the gate.
  - Why: the line and the record are general; a software's build setup is specific to it (entry 31).
  - Rejected: per-software instructions, or changes to the line per software.
- Agent instructions ship as files in premise's repository. They are about the line and the records, not workarounds for one model (entry 31).
- **P41. The agent runner is the only part that knows which agent runtime and provider are used.** Other parts ask for "an agent with these tools, in this working copy".
  - Why: other providers come later (entry 46); adding one then changes only the runner.
  - Rejected: Claude Code details spread through premise.
- When the subscription's usage limit is reached, Claude Code reports rate-limit retries. The agent runner pauses the queue until the limit resets, and the report says so. premise never turns on paid extra usage.

### Cost and the spending limit (entries 16, 48, 64)
- premise builds no cost tracking and no spending limit of its own. It uses usage-ledger, which is built as its own project, outside premise.
- By its own vision, usage-ledger reads what agents and accounts already record: the per-session cost and token totals Claude Code writes, the subscription's limits, and which task each session was doing. It never sits between an agent and its model.
- premise's part:
  - it records, for every agent session, the task it did (software, stage, job, record items, role), where usage-ledger reads it and in the format usage-ledger defines;
  - it tells usage-ledger where its Claude Code sessions are recorded (premise's own configuration folder, P10);
  - it reads usage per software, stage, change and record item from usage-ledger and shows it in reports;
  - it sets per-software budgets in usage-ledger; when usage-ledger reports one overrun, premise pauses that software's queue and tells the operator.
- Because sessions carry their record items, rework shows up: an item that keeps failing its check shows its whole cost.
- Until usage-ledger is usable, reports say that cost is not tracked yet. P22's turn and time limits still stop runaway sessions; they are not cost tracking.

## 8. Milestones

For every milestone:
- Nothing starts until the owner says to start (entry 61).
- Changes to premise ship as pull requests the assistant merges (entry 52). Work stops for the owner only on destructive, security-sensitive, public-facing or money-spending actions (entry 53).
- "Shown running" means a recorded run with its evidence kept: transcripts, the record files, commits with their traces, the check's verdicts, screenshots or command output.
- "Reported" means one short report to the owner when the milestone finishes (entry 54): what was built; how it was shown running, with the evidence; what failed and what could not be checked; the P-choices made or changed; from milestone 2 on, the cost. Anything that needs the owner is sent at once.
- **P42. Demos use a scripted operator: answers written down before the run and fed in by a test script.**
  - Why: the line runs end to end unattended, the same way each time, without spending the owner's attention (entry 27).
  - Rejected: an LLM playing the operator (it tends to agree with premise's drafts, which would hide mismatches).
- **P43. premise's own tests: unit tests with Vitest, and each milestone's demo kept in this repository as a scripted end-to-end run that can be run again.**
  - Why: the demos are the proof that the line works; keeping them lets every later change be checked against them.
  - Rejected: unit tests only.

### Milestone 1: the thinnest line, end to end, for any small software
Thinnest means: one software at a time; only the operator; no taste claims; intake only from the operator's chat; no cost figures.

**Step 1: prove that premise can drive LLM work unattended through the owner's Claude subscription, on the owner's machine.**
- Built: a small TypeScript program, the start of the agent runner. On the owner's machine it must show each of these:
  1. It starts Claude Code headless as a child process, logged in with the owner's subscription in premise's own configuration folder, with no API key anywhere in its environment.
  2. The session finishes a multi-step coding task (write a tiny program, test it, commit it) with nobody answering anything. Whatever would need permission is denied and reported, not waited on.
  3. Confinement holds: the agent cannot write outside its working copy, cannot read a file planted in premise's data folder or the GitHub login, and cannot reach a host that is not allowed.
  4. Two sessions run at once, as a builder and a checker, and neither can read the other's files.
  5. Each session's id is recorded against the task it did, so usage can be attributed later.
  6. The subscription's usage limit is handled: rate-limit events pause the work, and it resumes after the reset. If the limit cannot be reached safely, the pause is shown with a simulated event.
  7. The server, not an agent, creates a private repository on the owner's GitHub and pushes to it.
  8. The use stays within P37: Anthropic's own Claude Code, the owner's login, the owner's machine, the owner's own use.
- **If point 1, 2, 7 or 8 cannot be proven, work stops for the owner there.** The report says what failed and what the options are, for example an API key, which spends money. Nothing else in milestone 1 starts.
- If point 3 or 4 fails, agents run in a container per session instead (P21). That makes Docker a prerequisite, which the report names. If Docker is not available, work stops for the owner, because running agents unconfined is security-sensitive.
- Shown running: the program's log, the task's commits, the confinement tests' output, the session records.
- Reported: each of the eight points, passed or failed, with its evidence.

**Step 2 onward: the line.**
- Built:
  - the server; the page (chat, record view, report view, "needed from you"); the owner's link; the database; the work queue that survives a restart; the gate;
  - stages Why to Plan in their thinnest form: one draft per stage, corrections in chat, a strike-out say-back, a short look at what exists;
  - the record keeper writing `premise/` files with IDs into a new repository per software; trace trailers enforced;
  - one builder and one checker, confined; the checker's scenarios out of the builder's reach; verdicts with evidence;
  - the server's merge and push; the runner, with a link or a command on the page;
  - a report each time a change reaches running; things the operator says become intake that goes in normally.
- Shown running:
  - **P44. Two small softwares of different kinds, each taken from a one-paragraph idea to running software with a scripted operator: a command-line utility and a small web app.**
    - Why: two kinds keep the line from fitting one kind (entry 49).
    - Rejected: one sample; waiting for the owner's pick (entry 60).
  - In each run, one assumption is struck in the say-back and the record changes to match.
  - In each run, the checker catches a defect planted in the build that it was not told about.
  - After this, the owner can run their own first pick whenever they want (entry 60).
- Reported: the milestone report, and for each sample what failed and what could not be checked.

### Milestone 2: cost and the spending limit, through usage-ledger
- **Prerequisite: usage-ledger is usable.** Building it is its own project, not premise work (entry 64). If it is not usable when milestone 1 ends, milestone 3 goes first and this one starts when it is.
- Built: premise's part of section 7: session-to-task records in usage-ledger's format; usage per software, stage, change and record item in reports; per-software budgets set in usage-ledger; pausing a software's queue and telling the operator when its budget is overrun.
- Shown running: milestone 1's demos run again, with usage per stage and per item in their reports; a deliberately small budget overrun that pauses the software and tells the operator.
- Reported: as for every milestone, plus what milestone 1's demos cost.

### Milestone 3: everyone at their step
- Built: links for other people, with their roles; questions routed to the named person in their terms; taste claims and proposals before building; the gate asking the right person; approvals for a kind of action; each person's "needed from you" list.
- Shown running: a scripted run with three people, each answering only their own questions through their own link:
  - an operator;
  - someone who claimed the look of the main screen;
  - someone who must do a real-world act, such as creating an account with an outside service.
- Reported: as for every milestone, plus how many questions each person was asked.

### Milestone 4: intake, automatic and held
- Built: intake from every source; triage; the in-normally, asked, held, and merged-or-closed routes; readings; the way back to Why; telling senders where their item stands.
- Shown running: planted items against a running demo software:
  - bugs fixed through the line;
  - a wish that changes purpose, asked of the operator;
  - opinions held and read together into a short list;
  - duplicates merged and noise closed.
- Reported: as for every milestone, plus counts per route.
- After this milestone the line works (entry 34).

### Milestone 5: other people set premise up
Sooner than the other later items (entry 33, item 7; entry 43).
- Built:
  - one install command, and a setup check that names what is missing;
  - each person's own model access (P37); other providers if needed (P41);
  - setup instructions, written as part of what users read;
  - premise hosted in a container on a host its operator chooses, reachable through links;
  - accounts, decided at this milestone (entry 45).
- Every step that exposes premise beyond one machine waits for the person running it; for the owner's own setup, the owner (entry 53).
- Shown running: a clean machine (a fresh virtual machine) set up from the instructions alone, then milestone 1's demos run on it. Using an API key for this spends money, so it waits for the owner.
- Reported: as for every milestone, plus every point where setup needed a person.

### Milestone 6: existing software
- Built: section 4's "existing software".
- Shown running: one demo software taken on with its `premise/` folder removed, so the recovered record can be compared with the original; then one public open-source project.
- Reported: as for every milestone, plus how much of the original record was recovered, and what people were asked.

### Milestone 7: kept live, and several softwares at once
- Built: running software for its real users on hosts the operator approves; keeping it up; incidents back as intake; several softwares at once, sharing the work queue fairly, with a report per software and one summary.
- Every first deployment to a public host is public-facing and may spend money, so it is asked (P34).
- Shown running: two softwares live on approved hosts, one taking an incident back through the line.
- Reported: as for every milestone.

## 9. Where this can go wrong, and what in the plan meets it

- The conversation turns into paperwork: drafts instead of interviews; stage budgets (P19); a say-back of at most ten items.
- A say-back that confirms the wrong thing: the smallest running version first; the checker judging against the record (P23, P24).
- Existing software swallows the effort: it comes after the line works (milestone 6).
- The whole line is a lot: the thinnest line first, one milestone at a time.
- Agents gaming their checks: scenarios out of the builder's reach (P24); a checker that never sees the builder's claims (P23).
- Destructive actions: no credentials for agents, confinement (P21), the gate (P35).
- Noise drowning people: triage (P28); only what needs a person reaches one; notices only when someone is needed (P32, P33).
- Model changes breaking premise: instructions about the line, not one model; tier aliases (P39); one part that knows the runtime (P41).
- Records going stale: the record changes in the same commit as the code (P14, P17); the record keeper refuses malformed changes.
- Insecure defaults for operators who cannot judge them: P26, checked on every change.
