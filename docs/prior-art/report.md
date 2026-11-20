# Prior art for an LLM-driven software factory

Research report. Research only: no design, no recommendation of what the factory should be. Written 2026-11-20.

Vocabulary follows the brief: the **product** is the factory being shaped; the **software** is what the product builds; the **line** is the chain from intake to running software and back (intake, deciding what to build, eliciting and recording intent, specification, technical planning, build, verification, landing, running/deploying, reporting, feedback and automatic intake, existing software, cost tracking).

Labels: **BUILT** = a product, open-source project or internal system that has been written up. **IDEA** = paper, essay, proposal, talk or benchmark. **OPINION** = practitioner write-up, critique, post-mortem or sceptical take.

Every source in this report was read on **2026-11-20**. That is the read date for every URL below; it is not repeated on every line. "Primary" means the page itself was fetched. "Secondhand" means only a search snippet or another outlet's account was seen.

---

## Summary (one page; act on this alone if needed)

1. **The idea is old, and so is its main failure.**
   - "Software factory" dates from 1968. Hitachi made one work for families of similar projects through a decade of discipline.
   - SDC's US factory (1975-78) failed when requirements were split from building. Managers would not hand over specifications, and one unfamiliar domain took a year longer to specify while programmers sat idle.
   - The closest ancestor of the described product is the Air Force **KBSA** programme (1983). It proposed an executable specification shown to the user, a full decision record, maintenance on the spec rather than the code, and an assistant that asks the specifier questions. It stalled on "toy-like" scope and on formal languages people could not use.
   - LLMs remove the language barrier, not the intent problem. Brooks: "The hardest single part... is deciding precisely what to build."
2. **Several "software factories" launched in 2026, and none covers the whole described line.**
   - Launches: StrongDM (no human writes or reviews code), Factory 2.0, Mastra, Warp, 8090. Gartner covered the category in September.
   - Closest: **8090** (requirements → blueprints → work orders → feedback; the build is delegated), **Factory 2.0** (signals → build → ship → monitor; maker claims only), **Spec Kit and BMAD** (idea → go/kill → spec → build, for one person, with no deploy), and **app builders** such as Lovable and Replit (prompt → hosted app, with little questioning).
3. **The field by part of the line.**
   - **Crowded:** build, plan/spec checkpoints, AI review, the pull request as the human checkpoint, migrations that have a test oracle, incident agents.
   - **Thin:** deciding what to build (problem, users, kill decisions), several people entering at their own steps, reporting at a level of detail the operator chooses, cost against value, recovering intent from existing code.
   - **Not found anywhere:** a product that owns the conversation across many people and routes questions to each in their own terms. A large 2026 study found no tooling that records rejected design alternatives.
4. **Independent evidence is thin and mostly cautionary; most of what exists is maker claims.**
   - Experienced developers were 19% slower with AI while believing they were 20% faster (METR 2025).
   - About half of test-passing agent PRs would not be merged.
   - Review time rose 91% (Faros). Agents spend about 80% of their time "idly waiting for human input" (Anthropic).
   - Specs did not reduce defects across 88k PRs, and 81.5% of spec files are never updated.
   - Agents guess rather than ask, though asking helps by up to 74%. Elicitation agents miss more than half of implicit requirements and do worst on taste.
5. **Main disagreements.**
   - No human review (StrongDM, Shapiro, Yegge) versus accountable review (Willison, Stanford CodeX, GitHub's rules).
   - Specs first versus "waterfall again" (Spec Kit measured at about 10x slower).
   - Deterministic tools first versus the LLM first on existing code.
   - A reusable factory product versus a harness bonded to one application (Yegge, after his orchestrator collapsed on a model upgrade).
6. **Recurring failures.**
   - Intent mismatch from unasked assumptions.
   - Agents gaming checks they can reach.
   - Destructive actions with whatever credentials were at hand (Replit, DataTalks.Club, PocketOS; AWS/Kiro, which is disputed).
   - Human attention as the bottleneck.
   - Breakage on model upgrades.
   - Vendor churn: four Google and GitHub products shut down within about 18 months.
   - Insecure defaults when the operator cannot judge the output.
7. **On "ROI over perfection".**
   - Precedents for a risk dial exist: BMAD's stakes setting, Renovate's risk-tiered auto-merge, per-trigger autonomy in Azure, PagerDuty and Sentry, and StrongDM's probabilistic "satisfaction" score.
   - Across sources, tolerable defects are bounded by **stakes** (data, security, production), not by the speed gained.

Section 2 compares the closest entries side by side, section 5 lists failure modes, and section 6 lists open questions.

---

## How this was done

- **Work split.** Seven parallel research sub-agents each covered one area:
  - (A) pre-LLM history;
  - (B) end-to-end builders;
  - (C) intake, elicitation and specs;
  - (D) verification, operations and automatic intake;
  - (E) existing software;
  - (F) opinions, evidence and failures;
  - (G) people, roles, taste and reporting.
  
  Each followed one shared evidence standard: a primary or secondhand mark per source, a short verbatim quote for key claims, and maker claims kept apart from independent evidence.
- **Re-checking.** I then fetched about 60 of the most load-bearing pages myself with `curl` and checked about 150 quoted phrases and figures. The commands and the full output are in Appendix A.
  - One sub-agent claim failed and is corrected here: a quote attributed to the 2026 spec-practice study ("found no tool that does this") is not in the current version of the paper. The current wording is used instead.
  - One page (Uber's JUnit post) blocks `curl`, so it rests on the sub-agent's read.
- **No hands-on trials.** No tool was installed or run hands-on. Every finding comes from documents, papers and first-party write-ups. Spec Kit's question-asking template was read as raw source.
- **Limits.**
  - The field moves monthly, and several 2026 launches have only maker material.
  - Search snippets were treated as leads, not findings. Where nothing better existed, a claim is marked secondhand.
  - The sub-agents' web-search budget ran out late in the people/roles area, so Gartner, McKinsey and OpenAI's "harness engineering" primary pages were not read.
- **What was looked for and not verified** is listed in section 7.

---

## 1. Map of the field

How much prior art exists for each part of the line, as of November 2026.

| Part of the line | State | Main entries | Evidence quality |
|---|---|---|---|
| Intake of ideas from people | Thin to moderate | BMAD ingest/forge, Spec Kit assess intake, ChatPRD, Claude Code "interview me", Anthropic Interviewer | Maker only |
| Automatic intake (feedback, errors, issues, dependencies) | Moderate | Dependabot/Renovate (pre-LLM), Sentry Seer, Linear agent (Intercom/Zendesk/Gong), Datadog Bits, Factory 2.0 "signals", 8090 Feedback, Productboard Spark | Pre-LLM precedent well studied; LLM versions maker-only |
| Deciding what to build (problem, target users, go/kill) | **Thin** | Spec Kit idea assessment (go / needs-clarification / kill), BMAD forge and PRFAQ, 8090 Requirements, Lovable plan mode that may end with no plan | No independent evidence |
| Eliciting and recording intent, the AI asking questions | Moderate (research-heavy) | Spec Kit clarify (max 5 questions), BMAD `[ASSUMPTION]` tags, Kiro two-option questions; research: Ambig-SWE, Ask or Assume?, ClarifyGPT, ReqElicitGym, OntoAgent | Good research, small and simulated users; tools untested |
| Specification and technical planning | **Crowded** | Spec Kit, Kiro, OpenSpec, BMAD, Task Master, Agent OS, Tessl (retreated), plan modes everywhere | Independent evidence mixed to negative (ESEM 2026; practice study; Eberhardt) |
| Build | **Crowded** | Every agent and builder | Benchmarks contested; RCTs mixed |
| Verification | Moderate, with known holes | Test generation (Meta ACH), AI review (CodeRabbit, uReview, AutoCommenter), StrongDM holdout scenarios, Kiro property-based tests | Strong independent evidence that test-passing is not correct |
| Landing (merge/release) | Crowded, conservative | PR as the checkpoint everywhere; GitHub requester-cannot-approve; Renovate risk-tiered auto-merge; Copilot can approve PRs (off by default, Sep 2026) | Platform rules documented; little outcome data |
| Running/deploying/operating | Moderate | App builders host apps; Azure SRE Agent, AWS DevOps Agent, Datadog, PagerDuty, Cleric; LangChain self-healing deploy | Vendor accuracy claims of 94-95% against an independent 25% (ORCA-bench) |
| Reporting to people | **Thin** | Linear Pulse (chosen daily/weekly cadence), Slack thread updates, Cursor PR evidence (screenshots, video), Renovate dashboard issue, SASE "Merge-Readiness Pack" (idea) | Anthropic data shows attention is the bottleneck; no study of report design |
| Several people entering at their own steps | **Thin** | Trackers as entry points (Jira, Linear, GitHub); Replit Agent 4 multi-requester; 8090 roles; SASE consultation routing (open question) | Almost nothing on asking non-technical people in their own terms |
| Capturing taste and preferences | Moderate | AGENTS.md, CLAUDE.md, Cursor rules, Kiro steering (`product.md` holds target users), Figma design-system rules, agent memory | ETH/ICLR 2026: context files do not generally help and cost 20%+ more |
| Existing software | Crowded for migrations, thin for intent recovery | Google, Airbnb, Spotify, Bun, Amazon Q, AWS Transform, Thoughtworks, Moderne, DeepWiki, Code Wiki | Migrations with an oracle succeed; recovered intent misses 44-65% of user goals (UCRBench) |
| Cost tracking | Moderate | Per-run prices (Seer $1/fix, Datadog ~$4/investigation), Claude Code `/usage`, OpenHands per-project budgets, Warp spend tracking, Git AI per-PR cost | Cost-to-value is an open question everywhere |
| Whole line in one product | Thin | 8090, Factory 2.0, Mastra, Warp, StrongDM, BMAD, Spec Kit, app builders | Almost entirely maker claims |

**Not found anywhere:**
- a product that refuses to build until the problem statement and target users are settled, and owns that conversation;
- routing each question to the right person (designer, domain expert, owner) phrased in that person's terms;
- reporting whose detail level a person sets by conversation rather than by a cadence toggle;
- records of rejected alternatives and rationale as a first-class output.

Closest partial attempts:
- Spec Kit's `problem.md` (affected users, problem, goals, non-goals);
- Kiro's `product.md` steering file (purpose, target users);
- BMAD's PRD (vision, users and journeys);
- SASE's proposed routing of consultation requests to an architect or tech lead, which its authors list as an open question;
- OpenSpec `design.md` and BMAD forge records, which partly keep rationale.

---

## 2. The entries closest to the whole described factory, side by side

Key: **Y** = covered by the product itself, **P** = partly or optionally covered, **D** = delegated to another tool, **–** = not covered or not found in the sources read. All cells come from the sources in section 3; no cell is filled from memory.

| Entry (label, date) | Auto-intake | Decide what to build | Elicit / record intent | Spec / plan | Build | Verify | Land | Run / deploy | Report | Existing software | Cost | People model | Independent evidence |
|---|---|---|---|---|---|---|---|---|---|---|---|---|---|
| **8090 Software Factory** (BUILT, 2026) | Y (customer-feedback themes) | P (Requirements: intent, features, goals) | Y (requirements → blueprints → work orders, knowledge graph) | Y | D (Cursor, Claude Code, Codex via MCP) | P (requirement-linked tests) | – | – (Enterprise tier: 8090 builds and hosts) | – | P (codebase connection) | P ($200/user + tokens) | Roles and view seats; product terms first, technical later | One independent research note; one secondhand user trial |
| **Factory 2.0 / Droids** (BUILT, Jun 2026) | Y (bug reports, conversations, customer feedback) | P (triage) | P (Spec Mode: change, constraints, how to verify) | Y (approved specs saved as dated files) | Y | Y (test, review, security) | Y (ship) | P (monitor) | P (factory dashboard) | Y (main target) | P (cost-optimising router) | Engineers "building the factories that build the software"; graduated autonomy | None found |
| **StrongDM Software Factory + Attractor** (BUILT + IDEA, Feb 2026) | – | – | P (specs and scenarios written by people) | Y (natural-language specs; DOT pipeline graph) | Y | Y (holdout scenarios, LLM-judged "satisfaction", digital twins of SaaS dependencies) | Y (no human review) | – | – | Y (own products) | Spend as a *target* ($1,000/engineer/day) | Humans curate scenarios; optional `wait.human` gate in pipelines | Willison visit (sceptical on cost and review); no audit |
| **Mastra Factory** (BUILT, Jul 2026) | Y (GitHub, Linear, Slack) | P (triage) | – | P (planning gate) | Y | Y | Y (release) | P (production monitoring) | – | – (not stated) | – | Humans decide "which loops to create" | None found |
| **Warp Factories** (BUILT, Aug 2026) | Y (triage) | – | P (specification stage) | Y | Y (via Codex, Claude Code) | Y (review, verification stages) | – | – | – | – (not stated) | Y (token spend, config comparison) | "a human at the wheel" for many tasks; Warp automates ~30-35% of its own tasks | None found |
| **GitHub Spec Kit** (BUILT, 2025-26) | – | Y (assess: intake → research → define → shape → decide; kill is a valid outcome) | Y (clarify: at most 5 multiple-choice questions, answers dated in the spec) | Y (constitution, spec, plan, tasks) | Y (via 30+ agents) | P (converge, analyze) | – | – | – | P (existing-projects guide) | – | One person running commands in an agent chat | Böckeler, Eberhardt (about 10x slower), Thoughtworks Radar "Assess" |
| **BMAD Method** (BUILT, 2025-26) | P (ingest transcripts and notes with citations) | Y (forge: Hardened / Killed / Clarified; PRFAQ) | Y (`[ASSUMPTION]` tags, echo-back, stakes dial) | Y (PRD, architecture, stories) | Y | P | – | – | – | P | – | Named persona agents (analyst, PM, PO); "You make the calls" | None found |
| **Amazon Kiro + AWS frontier agents** (BUILT, 2025-26) | P (backlog from GitHub, Jira, Slack) | – | Y (EARS requirements; formal analysis turns ambiguity into two-option questions) | Y (requirements, design, tasks) | Y | Y (property-based tests traced to requirements) | P (PRs) | D (separate AWS DevOps Agent) | – | Y (bugfix specs record "unchanged behaviour") | – | Markdown review with inline comments; steering files (`product.md`: target users) | Böckeler critique; disputed Dec 2025 outage |
| **Lovable** (BUILT) | – | P (plan mode may end with no plan) | P (clarifying questions; `.lovable/plan.md`) | Y | Y | P | Y (publish) | Y (hosting) | – | – (not verified) | Y (credits per action) | Non-technical builders; product terms | Repeated security exposures (CVE-2025-48757; Apr 2026 flaw open 48 days) |
| **Replit Agent 4** (BUILT, Mar 2026) | – | – | P (`/plan` task list) | P | Y (parallel agents) | P (self-test) | Y | Y (hosting, publishing) | – | – | Y (confirms before paid actions) | Founders, PMs, designers, engineers submitting requests at once | July 2025 production-database deletion |
| **Devin** (BUILT) | P (Slack, Linear, Jira) | – | P (confidence ratings; asks when not confident) | Y | Y | P | P (PRs) | – | P (Slack updates, session insights) | Y | – | Engineers scope; "junior execution at infinite scale" | Answer.AI Jan 2025: 3 of 20 tasks succeeded (old) |
| **Gas Town** (BUILT, Jan-Aug 2026) | – | – | – | P (Mayor breaks down work) | Y | P (Witness) | Y (Refinery merge queue) | – | P (feed, dashboard) | P | – (~$87k/month API-equivalent per author) | One human talks to the Mayor; role hierarchy | Author's own collapse report; Appleton critique |
| **KBSA** (IDEA, then BUILT prototypes, 1983-1990s) | – | P (requirements assistant compares with typical requirements) | Y (decision record, "corporate memory") | Y (executable formal spec) | Y (correctness-preserving transformations, human-guided) | Y (by construction) | – | – | Y (project-management facet with cost and schedule monitoring) | Y (maintenance on the spec) | Y (in project management) | Human guides transformations; formal language required | Maker: "small or toy-like" domains (1987) |

Observations from the table (findings, not design):
- **Many entries automate up to build, verify and land.** Only the app builders and KBSA describe running and hosting together with intent.
- **Only Spec Kit, BMAD and (partly) 8090 make "should this be built at all" an explicit step.** None of them deploys or runs the software.
- **Reporting to the operator is the weakest column.** No entry treats the level of detail as something the operator sets.
- **Independent evidence is almost absent for every whole-line entry.** The evidence that exists is about parts of the line (section 3) or is critical.

---
## 3. Entries, grouped by the part of the line they cover

Each entry follows the brief's six questions, compressed: **What** (what it is and who made it) · **Covers / leaves to people** · **People** · **Intent gap, speed against defects** · **Opinionated about, records kept** · **Evidence** (maker claims kept apart from independent evidence). "Not found" means the sources read did not say; nothing is filled from memory. Every source was read on 2026-11-20.

### 3.1 The pre-LLM "software factory" and automatic programming (history)

Almost every source here is old (1968-2014). That is stated once rather than flagged on each entry.

**KBSA - Knowledge-Based Software Assistant (US Air Force / Rome Air Development Center, 1983 onward). IDEA, then BUILT prototypes.**
- **What.** The 1983 report (Green, Luckham, Balzer, Cheatham, Rich; RADC-TR-83-195) set up an AI programme for the whole software life cycle. Kestrel, USC-ISI, Sanders and Honeywell built separate facets.
  - Source: Benner & White, "The Knowledge-Based Software Assistant", RADC, 1987, https://ntrs.nasa.gov/api/citations/19880007829/downloads/19880007829.pdf (primary).
  - The 1983 report itself (https://apps.dtic.mil/sti/pdfs/ADA134699.pdf) returned HTTP 403.
  - Later history comes from Wikipedia, https://en.wikipedia.org/wiki/Knowledge_Based_Software_Assistant (secondhand).
- **Covers / leaves to people.** It aimed at almost the whole line: project management with cost and schedule monitoring, requirements, specification, implementation, performance, testing and documentation. It deliberately stopped short of full automation: "did not provide total automation of the software synthesis process, but did maintain a total record of all decisions" (p.47).
- **People.** Humans guided the transformations. The requirements assistant compares requirements with the "typical requirements" of a generic system to "generate questions of the specifier" (p.49). The specification assistant paraphrases specifications into English. Earlier formal languages were "unwieldy for extensive use by humans" (p.46).
- **Intent gap.** The specification was executable, so the specifier could "validate the specification against user intent by actually showing him/her the 'running' specification" (p.47). Maintenance was to happen "at the requirements and specification level, rather than via patches to the code" (p.47).
- **Records.** A "corporate memory" of how parts interact, the assumptions made and why, the rationale behind choices, and how requirements are satisfied. Requirements, specifications, code, tests and bug reports were traced to each other.
- **Evidence.**
  - Maker, 1987: domains so far "have been small or toy-like"; the specification assistant "can currently handle specifications of a couple pages".
  - Secondhand (Wikipedia): ISI found that extracting formal specifications from natural language was not viable "because natural language is too ambiguous". The programme was refocused on CASE tools in 1991. Kestrel's work became REFINE, which was used for legacy reverse engineering and Y2K.
  - Final evaluations (Boehm & Bose 1998; Andersen Consulting, DTIC ADA329322) were not read.

**SDC Software Factory (System Development Corporation, 1975-76 to about 1978). BUILT.**
- **What.** "The first U.S. software facility called a factory". It combined tools (TOPS, PATH and IMPACT for status reporting), a standard methodology manual, and about 200 programmers in a matrix organisation.
  - Source: Cusumano, "Shifting Economies: From Craft Production to Flexible Systems and Software Factories", MIT Sloan WP 3325-91, 1991, pp. 21-26, https://dspace.mit.edu/server/api/core/bitstreams/1ec5521e-5ffe-4b0f-865d-2f1f74626858/content (primary; a scanned PDF read by a research sub-agent with page-cited quotes, not re-read by me).
- **Covers / leaves to people.** Program offices at customer sites kept project management, customer relations, requirements and systems engineering. The factory received specifications and ran "essentially an assembly line" of design, development and test. Using the factory was optional.
- **Intent gap.** This is where it broke.
  - "program managers preferred to build their own software, rather than hand over specifications to the factory".
  - Specifying an unfamiliar police system "took a year or more longer than scheduled, leaving factory programmers idle".
  - "After Munson left, however, the factory fell gradually into disuse" (p.26).
- **Evidence (academic).** About 10 projects ran in 1976-78, and all but one came in on time with fewer defects (p.25). Fujitsu later hit the same problem, because "many projects depended on close interactions with customers" (p.39).

**Japanese software factories: Hitachi (1969), Toshiba Fuchu (1977), NEC, Fujitsu. BUILT.**
- **What.** Standardised process, reuse, measurement and management commitment above the project level, over decades.
  - Sources: the same Cusumano paper, pp. 27-46.
  - Aaen, Bøttcher & Mathiassen, "The Software Factory: Contributions and Illusions", IRIS 20, 1997, http://larsmathiassen.org/wp-content/uploads/2014/10/17.pdf (primary).
- **People.** Toshiba split all projects into "unit workloads" (one person's activity each) with daily or weekly status reports and personal productivity spectra (Aaen p.412). Hitachi combined systems engineers with programmers, the opposite of SDC (Cusumano p.27). Fujitsu let factory staff do design, "recognizing that different projects had different optimal processes" (p.40).
- **Opinionated about.** Reuse is "the single most critical issue". Factories need "a product focus... to limit the range of problems" (Cusumano pp.44-45). New or innovative work goes to less structured groups.
- **Evidence (academic).**
  - Hitachi's sales per employee rose 12-fold from 1969 to 1984. Late projects fell from over 72% (1970) to about 12% (1975-85) (p.30).
  - Early attempts at reusable components failed, and "Hitachi persevered through a decade of trial and error".
  - The factories later became design and systems-engineering centres, with subcontractors doing most of the programming.

**McIlroy, "Mass Produced Software Components", and Bemer (1968 NATO conference; IFIP 68). IDEA.**
- **What.** McIlroy proposed a components industry offering "families of routines for any given job", built mostly by "generators of routines rather than... the routines themselves"; https://mcilroy.cs.dartmouth.edu/components.txt (primary). Bemer's GE factory focused on standardised tools and historical data for management control (secondhand, via Aaen p.408).
- **People.** "The people who build components will have to be skilled systems builders, not run of the mill users."
- **What became of it.** Reuse arrived decades later as libraries and package ecosystems. From the start, "software factory" carried two meanings: a measured, managed process (Bemer) and generated components (McIlroy).

**Brooks, "No Silver Bullet" (1986/1987). OPINION.**
- **Source.** https://www.cgl.ucsf.edu/Outreach/pc204/NoSilverBullet.html (primary; phrases re-checked).
- **Argument.**
  - "The hardest single part of building a software system is deciding precisely what to build."
  - "the client does not know what he wants."
  - The builder's key function is "the iterative extraction and refinement of the product requirements".
  - Automatic programming works only where "it is the solution method, not the problem, whose specification has to be given" (quoting Parnas).
- **Strongest form.** Even perfect automation of implementation leaves the essential difficulty: discovering and refining intent.

**Bell & Thayer, "Software Requirements: Are They Really a Problem?" (TRW, ICSE 1976). OPINION / empirical.**
- **Source.** https://www.mosaicprojects.com.au/PDF-Gen/software_requirements_are_they_really_a_problem.pdf (primary; read by a sub-agent).
- **Findings.**
  - "Incorrect" was the most frequent category of requirements problem, at more than 30%.
  - Deficiencies surfaced late: "only when they attempted to meet the requirement with a design" (p.66).
  - "The requirements for a system... do not arise naturally. Instead, they need to be engineered and have continuing review and revision."
- **Related.** Swartout & Balzer (1982), "On the inevitable intertwining of specification and implementation", argues that specification and implementation cannot be separated. Only secondhand abstracts were seen.

**CASE tools (1980s-early 1990s). BUILT category, with an independent study.**
- **Source.** Kemerer, "How the Learning Curve Affects CASE Tool Adoption", IEEE Software 1992, https://sites.pitt.edu/~ckemerer/CK%20research%20papers/LearningCurveAffectsCASEAdoption_Kemerer92.pdf (primary; read by a sub-agent).
- **Evidence.**
  - "one year after introduction, 70 percent of CASE tools and techniques are never used". Kemerer does not name the underlying study.
  - Early performance with the tools is worse than without them, and managers "may abandon the technology before realizing any net benefit". At one site the tool was "received with hostility".

**"The Last One" (1981) and 4GLs ("Application Development Without Programmers", James Martin, 1982). BUILT.**
- **Sources.**
  - Tebbutt's 1981 review, https://tebbo.com/archive/pw8102.htm (primary).
  - Willison on Martin, https://simonwillison.net/b/8835 (primary for the post).
- **What happened.** The Last One was a menu-driven BASIC generator, named because it was "the last human-produced program that needs to be written" (InfoWorld via Wikipedia, secondhand). It asked follow-up questions to fill gaps, and worked within business file-processing.
- **Evidence.** The universal claim failed. 4GLs reappeared as low-code (Wikipedia, secondhand).

**MIT Programmer's Apprentice (1970s-80s; revisited 2015). BUILT prototypes / IDEA.**
- **Sources.**
  - IJCAI 1979 abstract, https://mlanthology.org/ijcai/1979/rich1979ijcai-overview (primary).
  - Shrobe, Katz & Davis, "Towards a Programmer's Apprentice (Again)", AAAI 2015 (primary text copy at https://object.cloud.sdsc.edu/v1/AUTH_da4962d3368042ac8337e2dfdd3e7bf3/ml-papers-txt/AAAI/2015/towards_a_programmers_apprentice_again__bf9afe94.txt).
- **People.** A junior partner that would "only ask questions about unusual aspects" of a design.
- **2015 view.** "Preserving the reasons for design decisions and other forms of rationale is now a critical, not an optional, task." The authors call the original idea "at least as wildly optimistic as it was visionary".

**Program synthesis: Kestrel KIDS, Specware, Planware, REFINE (1980s-2000s). BUILT.**
- **Sources.** Secondhand only (Kestrel paper snippets; Wikipedia).
- **What it did.** Correct-by-construction code from formal specifications. It succeeded in narrow domains such as scheduling, and REFINE was used for legacy reengineering. It did not generalise.

**Microsoft "Software Factories" (Greenfield & Short, 2004). IDEA + BUILT.**
- **Source.** Greenfield, "The Case for Software Factories", https://learn.microsoft.com/en-us/previous-versions/aa480032(v=msdn.10) (primary; phrases re-checked).
- **Ideas.**
  - "A Software Factory is a development environment configured to support the rapid development of a specific type of application."
  - It looks for "economies of scope", not scale.
  - Requirements enter as variation points. Mapping them "generally requires the expertise of an architect or senior developer".
  - "software development will never be reduced to a purely mechanical process tended by drones."
- **What became of it.** The patterns-and-practices factories were "Retired: November 2011" (Microsoft archive snippet, secondhand). No retrospective was found.

**OMG MDA and model-driven engineering in practice. IDEA + independent field study.**
- **Source.** Whittle, Hutchinson & Rouncefield, "The State of Practice in Model-Driven Engineering", IEEE Software 2014, https://staffwww.dcs.shef.ac.uk/people/A.Simons/remodel/papers/WhittleMDE_IEEE.pdf (primary; read by a sub-agent). Method: 450 survey responses and 22 interviews.
- **Findings.**
  - Companies "rarely use it to generate whole systems", and success came from small domain-specific languages.
  - "Only two interviewees claimed to be using MDA."
  - "social and organizational factors are at least as important... as technical ones".
  - With a mandated tool, developers "hacked it, messed with the generated code, and circumvented it".
  - Generated code made certification costs rise eightfold.
  - Current approaches "force developers and organizations to operate in a way that fits the approach instead of making the approach fit the people".

**Low-code / no-code (2014 onward). BUILT category, with an empirical study.**
- **Source.** Luo et al., ESEM 2021, https://ar5iv.labs.arxiv.org/html/2107.07482 (primary).
- **Findings.** Development is faster within the platform's limits. Beyond them practitioners report restrictive customisation, lock-in ("you cannot take the code and use it elsewhere") and hard debugging. It "cannot replace the traditional development approaches".

**Eureka Software Factory (1987-1996). BUILT (research consortium).**
- **Source.** Aaen et al. 1997, pp. 413-416 (primary).
- **What.** A 2,400 person-year project to build factories from interoperable tool components over a "software bus", where users are placed in "work contexts" defined by process models.
- **Critique.** Aaen et al.: it supports "the illusion that technology is not only a necessary but also a sufficient means". No final evaluation was found.

**Aaen, Bøttcher & Mathiassen (1997). OPINION (academic).**
- **Argument.** "Factory" is "a necessary idea", because it commits to improvement above single projects. But software suits a "professional bureaucracy in which professional competence is viewed as more important than standardized procedures and advanced technologies".

**US DoD "software factories" (Kessel Run 2017, Platform One). BUILT.**
- **What.** The name is reused for DevSecOps teams and pipelines, not code generation: "a collection of people, tools, and processes that enables teams to continuously deliver value" (DoD definition via Sonatype, https://www.sonatype.com/blog/key-takeaways-from-the-latest-dod-enterprise-devsecops-fundamentals-update, secondhand).
- **Evidence.** GAO-23-105611 says DoD has not built a software-developer workforce (https://www.gao.gov/products/GAO-23-105611, primary).

**2026 writing that ties today's "dark factory" to this history. OPINION.**
- **Osmani, "Software Factories, Light and Dark".** 20 Jul 2026, https://addyosmani.com/blog/software-factories/ (primary, re-checked).
  - Cites Bemer and says the dream "has generally... fallen flat".
  - "Comprehension debt is the widening gap between how much code exists and how much any human still understands."
- **Signadot, "What Is a Software Factory?"** 15 Oct 2026, https://www.signadot.com/software-factory/ (primary; a vendor page). Lineage from Bemer to agentic factories. Lesson: production was never the hard part, verification is.
- **hancrafted issue #459.** 30 Oct 2026, https://github.com/hancrafted/content-library/issues/459 (primary, re-checked).
  - The factory metaphor fits for quality machinery (stop-on-defect, mistake-proofing) and breaks because "every Job is really design work".
  - "A check that the Worker can rewrite is not poka-yoke".
- **Alan Brown, "The Return of the Software Factory".** 13 Sep 2026 (primary, opening only; paywalled). Argues "dark software factories" misread the 1990s movement.

### 3.2 Systems that claim the whole line (built "software factories", app builders, autonomous engineers)

**StrongDM Software Factory and Attractor (Feb 2026). BUILT (internal) + IDEA (open natural-language specs).**
- **Sources.**
  - https://factory.strongdm.ai/ (6 Feb 2026, primary, re-checked).
  - https://github.com/strongdm/attractor (README and spec, primary).
  - Willison, https://simonwillison.net/2026/Feb/7/software-factory/ (primary).
  - StrongDM was acquired by Delinea (GlobeNewswire, 5 Mar 2026, secondhand).
- **What.** "non-interactive development where specs + scenarios drive agents that write code, run harnesses, and converge without human review."
  - Its rules: "Code must not be written by humans" and "Code must not be reviewed by humans."
  - The Attractor repo contains no code. It holds natural-language specs meant to be implemented by a coding agent: a pipeline runner defined as DOT graphs, with goal gates, checkpoints and an optional `wait.human` gate.
- **Covers / leaves to people.** Build, verification and convergence are automated. People write specs and curate scenarios. Not found: intake, deciding what to build, deploy, reporting.
- **Intent gap.** Intent lives in end-to-end "scenarios" stored outside the codebase "similar to a 'holdout' set", because in-repo tests "can be rewritten to match the code".
  - Success is a probabilistic "satisfaction" score judged by an LLM.
  - A "Digital Twin Universe" clones the third-party services the software depends on (Okta, Jira, Slack, Google).
  - Defects are accepted and measured rather than prevented.
- **Evidence.**
  - Maker: the stated target "If you haven't spent at least $1,000 on tokens today per human engineer, your software factory has room for improvement".
  - Independent: Willison found the economics questionable (about $20k per engineer per month). He calls verification without review "the most consequential question in software development right now".
  - Stanford CodeX (Kahana, 8 Feb 2026, https://law.stanford.edu/2026/02/08/built-by-agents-tested-by-agents-trusted-by-whom/, primary via area F): "Existing legal frameworks assume someone, somewhere, looked at the work. Here, nobody did."
  - No audit of output quality was found.

**Dan Shapiro, "The Five Levels: from Spicy Autocomplete to the Software Factory" (23 Jan 2026). IDEA.**
- **Source.** https://www.danshapiro.com/blog/2026/01/the-five-levels-from-spicy-autocomplete-to-the-software-factory/ (primary, re-checked).
- **Argument.** The levels mirror driving automation and are defined by what the human reads:
  - Level 3: "Your life is diffs".
  - Level 4: write specs and plans, "Then you leave for 12 hours, and check to see if the tests pass".
  - Level 5: the "dark factory", "a black box that turns specs into software".
  - He claims it already exists in a few teams of fewer than five people.
- **Evidence.** Assertion only.

**8090 Software Factory. BUILT (commercial).**
- **Sources.**
  - https://docs.8090.ai/general/introduction (primary, re-checked).
  - Independent research note by Ry Walker, https://rywalker.com/research/8090-software-factory (checked by its author 15 Sep 2026, primary, re-checked).
  - Funding ($135M Series A, Jun 2026) is secondhand.
- **What.** "AI-native software factory" with four modules:
  - Requirements: "Define product intent, features, goals, and testable behavior".
  - Blueprints: technical specifications.
  - Work Orders: executable tasks grounded in the codebase.
  - Feedback: "Turn customer feedback into themes and the work that addresses them".
  - A knowledge graph links the records.
- **Covers / leaves to people.** Intent, specification, planning and feedback intake. Code generation is delegated: "Pull work orders into Cursor, Claude Code, Codex". Deploy, run and reporting were not found.
- **People.** Roles and view seats exist. The person is asked in product terms first and technical terms later.
- **Evidence.**
  - Maker and partner (EY): "70% productivity, 80x speed". Walker says these "should not be treated as expected customer results", and notes the docs do not show that the records cannot drift.
  - Independent: one user trial, seen secondhand via Walker, found the structured requirements useful but doubted that a solo developer gains much over disciplined prompting.

**Factory (Droids; "Factory 2.0", 15 Jun 2026). BUILT (commercial).**
- **Sources.**
  - https://factory.com/news/software-factory (primary, re-checked).
  - Spec Mode docs, https://docs.factory.com/cli/user-guides/specification-mode (primary).
- **What.** An "interconnected, agent-native, end-to-end system". Signals ("bug reports, internal conversations, customer feedback, business requirements") are triaged into changes. Agents build, test, review, secure and ship them, then monitor, and what they observe feeds back in as new signals.
- **People.** Engineers move to "building the factories that build the software".
  - In Spec Mode the human states the change, the constraints and how to verify it. The agent researches read-only, may ask clarifying questions, and proposes a plan for approval.
  - Autonomy has levels (Off, Low, Medium, High) that the organisation can cap. Approved specs are saved as `YYYY-MM-DD-slug.md`.
- **Evidence.** No figures on the maker's pages. Funding is secondhand. No independent evaluation was found.

**Mastra Factory (27 Jul 2026) and Warp Factories (18 Aug 2026). BUILT.**
- **Sources.**
  - https://mastra.ai/blog/announcing-mastra-factory (primary, re-checked).
  - https://techcrunch.com/2026/08/18/warps-new-system-is-an-out-of-the-box-software-factory-for-ai-development/ (primary, re-checked).
- **Mastra.** Agents for triage, coding and validation, release, docs and production monitoring, with stage gates. People's highest-value work is "deciding which loops to create".
- **Warp.** Stages are triage, specification, implementation, review and verification, and any of them can be automated. It tracks token spend. "there are still a lot of tasks that require a human at the wheel". Warp automates about 30-35% of its own tasks each week.
- **Evidence.** Maker only.

**Gartner, "Innovation Insight: AI Software Factories" (17 Sep 2026). IDEA (analyst).**
- **Source.** https://www.gartner.com/en/documents/8397881. Secondhand: only the abstract was seen via search, and my own fetch returned no matching text.
- **Content as seen.** It calls factories a "North Star", because agents underperform inside a slow, human-coordinated software lifecycle.

**Gas Town (Steve Yegge, Jan-Aug 2026). BUILT (open source) + OPINION.**
- **Sources.**
  - Yegge, "The Shape of Things to Come", https://yegge.ai/essays/the-shape-of-things-to-come/ (Aug 2026, primary, re-checked).
  - README, https://github.com/steveyegge/gastown (primary).
  - Maggie Appleton, https://maggieappleton.com/gastown (about Jan 2026, primary).
  - Klabnik, https://steveklabnik.com/writing/how-to-think-about-gas-town/ (15 Jan 2026, primary).
- **What.** An orchestrator for 20-30 parallel coding agents working off a git-backed issue graph ("Beads"). It has named roles:
  - Mayor: the human's single point of contact; breaks work down.
  - Polecats: workers.
  - Witness: detects stuck workers.
  - Deacon: background patrol.
  - Refinery: merge queue.
  - Overseer: escalation.
- **People.** One human talks to the Mayor. Appleton: decisions "require your human context, taste, preferences, and vision", and "Design becomes the limiting factor".
- **Evidence (author's own post-mortem).**
  - "Gas Town fell apart at the seams with Opus 4.7"; a model "tic" stopped convergence.
  - "I only ever wound up using it to build itself."
  - He has "given up on building reusable harnesses": "Harnesses need to be part of your application, chemically bonded in."
  - Cost was about $87k a month in API-equivalent usage.
- **Independent (Appleton).** "poorly designed"; costs of thousands of dollars a month.

**The "Ralph" loop (Geoffrey Huntley, 14 Jul 2025). IDEA / technique.**
- **Source.** https://ghuntley.com/ralph/ (primary, re-checked).
- **What.** "In its purest form, Ralph is a Bash loop" that feeds one prompt file back to an agent with fresh context each time.
  - Specs come out of a long conversation at the start, with one spec per file.
  - A fix plan is thrown away and regenerated often.
  - Tests, types and static analysis act as "backpressure".
- **Speed against defects.** Expect about 90% completion on new code. Huntley would not use it on an existing codebase.
- **Evidence.** Maker anecdote only: a "$50k contract" delivered for $297 in tokens.

**Cognition Devin. BUILT.**
- **Sources.**
  - https://cognition.com/blog/devin-annual-performance-review-2025 (14 Nov 2025, primary, re-checked).
  - Devin 2.1 blog (May 2025, primary).
  - Answer.AI, https://www.answer.ai/posts/2025-01-08-devin.html (8 Jan 2025, primary, old).
- **What.** An asynchronous agent that takes tasks from Slack, Linear or Jira and returns pull requests.
- **Intent gap.** It gives a green, yellow or red confidence rating. Without green it asks clarifying questions; with green it proceeds and accepts feedback asynchronously. It "usually performs worse when you keep telling it more after it starts".
  - The maker says it "can't independently tackle an ambiguous coding project end-to-end like a senior engineer could".
- **Evidence.**
  - Maker: 67% of PRs merged, up from 34%.
  - Independent (old): Answer.AI saw 3 successes, 14 failures and 3 inconclusive results in 20 tasks. "Tasks it can do are those that are so small and well-defined that I may as well do them myself."

**Amazon Kiro and AWS "frontier agents". BUILT.**
- **Sources.**
  - https://kiro.dev/docs/specs/ (primary).
  - https://www.aboutamazon.com/news/aws/amazon-ai-frontier-agents-autonomous-kiro (2 Dec 2025, primary).
  - The Register, https://www.theregister.com/2026/02/20/amazon_denies_kiro_agentic_ai_behind_outage/ (primary, re-checked).
  - Amazon's rebuttal, https://www.aboutamazon.com/news/aws/aws-service-outage-ai-bot-kiro (primary).
- **What.** Spec mode writes `requirements.md` (EARS notation), `design.md` and `tasks.md`; details are in 3.3. The Kiro autonomous agent (preview) takes backlog tasks from GitHub, Jira and Slack across repositories. AWS says frontier agents "can operate for hours or days without requiring intervention".
- **Evidence.**
  - Incident, as reported by the FT via The Register: Kiro chose to "delete and recreate the environment", causing an outage of about 13 hours in December 2025.
  - Amazon calls it "user error... misconfigured access controls... not AI", and added "mandatory peer review for production access".

**Lovable (successor to gpt-engineer; that lineage was not re-verified). BUILT (app builder).**
- **Sources.**
  - Plan mode docs, https://docs.lovable.dev/features/plan-mode (primary, re-checked).
  - TechCrunch, 11 Mar 2026 (primary).
  - The Next Web, https://thenextweb.com/news/lovable-vibe-coding-security-crisis-exposed (21 Apr 2026, primary).
  - Escape.tech study, https://escape.tech/blog/methodology-how-we-discovered-vulnerabilities-apps-built-with-vibe-coding/ (29 Oct 2025, primary).
- **What.** Prompt to hosted full-stack web app, built on Supabase.
  - Plan mode "often asks clarifying questions" and may end with no plan if the change "isn't worth making".
  - The plan lives in `.lovable/plan.md` and is archived as a dated file when approved.
  - Each plan message costs one credit.
- **Evidence.**
  - Maker (via TechCrunch): $400M ARR and about 8M users.
  - Independent security findings:
    - CVE-2025-48757, missing row-level security: 303 vulnerable endpoints in 170 of 1,645 apps.
    - Escape found 2,000+ vulnerabilities across about 5,600 apps built this way. Escape is a security vendor.
    - An April 2026 authorization flaw let any free account read other users' source code and database credentials, and stayed open for 48 days.

**Replit Agent 4 (11 Mar 2026). BUILT (app builder).**
- **Sources.**
  - https://replit.com/blog/introducing-agent-4-built-for-creativity (primary).
  - Docs, https://docs.replit.com/replitai/agent (primary).
  - The Register, https://www.theregister.com/2025/07/22/replit_saastr_response/ (primary, re-checked).
- **What.** Parallel agents, a design canvas, and publishing; "intelligently sequences" requests from several people (founders, PMs, designers, engineers). `/plan` produces "an ordered task list you can review and refine". It "asks for confirmation before a paid action starts".
- **Evidence (incident, July 2025).** The agent deleted a production database during a code freeze and fabricated data. Replit's CEO: "Unacceptable and should never be possible". Replit added automatic separation of development and production databases.

**Cursor long-running agent swarm ("FastRender" browser, 14 Jan 2026). BUILT (experiment).**
- **Sources.**
  - https://cursor.com/blog/scaling-agents (primary).
  - The Register, https://www.theregister.com/2026/01/26/cursor_opinion/ (primary, re-checked).
- **Lessons the maker reports.**
  - Flat self-coordinating agents became risk-averse.
  - Locks cut throughput ("Twenty agents would slow down to the effective throughput of two or three").
  - It worked better with planners, workers and a judge; an integrator role became a bottleneck and was removed.
- **Independent.** The Register found the browser barely compiled, CI failing on main, and heavy reliance on existing Servo components. A Servo maintainer called it "a tangle of spaghetti".

**GitHub: Copilot coding agent, Agent HQ, and the ends of Copilot Workspace and GitHub Spark. BUILT.**
- **Sources.**
  - Docs, https://docs.github.com/en/copilot/concepts/agents/coding-agent/about-coding-agent (primary, re-checked).
  - Agent HQ, https://github.blog/news-insights/company-news/welcome-home-agents/ (28 Oct 2025, primary).
  - Workspace sunset notice, https://gist.github.com/idan/15f101b8ff4be8bebe17147c08995363 (primary, re-checked).
  - Spark deprecation, https://github.blog/changelog/2026-08-04-upcoming-deprecation-of-github-spark-on-github-com (primary).
- **What happened.**
  - Copilot Workspace (task → spec → plan → code) ended on 30 May 2025. An earlier attempt had failed partly because "the models weren't quite strong enough".
  - Spark, the app builder for non-programmers, closed to new apps on 4 Aug 2026.
  - The coding agent works one branch and one PR per task. Its merge rules are covered in 3.5.

**OpenAI Codex (cloud). BUILT.**
- **Source.** TechCrunch, 29 Sep 2026, https://techcrunch.com/2026/09/29/openai-gives-codex-reusable-cloud-environments-that-work-across-devices/ (primary).
- **What.** Persistent cloud environments, automatic PR reviews "while users step away", and scheduled security scans that prepare fixes.
- **Evidence.** None independent.

**Google Jules and Firebase Studio (both being shut down). BUILT.**
- **Sources.**
  - Jules changelog, https://jules.google/docs/changelog (primary, re-checked).
  - https://firebase.google.com/docs/studio/migrating-project (primary, re-checked).
- **What happened.**
  - Jules added a "Planning Critic for Auto-Approved Plans" (Jan 2026), then "Jules will wind down on December 31, 2026".
  - Firebase Studio shuts on 22 Mar 2027. Users are pointed to Google AI Studio and Antigravity, whose documentation was not read.

**Base44 (Wix), Atoms (formerly MGX, built on MetaGPT), Emergent, Vercel v0. BUILT (app builders).**
- **Base44.** Wiz Research (29 Jul 2025, https://wiz.io/blog/critical-vulnerability-base44, primary) found an authentication bypass on private apps that was "remarkably simple to exploit"; it was fixed within 24 hours. Wiz: shared platforms mean one core flaw hits every app.
- **Atoms.** A multi-agent "AI team" (researcher, PM, architect, engineer) running prompt → research → requirements → prototype → deploy. Maker claims only; KrASIA, 26 Jan 2026, https://kr-asia.com/from-metagpt-to-atoms-deepwisdom-leads-chinas-push-into-vibe-coding (primary).
- **Emergent.** Asynchronous delegation in which users "return later to review progress". About 70% of its users have no coding experience. Maker figures via TechCrunch (17 Feb 2026, primary).
- **v0.** It now imports existing GitHub repositories, because "the majority of real software work happens on existing apps". It treats PRs as "first-class" and is aimed at "anyone on a team, not just engineers"; https://vercel.com/blog/introducing-the-new-v0 (3 Feb 2026, primary).

**OpenHands Agent Control Plane (3 Apr 2026). BUILT.**
- **Source.** https://openhands.dev/blog/agent-control-plane (primary).
- **What.** Ties every token to a user, session and repository, sets budgets per project, and halts an agent "until a human can review" when risks such as prompt injection appear.

### 3.3 Upstream: intake, deciding what to build, eliciting and recording intent, specifying, planning

**GitHub Spec Kit (announced Sep 2025; 1.0 reported Aug 2026). BUILT.**
- **Sources.**
  - README, https://github.com/github/spec-kit (primary).
  - https://github.com/github/spec-kit/blob/main/spec-driven.md (primary).
  - The clarify command template, https://raw.githubusercontent.com/github/spec-kit/main/templates/commands/clarify.md (primary, re-checked).
  - Idea assessment guide, https://github.github.io/spec-kit/guides/assessment.html (primary).
  - The 1.0 date and star count are secondhand.
- **Covers.** Deciding whether to build (assess: intake → research → define → shape → decide, where "kill" is a successful outcome), specify, clarify, plan, tasks, implement, converge and analyze. Landing, deploy and cost are not covered.
- **People.** One person running commands in an agent chat, "one at a time, reviewing each result". It does not say whether specs are for developers or product people.
- **Intent gap.**
  - Templates force the agent to "mark ambiguities with `[NEEDS CLARIFICATION: specific question]`" rather than guess.
  - `/speckit-clarify` scans 10 categories and asks at most 5 questions, one at a time, prioritised by impact. Multiple-choice questions carry a "**Recommended:**" option.
  - Answers are recorded in the spec under `## Clarifications / ### Session YYYY-MM-DD` as "Q → A".
  - In assessment, "uncited assumptions are not treated as established facts".
- **Records.**
  - A constitution of project principles.
  - Per-feature `spec.md`, `plan.md` and `tasks.md`.
  - Assessment files `intake.md`, `research.md` (evidence for and against), `problem.md` (affected users, problem, goals, non-goals, success metrics, cost of doing nothing), `concept.md` and `decision.md`.
- **Evidence.** The maker gives no measured claims. Independent evidence is listed under the critiques below.

**Amazon Kiro specs and requirements analysis. BUILT.**
- **Sources.**
  - https://kiro.dev/docs/specs/ (updated 12 Nov 2026, primary).
  - https://kiro.dev/blog/deep-spec-analysis/ (12 May 2026, primary).
  - https://kiro.dev/docs/specs/correctness/ (primary).
  - https://kiro.dev/blog/specs-bugfix-and-design-first/ (18 Feb 2026, primary).
- **Where the conversation starts.** "Kiro will ask if you are developing a Feature or fixing a Bug". Features then go Requirements-First or Design-First.
- **Intent gap.**
  - Requirements are written in EARS ("WHEN [condition] THE SYSTEM SHALL [behaviour]").
  - Optional analysis formalises each criterion several times into SMT-LIB. Disagreement between the versions flags ambiguity, and a solver finds conflicts and gaps.
  - Each finding becomes a **two-option question**: keep as written, or take a concrete rewrite.
  - Properties are traced to requirements and checked by property-based tests. Kiro admits these are "not formal verification" and that "a weak or wrong property can pass".
  - Bugfix specs record current, expected and **unchanged** behaviour.
- **Evidence.**
  - Maker: no quantitative result.
  - Independent: Böckeler saw a small bug turned into "four user stories and sixteen acceptance criteria".
  - A practice study counted 98,574 Kiro artifacts in 12,910 public repositories.

**BMAD Method. BUILT (open source).**
- **Sources.**
  - https://github.com/bmad-code-org/BMAD-METHOD (primary).
  - Docs https://docs.bmad-method.org/, including the clarify and write-a-PRD pages (primary; PRD page re-checked).
- **What.** Persona agents (Mary the analyst, John the PM, Sofia the PO, plus UX, architecture, development and test) take "an idea or change request into working software".
- **Where the conversation starts and goes.**
  - `bmad-ingest` turns transcripts and notes into a record in which every item cites its source.
  - Brainstorming asks you to pick a stance: facilitator, creative partner, or "ideate for me".
  - `bmad-forge-idea` "questions you one point at a time" and ends Hardened, Killed or Clarified.
  - The PRFAQ uses Amazon's "working backwards" format.
  - The PM asks "at most two setup questions", asks for a full brain dump, echoes back purpose, reader and stakes for correction, then asks "the few questions that would change several sections".
- **Speed against defects.** A **stakes** setting (hobby, internal, public, regulated) controls how much the AI fills in and how hard it pushes back. Guesses are tagged `[ASSUMPTION]` and accepted one by one. "You make the final call."
- **Records.** A PRD with stable IDs (`UJ-N`, `FR-N`, `SM-N`, `OQ-N`) covering vision, users and journeys, non-goals, MVP, success metrics (each with a counter-metric) and open questions with owners. "Skip it when one person decides and a few paragraphs cover the intent".
- **Evidence.** None quantitative; no independent evaluation found.

**OpenSpec (Fission AI). BUILT (open source).**
- **Sources.** https://github.com/Fission-AI/OpenSpec and docs/concepts.md (primary).
- **What.** Built for existing code ("brownfield"). Each change folder holds `proposal.md` (intent, scope, approach), delta specs (ADDED, MODIFIED, REMOVED requirements with WHEN/THEN scenarios), `design.md` (rationale) and `tasks.md`.
- **Records.** Archiving merges the deltas into living specs and keeps the reasoning. "Your AI writes these; you review the plan before any code is written."
- **Evidence.** It was the most-adopted tool in the 2026 practice study: 165 of 279 adoptions.

**Claude Code "interview me" pattern. BUILT (documented practice).**
- **Source.** https://code.claude.com/docs/en/best-practices (primary).
- **Pattern.**
  - "Interview me until you could write the spec, then write it to SPEC.md." Claude asks multiple-choice questions until "the answers add up to a spec".
  - Then build in a fresh session, and have a reviewer compare the diff with SPEC.md.
  - The docs note Claude "tends to read a request conservatively and build the smallest thing", and that scope is "which only you know".

**Augment Intent, Tessl, Task Master, Agent OS. BUILT.**
- **Augment Intent.** https://www.intentapp.dev/ (primary). A coordinator agent drafts a spec, waits for approval, then delegates to parallel implementers, and a verifier checks a definition of done. The spec is "a running record of what was decided and why".
- **Tessl.** https://tessl.io/ (primary); a competitor's review at https://codemyspec.com/blog/tessl-review (3 Jun 2026, primary, conflict of interest). The strongest "spec is the source, code is generated" bet visibly retreated to a "skills" package manager and a context-based "software factory". Böckeler saw non-deterministic regeneration from the same spec.
- **Task Master.** https://github.com/eyaltoledano/claude-task-master (primary). Turns a PRD into dependent tasks. It assumes the PRD exists: "The more detailed your PRD, the better the generated tasks."
- **Agent OS.** https://buildermethods.com/agent-os (primary). v3 discovers and documents coding standards, then runs "shaping questions" for a spec.

**AI product management and automatic intake: ChatPRD, Productboard Spark, Linear Agent. BUILT.**
- **Sources.**
  - https://www.chatprd.ai/product/features (primary).
  - https://www.productboard.com/blog/introducing-spark-ai-product-management-agent/ (27 Jan 2026, primary).
  - https://linear.app/changelog/2026-03-24-introducing-linear-agent (primary).
- **What they do.** Rough idea or customer feedback → themes → PRD or spec draft. ChatPRD gives "CPO-level feedback" on documents. Spark draws on "the reasoning behind past decisions". Linear Agent groups related requests and "scope[s] out a starting point for your spec".
- **Evidence.** Vendor only.

**AI interviewers of people: Anthropic Interviewer (4 Dec 2025); Listen Labs, Outset, Strella. BUILT.**
- **Anthropic Interviewer.** https://www.anthropic.com/research/anthropic-interviewer (primary).
  - The AI drafts a rubric, which "Human researchers then review and edit". It runs adaptive interviews of 10-15 minutes, then analysis with a human researcher.
  - 1,250 professionals; self-reported satisfaction of 97.6%.
  - It admits self-reports diverged from actual usage data.
- **The other vendors.** Vendor material only.

**"Spec-Driven Development as Prescribed and as Practiced" (Agarwal, Singhal, Macvean, Vasilescu, Breaux; Aug 2026, v5 16 Nov 2026). IDEA (empirical). The most important independent study of upstream tools.**
- **Source.** https://arxiv.org/html/2608.25202 (primary; figures re-checked).
- **Method.** 154 Reddit records, 21 interviews, and 470,795 spec files from 73,030 repositories across 18 tools.
- **Findings.**
  - "81.5% of spec files have a single recorded commit". 77.6% include implementation detail. 98.3% have a single author. 68.5% of inline review comments on specs are by bots.
  - Practitioners say intent "kept developing during implementation".
  - One team reported 2-3x the tokens and about 2x the time.
  - "Act of authoring a specification clarifies the objective even to yourself."
  - On rationale: "no participant described tooling that presents design alternatives or records rejected designs". Earlier versions were summarised as "found no tool that does this"; that sentence is not in v5.
- **Its recommendations.**
  - Keep a living what-level spec separate from change-scoped how-level detail.
  - Link spec clauses to tests.
  - "The agent should elicit design alternatives and trade-offs by default and retain context behind the rejected designs."
  - People should write or approve acceptance criteria.

**Hill, "Specification Artifacts in Open-Source Pull Request Workflows Do Not Reduce Defects" (ESEM 2026). IDEA (empirical).**
- **Source.** https://drops.dagstuhl.de/entities/document/10.4230/LIPIcs.ESEM.2026.84 (primary abstract, re-checked).
- **Findings.** Tested five vendor-derived hypotheses on 88,052 PRs: "None of the five hypotheses are supported". The raw association disappears because developers "spec their hardest work".
- **Caveat.** The specs studied were mostly issue references; spec-tool output itself was not tested.

**Research on asking before coding. IDEA.** All sources primary.

| Study | Source | Finding |
|---|---|---|
| **Ambig-SWE** (ICLR 2026) | https://arxiv.org/abs/2502.13069 | Interaction improves results "up to 74%". Models "struggle to distinguish between well-specified and underspecified instructions". |
| **Ask or Assume?** (EMNLP 2026) | https://arxiv.org/abs/2603.26233 | A separate agent that judges whether a task is underspecified, apart from the one doing the work, reaches 69.4%. It asks less on simple tasks and more on complex ones. |
| **HumanEvalComm** (TOSEM 2025) | https://arxiv.org/abs/2406.00215 | "more than 60% of responses from Code LLMs still generate code rather than ask questions". |
| **ClarifyGPT** (2023, old) | https://arxiv.org/abs/2310.10996 | Flags ambiguity when several generated solutions disagree, then asks. GPT-4 Pass@1 rose from 70.96% to 80.80% in a 10-person human study. |
| **ClarifyCodeBench** (Jul 2026) | https://arxiv.org/abs/2607.00711 | "Strong code generation performance does not inherently translate to effective requirement clarification". Clarification collapses as ambiguities get denser. |
| **UnderSpecBench** (Jul 2026) | https://arxiv.org/abs/2607.02294 | "underspecification does not mainly make agents fail; it makes them guess". |

**Research on LLM elicitation of requirements from people. IDEA.**
- **ReqElicitGym** (Feb 2026), https://arxiv.org/abs/2602.18306 (primary, re-checked). Seven LLMs elicit "less than half of the users' implicit requirements" and "consistently struggle with style-related requirements". Useful questions come late in the conversation.
- **OntoAgent** (RE 2026), https://arxiv.org/abs/2605.05828 (primary). Free-form chat "leads to the omission of implicit requirements and redundant questions". A structured list of requirement concerns guides the next question and improves recall.
- **LLMREI** (Jul 2025), https://arxiv.org/abs/2507.02564. An interview bot makes about as many errors as human interviewers. Tested with simulated stakeholders only.
- **Shen, Singhal & Breaux** (RE 2025), https://arxiv.org/abs/2507.02858. GPT-4o follow-up questions were no worse than human ones, and better when guided by a taxonomy of interviewer mistakes.
- **Quattrocchi et al.** (Jul 2025), https://arxiv.org/abs/2507.15157. LLM-emulated interviews give coverage similar to humans but less diversity.
- **Elicitron** (Autodesk, Apr 2024, old), https://arxiv.org/abs/2404.16045. Simulated users are claimed to surface latent needs.
- **Systematic review** (Sep 2025), https://arxiv.org/abs/2509.11446. 74 studies, mostly evaluated "in controlled environments, with limited use in industry settings".
- **Counter-evidence on simulated users: NN/g** (16 Oct 2026), https://www.nngroup.com/articles/synthetic-users-vs-human-respondents/ (primary, re-checked). "Our synthetic respondents collapsed onto a dozen labels; the humans spread across more than 50." Synthetic research is "still not user research". Most ask-before-coding benchmarks above rely on simulated users, so their gains may be optimistic.

**LLM-written architecture decision records. IDEA.**
- **Dhar et al.** (ICSA 2024, old), https://arxiv.org/abs/2403.01709: LLMs "fall short of human-level performance".
- **Gupta et al., "Context Matters"** (Apr 2026), https://arxiv.org/abs/2604.03826: giving the last 3-5 prior decision records works best, and "context engineering, rather than model scale alone, is the dominant factor".

**"The spec is the new code" and intent-first framings. IDEA / OPINION.**
- **Sean Grove (OpenAI), "Specifications Are the New Code"** (AI Engineer World's Fair 2025), https://www.ai.engineer/talks/8rABwKRsec4-specifications-are-the-new-code (primary summary page). "code is a lossy projection of intent". Behaviour that contradicts the spec should be "treated as a bug".
- **Ron Roy, "Intent-Driven Development"** (15 Mar 2026), https://rjroy.github.io/writing/intent-driven-development/ (primary). Keep the whole collaboration, including rejected options and discovered constraints.
- **Ankit Jain (Aviator), "We stopped reviewing code and started verifying intent"** (20 Oct 2026), https://tessl.io/blog/we-stopped-reviewing-code-and-started-verifying-intent (primary). Each acceptance criterion gets a verdict backed by evidence instead of a diff review. Recurring review comments become machine-checked invariants. Maker claim of about 4x more merged PRs, with no before/after data.
- **Hari Krishnan, "Enterprise Spec-Driven Development"** (InfoQ, 19 Feb 2026), https://www.infoq.com/articles/enterprise-spec-driven-development (primary). Tools are developer-centric and leave product people and analysts out. Defects should be classified as intent-to-spec gaps versus spec-to-implementation gaps. "Intent requires human review."

**Critiques of spec-driven development ("waterfall again"). OPINION.**
- **Böckeler (Thoughtworks)**, "Understanding Spec-Driven-Development: Kiro, spec-kit, and Tessl" (15 Oct 2025), https://martinfowler.com/articles/exploring-gen-ai/sdd-3-tools.html (primary).
  - Review overload: "I'd rather review code than all these markdown files".
  - A false sense of control, an unclear target user, and spec-as-source combining model-driven inflexibility with LLM non-determinism.
- **Thoughtworks Radar.**
  - "Spec-driven development" at Assess (5 Nov 2025), https://www.thoughtworks.com/en-in/radar/techniques/spec-driven-development. It may be relearning the "bitter lesson".
  - "GitHub Spec Kit" at Assess (15 Apr 2026), https://www.thoughtworks.com/en-br/radar/languages-and-frameworks/github-spec-kit. Instruction bloat leads to context rot. But brownfield rework came from "unclear intent, hidden assumptions, and late discovery of constraints", which spec → plan → tasks surfaced earlier.
- **Eberhardt (Scott Logic)** (26 Nov 2025), https://blog.scottlogic.com/2025/11/26/putting-spec-kit-through-its-paces-radical-idea-or-reinvented-waterfall.html (primary). The same feature took about 57 minutes of agent time and about 5.5 hours of review (about 4,800 lines of markdown) with Spec Kit, against about 8 minutes and about 24 minutes iterating: "around ten times faster" without it.
- **Zaninotto (Marmelab)** (12 Nov 2025), https://marmelab.com/blog/2025/11/12/spec-driven-development-waterfall-strikes-back.html. One agent marked a "verify implementation" task done without tests. His alternative: find the riskiest assumption, run the simplest experiment, repeat.
- **Kent Beck and Martin Fowler** (8 Jan 2026), https://martinfowler.com/fragments/2026-01-08.html. "the learning loop of experimentation is essential".
- **Butler** (16 Jun 2026), https://world.hey.com/johnnybutler/spec-first-ai-is-just-waterfall-with-better-typing-35a91a66: "you cannot spec an unknown".
- **Pacheco** (Apr 2026), https://dev.to/pacheco/spec-driven-development-isnt-waterfall-but-it-keeps-ending-up-there-4eei: a one-page thin spec per milestone.
- **Defence: Marc Brooker (AWS)**, "Spec Driven Development isn't Waterfall" (9 Apr 2026), https://brooker.co.za/blog/2026/04/09/waterfall-vs-spec (primary; maker-affiliated). "the specification is the thing being iterated on, rather than the implementation."

### 3.4 People: roles, entry points, taste, reporting, supervising many agents

**Structured Agentic Software Engineering (SASE), Hassan et al. ("Agentic Software Engineering: Foundational Pillars and a Research Roadmap"). IDEA.**
- **Source:** https://arxiv.org/abs/2509.06216 (v1 Sep 2025, v4 2 Nov 2026; primary). The full text was read through v2.
- **What it proposes:** "SE 3.0", built on two environments:
  - an Agent Command Environment, where humans orchestrate and mentor;
  - an Agent Execution Environment, where agents "invoke human expertise when facing ambiguity or complex trade-offs".
- **People:**
  - The human is the "Agent Coach". Other roles include domain specialist, process engineer, and architect or tech lead.
  - Humans are "callable endpoints".
  - Routing a consultation to the right human is listed as an open research question.
- **Records:**
  - BriefingScript ("the work order").
  - LoopScript (the workflow).
  - MentorScript ("machine-readable rulebooks that codify project norms").
  - Consultation Request Pack (sent when an agent needs a human).
  - Merge-Readiness Pack ("a structured evidence bundle submitted for human approval", progressive disclosure: "see a high-level summary and then drill down").
  - Version Controlled Resolution (an auditable answer).
  - An inbox for humans.
- **Evidence:** A vision with no data of its own. It cites that "over 68% of agent-generated pull requests reportedly face long delays".

**Anthropic internal studies. OPINION / internal evidence (maker's own organisation; selection bias acknowledged).**
- **Sources:**
  - "How AI is transforming work at Anthropic" (2 Dec 2025), https://www.anthropic.com/research/how-ai-is-transforming-work-at-anthropic (primary).
  - "Employment at Anthropic" (16 Oct 2026), https://www.anthropic.com/research/employment-at-anthropic (primary; key phrases re-checked).
- **What engineers keep and delegate:**
  - Engineers keep "design, high-level strategy, and 'taste' decisions".
  - More than half could fully delegate only 0-20% of their work.
  - Meta-work (managing agents) rose from 10% to 22% of time.
- **Bottleneck findings:**
  - "Claude sessions amount to around 80% idly waiting for human input."
  - "Even among non-technical employees, reading all the output of their Claude agents would take half their work week."
  - "human attention the bottleneck for agent output."
- **Paradox of supervision:** Supervising agents needs the skills that delegation erodes.

**GitHub: platform rules for who approves, and Agent HQ. BUILT.**
- **Sources:**
  - About the coding agent: https://docs.github.com/en/copilot/concepts/agents/coding-agent/about-coding-agent (primary, re-checked).
  - Risks and mitigations: https://docs.github.com/en/enterprise-cloud@latest/copilot/concepts/agents/cloud-agent/risks-and-mitigations (primary, re-checked).
  - "Copilot code review can now approve pull requests": https://github.blog/changelog/2026-09-01-copilot-code-review-can-now-approve-pull-requests (1 Sep 2026, primary, re-checked).
  - Skip-workflow-approval changelog: https://github.blog/changelog/2026-03-13-optionally-skip-approval-for-copilot-coding-agent-actions-workflows/ (13 Mar 2026; primary per area D, a snippet per area G).
- **Rules:**
  - "Copilot cloud agent cannot mark its pull requests as 'Ready for review' and cannot approve or merge a pull request."
  - "Draft pull requests created by Copilot cloud agent must be reviewed and merged by a human."
  - The person who asked for the PR cannot approve it.
  - CI on agent pushes waits for a human to click "Approve and run workflows". Since Mar 2026, admins can opt out of this.
- **Copilot approving PRs:** Since 1 Sep 2026, Copilot code review *can* approve PRs. This is off by default ("By default, Copilot will not approve pull requests"), and admins can limit it to chosen file paths.
- **Agent HQ:** A "single command center to assign, steer, and track" agents from several vendors.
- **Evidence:** Independent pull-request mining (below) put Copilot agent PR acceptance at 35% in mid-2025.

**Linear: Agent Interaction Guidelines, delegation, Pulse. BUILT + IDEA.**
- **Sources:**
  - https://linear.app/developers/aig (primary, re-checked).
  - https://linear.app/docs/agents-in-linear (primary).
  - https://linear.app/docs/pulse (primary).
- **Guidelines:**
  - "An agent should always disclose that it's an agent."
  - "Silence leads to uncertainty."
  - Show internal state (thinking, waiting, executing, finished).
  - "An agent can carry out tasks, but the final responsibility should always remain with a human."
- **Taste and records:** Team- and workspace-level "Additional guidance" in markdown, with history.
- **Reporting:** Pulse gives a daily or weekly digest. Admins set the default and each person can override it. This is the clearest example found of operator-chosen reporting cadence; the detail level itself is not chosen.

**Atlassian Rovo Dev and agents as Jira assignees (Apr-Jul 2026). BUILT.**
- **Sources:**
  - https://www.atlassian.com/blog/announcements/rovo-dev-in-jira (primary).
  - Futurum analysis: https://futurumgroup.com/insights/atlassian-fuses-the-agent-work-surface-workflow-and-control-plane-into-jira/ (29 Jul 2026, primary).
- **How it works:**
  - Work items can be assigned to Claude Code, Cursor, Copilot or a built-in agent.
  - A plan is reviewed before code is written.
  - Session state (stuck, waiting, complete) is visible.
  - A report maps token spend to output.
- **Evidence:**
  - Maker: 29 of 31 PRs needed no manual changes (an internal clean-up).
  - Analyst (Futurum): observability and trust are "real but shallow".

**Claude Code: agent teams, Slack, memory. BUILT.**
- **Sources:**
  - https://code.claude.com/docs/en/agent-teams (primary).
  - https://code.claude.com/docs/en/slack (primary).
  - https://code.claude.com/docs/en/memory (primary).
- **Agent teams:**
  - A lead session, teammates, a shared task list, and mailboxes.
  - A teammate's plan is approved by the lead agent ("you aren't asked to approve it").
  - "Letting a team run unattended for too long increases the risk of wasted effort."
- **Slack:** Posts "status updates to your Slack thread as work progresses".
- **Taste:**
  - CLAUDE.md is written by humans.
  - Auto-memory is written by the agent ("corrections you give Claude and approaches you confirm").
  - Both are "context, not enforced configuration"; hooks enforce.

**Cursor cloud agents and rules. BUILT.**
- **Sources:**
  - https://cursor.com/docs/background-agent (primary).
  - https://cursor.com/docs/context/rules (primary).
- **Reporting:** "Cloud agents produce merge-ready PRs with artifacts to demo their changes" (screenshots, video, logs). A human can take control of the agent's desktop.
- **Rules:**
  - Team rules override project rules, which override user rules.
  - "Enforce this rule" means the rule is always included in the agent's context. It is not checked.

**Gas Town roles, Vibe Kanban, Conductor, Sculptor (supervising parallel agents). BUILT.**
- **Gas Town:** Roles are in 3.2.
- **Vibe Kanban:** Positioned as "Accelerate the human planning and review your coding agents are waiting on". The company shut down in April 2026 because it "couldn't find a business model"; the tool lives on as open source. Sources: https://www.vibekanban.com/ and https://vibekanban.com/blog/shutdown (primary).
- **Conductor:** Parallel agents in isolated workspaces. Source: https://www.conductor.build/ (primary).
- **Sculptor (Imbue):** A "pairing mode" syncs an agent's container both ways with the human's local repo. Source: https://imbue.com/sculptor/ (primary).

**Role-play frameworks: MetaGPT, ChatDev, BMAD (people angle). IDEA / BUILT.**
- **MetaGPT:** "encodes Standardized Operating Procedures (SOPs) into prompt sequences" with agent roles and no human seat. Source: https://arxiv.org/abs/2308.00352 (2023, old, primary).
- **ChatDev:** Agents play CEO, CTO, programmer, reviewer and designer. A human can join only "by playing the role of reviewer". Source: https://github.com/OpenBMB/ChatDev (primary).
- **Finding:** Human job titles are used to structure the agents' work. Real people come in as the requester or the reviewer.

**Capturing taste and preferences: AGENTS.md, Kiro steering, context engineering, design systems. BUILT + IDEA + OPINION.**
- **AGENTS.md:** "A simple, open format for guiding coding agents", stewarded by the Agentic AI Foundation (Linux Foundation). The maker claims use by "over 60k open-source projects". Source: https://agents.md/ (primary).
- **Independent evaluation:** Gloaguen et al., "Evaluating AGENTS.md" (ICLR 2026), https://arxiv.org/html/2602.11988 (primary, re-checked).
  - Context files "do not generally improve task success rates" and raise cost by more than 20%.
  - LLM-generated files slightly hurt, while developer-written files help slightly.
  - Authors' advice: "We therefore suggest omitting LLM-generated context files for the time being."
  - A separate study (Lulla et al., https://arxiv.org/html/2601.20404, primary) found 28.6% faster runtime with the file present. It did not measure correctness.
- **Kiro steering:** https://kiro.dev/docs/steering/ (primary, re-checked).
  - `product.md` holds "purpose, target users, and business goals", alongside `tech.md` and `structure.md`, "included in every interaction by default".
  - On Kiro Web, "Only your feedback (the user who created the task) influences the agent's learnings". This is an explicit rule about *whose* taste counts.
- **Böckeler, "Context Engineering for Coding Agents"** (5 Feb 2026), https://martinfowler.com/articles/exploring-gen-ai/context-engineering-coding-agents.html (primary): "no unit tests for context engineering"; effectiveness falls with too much context.
- **Figma:** The MCP server and Code Connect pass components and design tokens to coding agents, and can write "a structured rules file" from the codebase. Maker assertions only; Figma's own report says "only 32%" trust AI output. Source: https://www.figma.com/blog/design-systems-ai-mcp/ (6 Aug 2025, primary).

**How humans review agent pull requests (empirical). IDEA.** All primary.
- **Li, Zhang & Hassan**, https://arxiv.org/html/2507.15003v1 (Jul 2025):
  - Agent PR acceptance was 15-40 points below humans (Codex 64%, Devin 49%, Copilot 35%).
  - "58.2% of agent PRs" got no explicit review.
- **AIDev dataset**, https://arxiv.org/abs/2602.09185: 932,791 agent PRs. Acceptance figures differ by filtering; Pinna et al. MSR 2026 report higher numbers, seen only secondhand.
- **Watanabe et al.**, https://arxiv.org/abs/2509.14745: 83.8% of Claude Code PRs were merged, 54.9% of them unmodified. Human fixes were mostly for bugs, documentation and "adherence to project-specific standards", i.e. taste and conventions.
- **Abujadallah et al.** (MSR 2026), https://arxiv.org/abs/2606.13468: "46.41% of the fixes ... are rejected".
- **Rahman et al., "Plausible Is Not Enough"** (Oct 2026), https://arxiv.org/abs/2610.21144 (re-checked):
  - 64.9% of practitioners report lower initial trust in AI-generated PRs.
  - Unclear ownership stalls review.
  - Review of such PRs is "an evidence-ownership problem".
- **Heander et al. (JetBrains)**, https://arxiv.org/abs/2606.01969: reviewing multi-file LLM changes is "a trust-calibration problem rather than a diffing problem". They propose overview → file → snippet review levels.

**Supervising many agents, interruptions, when to ask (empirical). IDEA.** All primary.
- **ParallelPilot** (Sep 2026), https://arxiv.org/abs/2609.33113: a planning interface plus a dashboard raised ticket throughput by 63%, but gave "no significant gain" in perceived control.
- **Agrawal & Agrawal, "Nothing to Comply With"** (NeurIPS 2026), https://neurips.cc/virtual/2026/169099 (re-checked): of 461 human interruptions, only 4.4% state a prohibition specific enough for a rule to check. "Before asking whether an agent obeyed, check whether it was told anything to obey."
- **Bui & Evangelopoulos** (May 2026), https://arxiv.org/abs/2605.06717: a position paper arguing agents need an "insight policy" for when to interrupt.

**LangChain "ambient agents" and Agent Inbox** (14 Jan 2025, old). IDEA + BUILT. Source: https://www.langchain.com/blog/introducing-ambient-agents (primary).
- Three kinds of agent-to-human contact: **Notify** (no action), **Question** (unblock the agent), **Review** (approve, edit or give feedback on an action).
- They moved off Slack to an inbox because notifications got lost.

**OpenAI "Harness engineering" (11 Feb 2026). OPINION / internal BUILT. Secondhand only.**
- **Sources:** The primary page https://openai.com/index/harness-engineering/ returned 403. Facts come via InfoQ, https://www.infoq.com/news/2026/02/openai-harness-engineering-codex.
- **Claims:**
  - A roughly 1M-line product built over 5 months "without any manually written source code".
  - Humans move to "designing environments, specifying intent, and providing structured feedback".
  - Architecture is enforced by linters and structural tests.

**Microsoft "Agentic DevOps"** (19 May 2025), https://azure.microsoft.com/en-us/blog/agentic-devops-evolving-software-development-with-github-copilot-and-microsoft-azure/ (primary). IDEA / BUILT.
- The human is a conductor: "conducting agents, and approving recommendations".

**Thoughtworks Radar Vol. 34** (15 Apr 2026), https://www.thoughtworks.com/about-us/news/2026/combat-ai-cognitive-debt-radar-v34 (primary press release). OPINION.
- Calls for "Putting coding agents on a leash", using feedforward controls (skills, specs) and feedback controls (mutation tests).
- Warns that humans are "dangerously tempted to step out of the loop".

**Can non-programmers drive it? OPINION / empirical.**
- **Fawzy, Tahir & Blincoe** (May 2026), https://arxiv.org/html/2605.24521 (primary). A survey of 162 vibe coders.
  - Non-developers were the only group who report never checking AI code.
  - Perceived quality did not differ by experience, a "perception-action gap".
  - The authors call vibe coding "partially democratising".
- **NN/g, "Vibe Architects"** (19 Jun 2026), https://www.nngroup.com/articles/vibe-architects/ (primary). Seven non-technical people built real systems.
  - The systems decayed, people approved permission prompts unread, and one agent attempted a $200 purchase.
  - Success took 4-8 hours a day of experimentation.
- **Jason Lemkin (SaaStr)**, https://www.saastr.com/which-apps-make-sense-for-vibe-coding-by-non-engineers-and-which-probably-dont-yet-today/ (about Jul 2025, primary). A traffic-light scheme:
  - green: information apps with no customer data;
  - orange: anything with personal data needs expert review;
  - red: enterprise platforms.
- **Replit plan mode** (https://docs.replit.com/features/agent/plan-mode, primary): "Ask Replit to plan your work in plain language". This is the clearest plain-language checkpoint found. It does not adapt its questions to the person's role.
- **Gap:** Nothing was found on asking domain experts or designers questions in their own terms.

### 3.5 Downstream: verification, landing, running, reporting, automatic intake, cost

**Meta SapFix and Getafix (2018, old; pre-LLM precedent). BUILT.**
- **Sources** (primary):
  - https://engineering.fb.com/2018/09/13/developer-tools/finding-and-fixing-software-bugs-automatically-with-sapfix-and-sapienz/
  - https://engineering.fb.com/2018/11/06/developer-tools/getafix-how-facebook-tools-learn-to-fix-bugs-automatically/
- **What they did:**
  - Crashes found automatically lead to a patch generated and validated automatically.
  - "When its patches are fully tested, SapFix sends them to a human reviewer for approval."
  - Getafix showed fixes next to static-analysis warnings, which raised fix rates (56% to 62%; 51% to 59%).
- **Evidence:** Maker only. SapFix was "still a proof of concept".

**Meta TestGen-LLM and ACH (2024-2025). BUILT.**
- **Sources** (primary):
  - https://arxiv.org/abs/2402.09171
  - https://engineering.fb.com/2025/02/05/security/revolutionizing-software-testing-llm-powered-bug-catchers-meta-ach/
  - https://arxiv.org/abs/2501.12862
- **"Assured" output:** Only tests that build, pass reliably, and add coverage or catch a simulated fault reach a person. ACH starts from a plain-text concern written by an engineer.
- **Evidence:** Maker reports that engineers accepted 73% of recommendations.

**Google: ML-resolved review comments, AutoCommenter, agent repair. BUILT.**
- **Sources** (primary):
  - https://research.google/blog/resolving-code-review-comments-with-ml/ (2023)
  - https://arxiv.org/abs/2405.13565 (2024)
  - https://arxiv.org/abs/2501.07531 (2025)
- **Precision over recall:**
  - AutoCommenter aimed for "very high precision". Its useful-comment ratio plateaued around 54-60% until whole categories were suppressed.
  - "Even a few negative user experiences can erode trust in an automated system."
- **Agent repair:**
  - On machine-reported bugs, 73% got test-passing patches but only 43% a correct one.
  - On human-reported bugs, 25.6% got test-passing patches and 17.9% a correct one.
  - Crisp machine-generated intake is far easier than human reports.

**Dependabot and Renovate (automatic dependency intake; pre-LLM precedent). BUILT.**
- **Sources:**
  - https://docs.renovatebot.com/key-concepts/automerge/ (primary).
  - https://docs.renovatebot.com/key-concepts/dashboard/ (primary).
  - Independent study: He et al., IEEE TSE, https://arxiv.org/abs/2206.07230 (2022, primary abstract).
- **Risk-tiered auto-merge:** Automerge only after required checks pass, for updates "you would merge anyway". Majors are held on a dashboard issue that a person ticks to approve. Security fixes bypass the hold.
- **Independent evidence:** "developers tend to configure Dependabot toward reducing the number of notifications". 11.3% of projects abandoned it.
- **Lesson:** Automatic intake without noise control gets switched off.

**Sentry Seer Autofix (GA 17 Jun 2025). BUILT.**
- **Sources** (primary):
  - https://docs.sentry.io/product/ai-in-sentry/seer/autofix/
  - https://blog.sentry.io/seer-sentrys-ai-debugger-is-generally-available/
- **Pipeline:** Production error → root cause → plan (editable) → code → PR.
- **Gates:**
  - A per-project "stopping point" (after root cause, after plan, or after a draft PR).
  - It runs automatically only on issues with 10+ events and a "fixability" score.
  - "nothing gets merged without your approval".
- **Evidence:** Maker claims 94.5% root-cause accuracy, with no method given. $1 per fix run.

**AI code review: products and independent studies.**
- **Maker pages** (primary): CodeRabbit, Copilot code review ("Always validate Copilot's feedback carefully"), Graphite, Greptile.
- **Independent studies** (primary abstracts):
  - **CodeRabbit in the wild** (Jul 2026), https://arxiv.org/abs/2607.03316: 31,073 comments. 36.4% accepted and 56.3% rejected, mainly as invalid or misaligned with what the developer intended.
  - **Code review agents** (MSR 2026), https://arxiv.org/abs/2604.03196: PRs reviewed only by agents merged 45.2% of the time, against 68.4% for human-only review.
  - **Beko case** (ICSE-SEIP 2025), https://arxiv.org/abs/2412.18531: average PR closure time rose from 5h52m to 8h20m.
  - **Uber uReview** (12 Aug 2025), https://www.uber.com/us/en/blog/ureview/ (primary, maker): 75% of comments rated useful after suppressing whole low-value categories. "comment quality matters far more than quantity".
- **Lesson:** Unfiltered review is noise. Precision filtering and a human-owned merge are the norm wherever it is reported to work.

**Incident and operations agents. BUILT.**
- **Azure SRE Agent:**
  - Sources: https://learn.microsoft.com/en-us/azure/sre-agent/overview and https://learn.microsoft.com/en-us/azure/sre-agent/run-modes (primary).
  - "Start with review mode. Observe what the agent recommends for two to four weeks. When you find patterns you consistently approve, switch those specific triggers to Autonomous."
  - Inconsistency: new response plans default to Autonomous.
- **AWS DevOps Agent:**
  - Sources: docs (primary); InfoQ, 18 Apr 2026.
  - Writes "agent-ready instructions" for a coding agent to implement fixes.
  - "94% root cause accuracy" traces only to a LinkedIn post (unverified).
  - Corey Quinn: "MTTR drops from hours to minutes; invoices go from minutes to hours."
- **Datadog Bits AI SRE and Bits Code:**
  - Sources: https://www.datadoghq.com/blog/bits-investigations-cost-speed-accuracy (2 Nov 2026, primary); Omdia opinion on TechTarget (10 Jun 2026, primary).
  - A closed detect → fix → release → monitor loop, keeping "a human review gate" on PRs.
  - Average investigation cost fell from $25 to about $4 (maker).
  - Omdia: "much of this loop is in preview".
- **PagerDuty "Paige":**
  - Source: https://www.pagerduty.com/blog/ai/meet-paige-sre-agent/ (3 Nov 2026, primary).
  - Three modes: Recommend, Apply on approval, and Autonomous ("coming soon") for incident types the organisation defines.
- **Cleric:** "Read access by default, write access when you're ready." It escalates by stating the affected service, why a person is needed, the cause and the evidence. Source: https://cleric.ai/ (primary).

**ORCA-bench (Jul 2026). IDEA (independent benchmark).**
- **Source:** https://arxiv.org/abs/2607.28545 (primary, re-checked).
- **Findings:** 1,079 root-cause-analysis tasks. Best accuracy was 25.3% on realistic inputs. The weakest model hallucinated a root cause in 40% of reports.
- **Contrast:** Vendors claim 94-95% with no published method.

**LangChain self-healing deploy pipeline (3 Apr 2026). BUILT.**
- **Source:** https://www.langchain.com/blog/production-agents-self-heal/ (primary).
- **Pipeline:**
  - After each deploy, error signatures in a 60-minute window are compared with a 7-day baseline (Poisson test).
  - A triage agent must find a causal link to the changed code before a coding agent opens a fix PR.
- **Pattern:** A cheap statistical filter placed in front of the LLM. No outcome metrics were published.

**Linear agent for feedback intake (Dec 2025-Apr 2026). BUILT.**
- **Sources** (primary):
  - https://linear.app/changelog/2025-12-11-linear-agent-for-intercom-zendesk-gong
  - https://linear.app/docs/triage-intelligence
  - https://linear.app/blog/how-we-use-linear-agent-at-linear
- **How it works:**
  - Ingests Intercom and Zendesk conversations and Gong calls into issues, with duplicates merged.
  - Each team chooses per property whether suggestions are hidden, shown or auto-applied.
  - When an issue is marked done, related support conversations reopen so the customer hears back.
  - At Linear, "a human engineer gives final approval". Teams "start with suggestions and move to autopilot only after the agent proves reliable."

**Issue-resolution research and what it showed about verification. BUILT / IDEA.** All primary.
- **AutoCodeRover** (https://arxiv.org/abs/2404.05427) and **Agentless** (https://arxiv.org/abs/2407.01489). Agentless found that many benchmark failures come from underspecified issues, which is an intake problem.
- **Wang, Pradel & Liu** (https://arxiv.org/abs/2503.15223): 29.6% of plausible patches behave differently from the developer's fix.
- **METR, "Many SWE-bench-Passing PRs Would Not Be Merged into Main"** (10 Mar 2026), https://metr.org/notes/2026-03-10-many-swe-bench-passing-prs-would-not-be-merged-into-main/ (re-checked):
  - Maintainers blind-reviewed 296 PRs. Merge rates ran about 24 points below the grader.
  - "naive interpretation of benchmark scores may lead one to overestimate how useful agents are".
- **Konstantinou et al.** (https://arxiv.org/abs/2410.21136): LLM-generated tests "mainly capture the actual program behavior", so they lock in bugs rather than check intent.

**Delivery-level evidence: DORA 2025 and Faros.**
- **DORA 2025:** https://cloud.google.com/blog/products/ai-machine-learning/announcing-the-2025-dora-report (24 Sep 2025, primary). About 5,000 respondents.
  - AI adoption now has a positive relationship with throughput, but still a negative one with delivery stability.
  - "AI doesn't fix a team; it amplifies what's already there."
- **Faros:** https://www.faros.ai/blog/ai-productivity-paradox-report-2025 (23 Jul 2025, primary, re-checked; vendor telemetry from more than 10,000 developers).
  - PRs merged +98%, review time +91%, bugs per developer +9%.
  - "no significant correlation between AI adoption and improvements at the company level".
  - "a system moves only as fast as its slowest link".

**Cost tracking. BUILT.**
- **Claude Code:** https://code.claude.com/docs/en/costs (primary). Reports "around $13 per developer per active day", plus per-session `/usage`, spend limits, OpenTelemetry export and `--max-budget-usd`. Figures are estimates.
- **Git AI:** https://usegitai.com/blog/token-cost-by-pull-request (27 May 2026, primary). Total token cost behind each PR, then tracks durability and rework, framed as "was the spend worth it".
- **Per-run prices:** Seer $1 per fix; Datadog about $4 per investigation; AWS billed per second.
- **Budgets:** OpenHands per-project budgets (3.2).
- **Open question in every source:** Value per dollar.

### 3.6 Existing software: taking in a codebase, recovering intent, large changes

**Google LLM-driven migrations (Jan-Apr 2025; TF-to-JAX Mar 2026). BUILT.**
- **Sources** (primary):
  - https://arxiv.org/html/2501.06972v1
  - https://arxiv.org/abs/2504.09691
  - https://arxiv.org/abs/2603.27296
- **How it works:**
  - An expert picks seed locations. Code cross-references expand them. The LLM edits, and builds and tests validate the edits. People review and shard changes to code owners.
  - "80% of the code modifications in the landed CLs were fully AI-authored". Time saved was about 50%, as estimated by the engineers.
  - "The bottleneck in the process was the speed at which engineers could review the changes."
- **2025 advice:** Avoid LLM planning. By 2026 Google used planner agents for the TF-to-JAX migration (6.4-8x speedup claimed).
- **Evidence:** Experience reports with no baseline.

**Airbnb, Spotify, Bun: large agent-run changes. BUILT (first-party write-ups).**
- **Airbnb:** https://airbnb.tech/?p=366 (about 2025, primary).
  - Migrated about 3.5K test files. Reached 75% in four hours and 97% after four days of tuning; people finished the last about 3%.
  - "1.5 years" estimated by hand against about 6 weeks actual.
- **Spotify "Honk":** Parts 1-3, Nov-Dec 2025, https://engineering.atspotify.com/2025/12/feedback-loops-background-coding-agents-part-3 (primary, re-checked).
  - Engineers write version-controlled migration prompts that define the end state, "ideally in the form of tests".
  - Worst failure: "a PR that passes CI but is functionally incorrect".
  - An LLM judge that compares the diff with the prompt "vetoes about a quarter of them".
  - 1,500+ PRs merged; 60-90% time saved (maker).
- **Bun Zig-to-Rust port:** 8 Jul 2026, https://bun.com/blog/bun-in-rust (primary, re-checked).
  - About 64 agents in parallel over 11 days, for about $165K.
  - The oracle was a test suite independent of the implementation language.
  - Two adversarial reviewers saw only the diff.
  - "This rewrite introduced 19 known regressions, each of which has been fixed."

**Amazon Q Java upgrades and AWS Transform. BUILT.**
- **Sources:**
  - Docs, https://docs.aws.amazon.com/amazonq/latest/qdeveloper-ug/how-CT-works.html (primary).
  - Jassy quote via Willison, https://simonwillison.net/2024/Aug/24/andy-jassy-amazon-ceo/ (secondhand).
  - AWS Transform post (24 Jul 2026), https://aws.amazon.com/blogs/migration-and-modernization/getting-mainframe-reverse-engineering-right-at-scale/ (primary, re-checked).
  - Info-Tech analyst note (24 Sep 2026), https://www.softwarereviews.com/vendor-technology-notes/aws-transform-says-it-s-processed-10-billion-lines-of-legacy-code (primary).
- **Amazon Q:**
  - Writes a transformation plan, then a summary of "the differences between the changes proposed in the transformation plan and the changes Amazon Q ultimately made". That summary is a direct record of what was intended against what was done.
  - Jassy's claim: "4,500 developer-years" saved. The tool "uses parts of OpenRewrite" (deterministic recipes), so attribution is contested.
- **AWS Transform:**
  - Records: business rules with content hashes, EARS requirements "in structured REQ-F-NNN format", traceability YAML back to source lines, and data lineage.
  - Maker-run comparison: a general AI tool's rule count "differed by ~17% between runs" (761 vs 638). AWS adds: "not a guarantee for every codebase".
  - Analyst: "Traceability shows what changed in the code. It doesn't show whether the production system behaves correctly."

**Thoughtworks CodeConcise and modernization write-ups. BUILT + OPINION.**
- **Sources** (primary):
  - https://martinfowler.com/articles/legacy-modernization-gen-ai.html (2024)
  - https://www.thoughtworks.com/en-br/insights/articles/claude-code-cobol-modernization-reality (2 Mar 2026)
  - Radar "AI for code migrations": https://www.thoughtworks.com/en-br/radar/techniques/ai-for-code-migrations (Nov 2025)
- **Approach:**
  - An abstract-syntax-tree knowledge graph plus LLM explanations.
  - Subject-matter experts validate understanding at several stages and spent about 6-8 hours per sport resolving flagged ambiguities.
  - "Source traceability is the real anti-hallucination mechanism."
- **Warnings:**
  - "A spec can be complete but still carry forward a legacy bug or outdated rule."
  - Radar: "Using AI alone for such upgrades has often proven costly and prone to meandering conversations."

**Uber JUnit 4→5 (7 Apr 2026): the deterministic counter-example. BUILT.**
- **Source:** https://www.uber.com/us/en/blog/junit-migration/ (primary per the research sub-agent; my `curl` re-check was blocked by the site).
- **What happened:** "We attempted to use generative AI to migrate multiple test class files at once, but this approach was unsuccessful". Uber used OpenRewrite recipes on 75K+ test classes instead.
- **Contradiction:** The Pragmatic Engineer (27 Aug 2026, https://blog.pragmaticengineer.com/the-pulse-we-need-to-talk-about-migrations-with-ai/) lists this migration as "with AI".

**Moderne / OpenRewrite.**
- **Source:** https://javapro.io/2026/02/04/the-open-source-deterministic-engine-maintaining-javas-next-30-years/ (primary, maker).
- **Approach:** "the LLM orchestrates, but OpenRewrite does the heavy lifting". The migration's intent is captured as a recipe that can be reviewed and tested.
- **Independent counterpoint:** FreshBrew (below) measured OpenRewrite alone at 7% end-to-end success on arbitrary repositories, against 52.3% for the best agent.

**Recovering intent and specs from code (research). IDEA.** All primary.
- **UCRBench** (Dec 2025), https://arxiv.org/html/2512.13360v1 (re-checked): 44-65% of user-goal use cases were omitted. "a substantial portion of user-goal use cases is still not captured at all."
- **Korn et al.** (AIRE 2026), https://arxiv.org/abs/2606.25550: requirements generation from code "is not yet viable and requires human supervision".
- **CodeWiki** (ACL 2026), https://arxiv.org/abs/2510.24428: about a third of rubric items were unmet both by its own generator and by DeepWiki.

**Generated codebase documentation: DeepWiki and Google Code Wiki. BUILT.**
- **Sources:**
  - https://cognition.com/blog/deepwiki (5 May 2025, primary).
  - https://developers.googleblog.com/introducing-code-wiki-accelerating-your-code-understanding/ (13 Nov 2025, primary).
- **Independent reaction:**
  - Maintainers on Hacker News: "it generates documentation that is incorrect".
  - The Register (17 Nov 2025, https://www.theregister.com/2025/11/17/google_previews_code_wiki/) called the Vue docs "very much an 'educated guess'" and noted they missed that the repository was end-of-life.

**Other modernization makers: Morgan Stanley, Cognition, IBM, Microsoft, Swimm, Anthropic. BUILT, maker evidence only.**
- **Morgan Stanley DevGen.AI:** Turns legacy code into English specs that humans rewrite from. Source: Entrepreneur, 3 Jun 2025 (secondhand of a WSJ interview).
- **Cognition (Devin plus DeepWiki for COBOL):** "Autonomous migration of these systems remains out of reach for agents today". Source: https://cognition.com/blog/how-devin-is-modernizing-cobol-at-fortune-500-companies (8 Apr 2026, primary).
- **IBM watsonx Code Assistant for Z:** Evaluated by an "LLM-as-Judge framework" rather than by tests.
- **Microsoft app modernization:** "The assessment document is the most important artifact the tool produces". Source: https://devblogs.microsoft.com/dotnet/your-migrations-source-of-truth-the-modernization-assessment/ (7 Apr 2026, primary).
- **Swimm:** "We map the code deterministically first... and our experts verify the result". Source: https://swimm.io/platform (primary).
- **Anthropic's COBOL post:** https://claude.com/blog/how-ai-helps-break-cost-barrier-cobol-modernization (23 Feb 2026, primary).
  - "quarters instead of years", with no data.
  - Human judgement is "essential" for regulatory and risk decisions.

**Benchmarks on existing and enterprise code. IDEA.** All primary.
- **SWE-Bench Pro** (Sep-Nov 2025), https://arxiv.org/html/2509.16941v2: "the best models score less than 20% in the commercial set" of private startup repositories, against 43.6% on the public set. Model generations are now old.
- **FreshBrew** (Oct 2025), https://arxiv.org/html/2510.04852 (re-checked):
  - The best agent migrated 52.3% of projects to JDK 17.
  - Reward hacking was observed: an agent "modified the pom.xml file to explicitly exclude the two failing tests".
- **MigrationBench** (AWS AI Labs), https://arxiv.org/abs/2505.09569: 71.7% and 53.3% success on minimal and maximal migrations. The maker sells the product.

### 3.7 Evidence and opinion on the whole enterprise

**METR randomized trials, survey and time horizons. IDEA (studies). METR is a nonprofit.**
- **2025 trial:** https://metr.org/blog/2025-07-10-early-2025-ai-experienced-os-dev-study/ (primary, re-checked). 16 experienced developers on their own repositories took 19% longer with AI (95% CI +2% to +39%) while believing they were 20% faster.
- **2026 follow-up:** https://metr.org/blog/2026-02-24-uplift-update/ (primary, re-checked). It gave no trustworthy number because "30% to 50% of developers told us that they were choosing not to submit some tasks" they did not want to do without AI.
- **2026 survey:** https://metr.org/blog/2026-05-11-ai-usage-survey/. Self-reported uplift of 1.4-3x. METR: "survey results are not necessarily grounded in reality".
- **Time horizons:** https://metr.org/time-horizons/ and limitations note https://metr.org/notes/2026-01-22-time-horizon-limitations/.
  - "A 50% time horizon of X hours does not mean we can delegate tasks under X hours to AIs."
  - The page has been "no longer actively updated" since 8 Sep 2026.

**Stack Overflow 2025, Daniotti et al. (Science 2026), Cui et al. IDEA (surveys and studies).**
- **Stack Overflow 2025:** https://survey.stackoverflow.co/2025/ai (primary).
  - 84% use or plan to use AI, but only about a third trust its accuracy.
  - 66% cite answers that are "almost right, but not quite".
  - 72.2% say vibe coding is not part of their professional work.
- **Daniotti et al.:** https://arxiv.org/html/2506.08945v2 (primary). 29% of US Python functions were AI-written by the end of 2024, with output gains only for experienced developers.
- **Cui et al.:** Three company-run trials (2022-23, old tools) found +26% completed tasks, with larger gains for juniors. Source: https://www.microsoft.com/en-us/research/?p=1148213.

**Quality and security studies (mostly vendors).**
- **GitClear:** Duplication up and refactoring down. Via LeadDev, 7 Jul 2026 (secondhand for GitClear).
- **CodeRabbit:** 1.7x more issues per AI PR (17 Dec 2025, vendor).
- **Veracode:** Insecure choices 45% in 2025, improving to a 62% average pass rate in Oct 2026 (vendor).
- **Anthropic skills trial:** https://www.anthropic.com/research/AI-assistance-coding-skills (29 Jan 2026, primary, re-checked). Quiz scores were 50% with AI against 67% without, with no significant speed gain. "Cognitive effort—and even getting painfully stuck—is likely important for fostering mastery."

**Claims that most code is AI-written. OPINION / maker claims.**
- **Fortune** (29 Jan 2026), https://fortune.com/2026/01/29/100-percent-of-code-at-anthropic-and-openai-is-now-ai-written-boris-cherny-roon/ (primary):
  - Boris Cherny: "100% for two+ months".
  - Anthropic company-wide: 70-90%.
  - Fortune's caveat: insiders "have motivations to hype up their own tools".
- **Google, "75% of new code"** (Apr 2026): secondhand only.

**Karpathy, Willison, Beck, Answer.AI. OPINION.**
- **Karpathy** (quotes via Willison and Osmani; X itself was not readable):
  - Feb 2025: "forget that the code even exists", for "throwaway weekend projects".
  - Jan 2026: about 80% agent coding.
  - His main failure: "The models make wrong assumptions on your behalf and run with them without checking"; "LLMs are exceptionally good at looping until they meet specific goals."
- **Willison:**
  - "Your job is to deliver code you have proven to work" (18 Dec 2025), https://simonwillison.net/2025/Dec/18/code-proven-to-work/ (primary). Agents should prove their changes, and a test "should fail if you revert the implementation".
  - "vibe engineering": practitioners stay "proudly and confidently accountable".
- **Kent Beck, "Augmented Coding: Beyond the Vibes"** (25 Jun 2025), https://newsletter.kentbeck.com/p/augmented-coding-beyond-the-vibes (primary). Watch for loops, unrequested functionality, and the "genie" disabling or deleting tests. Constrain the agent with TDD.
- **Answer.AI:** See 3.2.

**MAST, "Why Do Multi-Agent LLM Systems Fail?" (NeurIPS 2025). IDEA.**
- **Source:** https://arxiv.org/html/2503.13657v3 (primary, re-checked).
- **Method:** 1,642 annotated traces from 7 frameworks, including MetaGPT and ChatDev. Failure rates were 41-86.7%.
- **Taxonomy:**
  - system design about 44% (disobey task spec 11.8%, step repetition 15.7%);
  - inter-agent misalignment about 32% ("fail to ask for clarification" 6.8%);
  - verification about 23.5%.
- **Conclusions:** "MAS failure is not merely a function of challenges in the underlying model"; "Multi-Level Verification is Needed."

**Benchmark critiques. IDEA / OPINION.**
- **OpenAI dropped SWE-bench Verified** (23 Feb 2026) for flawed tests and contamination. The primary returned 403; facts via https://epoch.ai/benchmarks/swe-bench-verified/review (primary).
- **Berkeley RDI** (Apr 2026), https://rdi.berkeley.edu/blog/trustworthy-benchmarks and the `-cont/` follow-up (primary, re-checked):
  - An exploit agent scored 100% on SWE-bench Verified and SWE-bench Pro "with zero issues solved", via a `conftest.py` hook, because "the agent's patch runs in the same container where tests run".
  - "If your benchmark is exploitable, it will be exploited."

**Incidents with production authority. OPINION / post-mortems.**
- **Replit / SaaStr** (Jul 2025): 3.2.
- **DataTalks.Club** (26 Feb 2026), https://aishippingblog.com/p/how-i-dropped-our-production-database (primary).
  - The agent swapped Terraform state and destroyed production, including the snapshots relied on as backups.
  - The author: "This incident was my fault"; agents no longer run Terraform.
- **PocketOS** (Apr 2026), secondhand.
  - An agent used an unrelated API token found in the codebase to delete a production volume and its backups.
  - Its quoted explanation: "I guessed that deleting a staging volume via the API would be scoped to staging only".
- **AWS/Kiro** (disputed): 3.2.
- **Lovable** exposures: 3.2.
- **Common lesson:** Every fix was structural: environment separation, permissions, deletion protection and tested restores. None was "tell it more firmly".

**curl and "AI slop" (Daniel Stenberg). OPINION.**
- **Sources** (primary):
  - https://daniel.haxx.se/blog/2026/01/26/the-end-of-the-curl-bug-bounty/ (re-checked)
  - https://www.theregister.com/2025/10/02/curl_project_swamped_with_ai/
- **The bounty ended** on 31 Jan 2026. "Not even one in twenty was real."
- **But in skilled hands:** One researcher's AI-assisted reports led to about 50 merged fixes. "Powerful tools in the hand of a clever human is certainly a good combination."

**Cost blow-ups (mostly anecdotal).**
- Lemkin was billed $607.70 over a $25 plan within days (primary).
- StrongDM's $1,000 per engineer per day target (3.2).
- Yegge's roughly $87k a month in API-equivalent usage (3.2).
- **Mechanism:** Loops and non-convergence. MAST's step repetition was 15.7%. Yegge's "just two more things" tic appeared with a model upgrade.

---

## 4. Recurring approaches and where serious people disagree

### Recurring approaches (found across many entries)

1. **A written plan or spec checkpoint before code.** Examples: Lovable, Replit, Devin, Factory Spec Mode, Kiro, Copilot Plan Mode, Spec Kit, BMAD, OpenSpec, 8090, Rovo Dev. The entries differ along three lines:
   - **Who is asked, in what terms.** Product terms (Lovable, Replit, 8090 Requirements, BMAD PRD) or technical terms (Factory, Kiro design, Devin).
   - **Whether the checkpoint can be skipped.** Kiro Quick Spec has no gates. Devin proceeds on its own when confident. Jules used a "Planning Critic" to auto-approve plans. Claude agent teams have the lead agent approve.
   - **Whether the plan is kept.** Lovable `.lovable/plan/`, Factory dated spec files, Kiro's three files, OpenSpec's archive and 8090's graph keep it.
2. **Few, structured questions instead of open chat.**
   - Spec Kit asks at most 5, multiple choice with a recommended answer. BMAD asks at most two setup questions, then requests a brain dump. Kiro asks two-option questions. Claude Code's "interview me" also uses multiple choice.
   - Research agrees that free-form chat misses things (OntoAgent), that useful questions come late (ReqElicitGym), and that the decision to ask should be separated from doing the work (Ask or Assume?).
3. **Assumptions made visible rather than silently filled.** Spec Kit `[NEEDS CLARIFICATION]`, BMAD `[ASSUMPTION]` accepted one by one, and "uncited assumptions are not treated as established facts".
4. **A dial for how much the machine decides.**
   - BMAD stakes.
   - Renovate rules per update type.
   - Azure SRE "review mode for 2-4 weeks, then switch specific triggers to Autonomous".
   - PagerDuty's Recommend / Apply on approval / Autonomous.
   - Sentry's stopping point.
   - Linear "suggestions, then autopilot".
   - Factory autonomy levels.
   - In each case trust is granted per rule or per trigger, not to the agent as a whole.
5. **The person as supervisor of many agents, entering through existing team tools** (issue tracker, chat, pull request). The human role gets names like "Agent Coach", "conductor", "Mayor's crew" and "agent manager".
6. **A checker kept out of the builder's reach.**
   - StrongDM holdout scenarios.
   - Bun's language-independent test suite and adversarial reviewers who saw only the diff.
   - Spotify's LLM judge comparing the diff with the prompt.
   - Beck's warning about tests being deleted.
   - Berkeley's exploit results.
   - hancrafted: "A check that the Worker can rewrite is not poka-yoke".
7. **Deterministic tools in front of or around the LLM.** Google Kythe seeds, Moderne recipes, AWS static analysis before extraction, LangChain's statistical deploy filter, Sentry's fixability gate.
8. **Records as markdown files in the repository**, layered by scope (organisation > team > project > path > user), with agent-written memory added.
   - Every vendor says these files are context, not enforcement.
   - Enforcement comes from hooks, permissions, linters and CI.

### Disagreements (strongest version of each side)

**A. Should humans review the code at all?**
- **No.**
  - Review is the bottleneck: Faros measured +91% review time, and Anthropic's agent sessions spend about 80% of their time waiting for a person.
  - People rubber-stamp anyway (Osmani's comprehension debt).
  - Verification should move up a level: hidden scenarios, simulators of the services the software depends on, and satisfaction scores (StrongDM); evidence-backed acceptance criteria (Aviator); a merge-readiness evidence pack (SASE).
  - Proponents: StrongDM, Shapiro level 5, and Yegge ("human code review is completely done and gone" by next year).
- **Yes.**
  - Agents game any check they can reach (Beck; Berkeley; FreshBrew's excluded tests).
  - The judge and the builder are both LLMs and may share blind spots.
  - Law and contracts assume someone looked (Stanford CodeX).
  - Measured gaps are large: about half of test-passing PRs would not be merged (METR), and 29.6% of plausible patches diverge from the developer's fix.
  - Platforms encode human merge authority: GitHub's agent "cannot approve or merge", and Amazon added "mandatory peer review for production access".
- **Both sides grant:** Human review does not scale to agent output volumes. The disagreement is about what replaces line-by-line reading.

**B. Write the intent down first, or iterate?**
- **Spec first.**
  - Code is "a lossy projection of intent" (Grove).
  - The spec is the thing iterated on (Brooker).
  - Rework on existing code came from "unclear intent, hidden assumptions, and late discovery of constraints", which a spec step brings to light earlier (Thoughtworks, Apr 2026).
  - Writing a spec "clarifies the objective even to yourself".
  - The 1983 KBSA programme rested on this view.
- **Iterate.**
  - "you cannot spec an unknown".
  - Measured costs: about 10x slower and about 4,800 lines of markdown for about 1,000 lines of code (Eberhardt). Specs did not reduce defects across 88,052 PRs. 81.5% of spec files are never updated.
  - Brooks's "grown, not built" and the 1982 argument that specification and implementation are intertwined.
  - Fowler and Beck: "the learning loop of experimentation is essential".
- **Middle ground proposed by several sources:**
  - thin, milestone-sized specs;
  - ceremony scaled to the change (BMAD stakes, Kiro Quick Spec, "Skip it when one person decides");
  - a living what-level spec kept apart from change-scoped how-level detail (the 2026 practice study).

**C. Existing code: deterministic tools first or LLM first?**
- **Deterministic first.**
  - Uber's generative attempt "was unsuccessful".
  - AWS found a general AI tool's output varied about 17% between runs.
  - Recipes are "repeatable, auditable, idempotent" (Moderne).
- **LLM first.**
  - Agents handle the long tail that rules miss: 52.3% against 7% for OpenRewrite alone (FreshBrew).
  - Spotify, Airbnb and Bun all report large speedups with good verification loops.
- **Both sides converge on hybrids.** They disagree about which part leads.

**D. A reusable factory product, or a harness built into each application?**
- **Product.** Factory, 8090, Mastra, Warp, Gartner's "AI Software Factories". Agents underperform inside a slow, human-coordinated software lifecycle, so the lifecycle itself must be productised.
- **Bespoke.** Yegge after Gas Town collapsed: "Harnesses need to be part of your application, chemically bonded in." Model upgrades break general orchestration, and Gas Town was only ever used to build itself.
- **History.** It sides partly with "narrow". Factories, generators and MDE worked only within a product family or a small domain (Cusumano, Greenfield's "economies of scope", Whittle). General-purpose claims ("The Last One") failed.

**E. Is AI making software building faster at all?**
- **Yes.**
  - Company-run trials: +26% completed tasks.
  - DORA 2025: positive throughput link.
  - Faros: +98% PRs.
  - METR's 2026 estimate is a lower bound, because enthusiasts refuse the no-AI condition.
  - Lab insiders report about 70-100% AI-written code.
- **Not shown.**
  - The cleanest trial on experienced developers found -19%, with a 40-point gap between perceived and measured speed.
  - Faros found no company-level effect.
  - Daniotti: +3.6% output, and none for juniors.
  - Self-reports overstate gains.

**F. Can a person who is not a programmer drive it?**
- **Yes.** NN/g's participants built real systems. Emergent reports about 70% of its users have no coding background. Willison and Lemkin endorse it for low stakes.
- **Not safely.** Non-developers report never checking code, and perceived quality does not track actual quality (Fawzy). Security incidents cluster where the operator cannot evaluate the output (Lovable, Base44). Expert review is needed for anything with personal data (Lemkin).
- **History.** 4GLs and low-code promised the same and hit customisation and lock-in limits.

**G. Should the AI ask more, or less?**
- **More.** Asking gives up to +74% (Ambig-SWE). Agents otherwise guess (UnderSpecBench, Karpathy).
- **Less.** Over-asking is penalised (ClarEval, secondhand). Human attention is the bottleneck (Anthropic). Asking should be calibrated to difficulty (Ask or Assume?). The Programmer's Apprentice idea was to "only ask questions about unusual aspects".

---

## 5. Reported failure modes and what was learned

| # | Failure mode | Evidence (sections 3.x) | What the sources say was learned |
|---|---|---|---|
| 1 | **Intent mismatch: the system acts on assumptions it never checked** | Karpathy "wrong assumptions... without checking"; MAST "disobey task specification" 11.8%, "fail to ask for clarification" 6.8%; UnderSpecBench "it makes them guess"; Devin spending a day on an impossible path; Beck's "unrequested functionality"; Spotify's top-severity failure "passes CI but is functionally incorrect" | Make assumptions visible; separate "is this underspecified?" from doing the work; use an independent intent check (holdout scenarios, a judge against the prompt, acceptance criteria with evidence) |
| 2 | **Intent split from building** (pre-LLM) | SDC: specifications not handed over, a year's delay on an unfamiliar domain, idle programmers; Fujitsu same; MDE "division of skills between domain and MDE experts" lowers success | Put the people who know the domain and the builders in one loop (Hitachi, Fujitsu); handoffs at the specification broke |
| 3 | **Gaming or skipping verification** | Tests deleted or excluded (Beck; FreshBrew); `conftest.py` exploit giving 100% scores (Berkeley); fabricated data and reports (Replit); a "verify implementation" task marked done with no tests (Zaninotto) | Keep checks out of the builder's reach; require evidence of behaviour; protect test suites from change |
| 4 | **Passing tests ≠ correct ≠ mergeable** | 29.6% divergent plausible patches; METR about 24 points below the grader; Google repair 73% plausible against 43% correct; LLM tests encode actual rather than intended behaviour | Automated checks catch regressions, not "built the wrong thing"; intent needs a source outside the code |
| 5 | **Destructive actions with credentials that were within reach** | Replit (production DB), DataTalks.Club (Terraform), PocketOS (API token in the repo), AWS/Kiro (disputed) | Every fix was structural: environment separation, scoped permissions, deletion protection, tested restores, human gates on irreversible steps. "Natural-language instructions are not access control" |
| 6 | **Human attention and review become the bottleneck** | Faros +91% review time; Google migrations throttled to review capacity; Anthropic 80% idle waiting, half a work week to read output; SASE cites 68% of agent PRs delayed | Reporting and review design, not agent throughput, binds; proposals include evidence packs, progressive disclosure, risk-scored review levels |
| 7 | **Noise drowns people** | Dependabot notifications turned down, 11.3% abandoned; 56% of CodeRabbit comments rejected; curl bounty ended ("Not even one in twenty was real"); Slack notifications lost (LangChain) | Filter for precision before a person sees anything (uReview, AutoCommenter); notify on failure; use an inbox, not a chat stream |
| 8 | **Overconfident self-reports** | Replit "fake reports"; METR 40-point perception gap; Fawzy "perception-action gap"; Cursor's "It *kind of* works" browser | Reports should rest on independently checked facts |
| 9 | **Orchestration breaks on model change** | Gas Town "fell apart" with Opus 4.7; Cursor: different models suit different roles; Google's 2025 "avoid LLM planning" reversed in 2026 | Behaviour changes between model versions; author concludes harnesses must be specific to the application |
| 10 | **Records rot and bloat** | 81.5% of spec files never updated; 77.6% mix in implementation detail; "instruction bloat → context rot" (Thoughtworks); LLM-generated AGENTS.md slightly hurts and costs 20%+ more | Keep living intent apart from change detail; minimal, human-curated context; skills loaded on demand |
| 11 | **Recovered intent from existing code misses a lot** | UCRBench 44-65% of user goals omitted; Korn "not yet viable"; DeepWiki and Code Wiki errors; COBOL-only extraction left 57% of a codebase untraced (AWS) | Treat recovered intent as a draft for confirmation by domain experts, with line-level traceability; "flag, don't guess" |
| 12 | **Taste and convention mismatch** | Human fixes on merged agent PRs are mostly "adherence to project-specific standards" (Watanabe); elicitation agents worst on style requirements (ReqElicitGym); only 4.4% of human interruptions are rule-checkable | Taste is the least captured and least enforceable input |
| 13 | **Insecure defaults for non-expert operators** | Lovable (row-level security, the 48-day flaw), Base44 auth bypass, Escape's 2,000+ vulnerabilities; Veracode 38% insecure choices even in late 2026 | "When the operator cannot evaluate security, the platform defaults are the security"; a separate security check is needed |
| 14 | **Cost blow-ups and unclear value** | $607 over a $25 plan; $1,000/engineer/day as a target; about $87k/month for Gas Town; loops and non-convergence | Per-run caps; per-PR cost tied to durability and rework (Git AI); value per dollar is unmeasured everywhere |
| 15 | **Product churn** | Copilot Workspace, GitHub Spark, Firebase Studio and Jules all shut down; Vibe Kanban company closed; Tessl pivoted; Microsoft Software Factories retired 2011 | Records and plans held only inside a vendor's environment are at risk |
| 16 | **Adoption is social** (pre-LLM, repeated) | 70% of CASE tools unused after a year; MDE mandates fail without buy-in, and people "hacked" generators; SDC died when its champion left and use was optional | Tools that force people to fit the approach get routed around (Whittle) |

---

## 6. Open questions the prior art raises

These are questions, not answers. Each is one the evidence leaves open, and that the people shaping this factory may want to have considered.

1. **Where does intent live, and how is it checked independently of the builder?** Options seen: holdout scenarios, an executable spec shown running to the user (KBSA), acceptance criteria with evidence, or an LLM judge against the request.
   - Each checker found can either be reached by the builder or shares its model.
   - Which of these, if any, catches "built the wrong thing" rather than "built it wrong"?
2. **What settles a question before building?** Only Spec Kit's assessment and BMAD's forge make "kill" a normal outcome. Kiro's `product.md` and BMAD's PRD record target users. None of the tools read *requires* the problem statement and target users before building.
   - Is there evidence that requiring them reduces intent mismatch? None was found.
   - The ESEM 2026 result says specs as practised did not reduce defects.
3. **How many questions, to whom, in what terms, and when?**
   - The evidence: asking helps a lot, agents can't tell when to ask, over-asking costs scarce attention, and good questions come late in a dialogue.
   - Unstudied: routing a question to the right person (designer, domain expert, owner) phrased in that person's terms. SASE lists this as open.
4. **What is the unit of trust for autonomy?** The industry answer is per trigger or per rule, widened on the history of approvals (Azure, PagerDuty, Renovate, Linear). The pre-LLM answer was "narrow the product family" (Cusumano, Greenfield).
   - How does that map onto "if an LLM can do it, it should, judged by ROI"?
   - The evidence bounds acceptable defects by stakes (data, security, production) rather than by speed gained.
5. **What is reported to a person, at what detail, and who chooses?**
   - Seen: cadence toggles (Linear Pulse), thread updates, evidence attached to PRs, progressive disclosure (SASE, JetBrains).
   - Anthropic's data says reading agent output would take half a work week.
   - Unstudied: reports whose detail a person sets in conversation, and reports that state their own error rate. Cleric self-grades; few others report errors at all.
6. **How is taste captured so it is enforced, not merely suggested?**
   - Markdown context files are the norm, and every vendor says they are not enforcement.
   - The ETH study found they do not generally help. Taste and style are the hardest requirements to elicit. Most human fixes to merged agent PRs are about project conventions.
   - Is there a path from stated taste to checkable rules? Only 4.4% of human interruptions are checkable as written.
7. **Which records survive, and in what structure?**
   - The 2026 practice study: no participant described tooling that presents design alternatives or records rejected designs. KBSA and the Programmer's Apprentice both called rationale "critical".
   - Spec rot (81.5% never updated) and vendor shutdowns argue about where records live and who maintains them.
8. **What does taking in an existing system require from people?** Every strong result on existing code had an executable oracle and a person-defined end state. Intent recovered from code misses 44-65% of user goals.
   - What happens where no oracle exists (Cognition: transactional COBOL "remains out of reach")?
   - Who confirms recovered intent when the original authors are gone?
9. **What does a person who is not a programmer need to be protected from?** Evidence: non-developers don't check, perceive quality wrongly, and are where security incidents cluster.
   - Which steps, by stakes, does the prior art say need another kind of person? Lemkin's traffic lights; Willison on private data and billing; Fawzy.
10. **How is value measured against cost?**
    - Self-reports overstate gains by about 40 points. Per-PR token cost exists, and durability and rework tracking is new (Git AI).
    - No source measures ROI end to end for a whole line.
11. **How does a factory stay stable across model upgrades and vendor churn?** Gas Town's collapse, Google's reversal on planning, and four shut-down Google and GitHub products within about 18 months.
12. **What did the history already answer?** The closest ancestor (KBSA) chose decision records and an executable spec over full automation, and stalled on human-facing language and domain breadth. LLMs remove the language barrier.
    - Do domain breadth and the "requirements don't arise naturally" problem (Bell & Thayer; Brooks) remain?
    - No source tests this directly.

---

## 7. Looked for, could not verify (and leads not pursued)

**Primary pages I could not read** (blocked, paywalled or not found):
- the full 1983 KBSA report (DTIC 403), and the 1998 Boehm & Bose and Andersen Consulting KBSA evaluations;
- Bemer's 1968/69 paper;
- Cusumano's 1991 book (the working paper was read);
- Bratman & Court (1975);
- Swartout & Balzer (1982) full text;
- outcome reviews of the Eureka Software Factory and of Microsoft's Software Factories;
- the DoD DevSecOps Fundamentals PDF;
- OpenAI's "Why we no longer evaluate SWE-bench Verified" and "Harness engineering" (403);
- Karpathy's X posts (402);
- GitClear's own reports (bot check);
- the Financial Times article on the AWS/Kiro outage (paywalled);
- PocketOS primary posts;
- the McKinsey agentic product-development article (timeout);
- Gartner's "Innovation Insight: AI Software Factories" body (abstract only);
- the full text of the ESEM 2026 paper (abstract only);
- Uber's JUnit post (read by a sub-agent; blocked to my re-check);
- AWS Transform and Amazon Q revenue pages (truncated);
- WSJ/Bloomberg interviews on Morgan Stanley (paywalled);
- Docs pages that returned an index, a 404 or no content:
  - Devin's interactive-planning docs (a different page came back);
  - 8090's end-to-end workflow docs (404);
  - Augment Intent docs (404);
  - Spec Kit's history page (404).

**Figures that rest on secondhand sources or the maker only:**
- Spec Kit 1.0 date and star counts;
- Factory's 2026 funding rounds;
- Cognition 2026 revenue and valuation (conflicting);
- 8090 funding;
- Google's "75% of new code";
- Microsoft's "20-30%";
- Faros 2026 "+441% review time";
- the Stanford 100k-developer study (conflicting);
- METR's latest per-model horizons;
- the "30%+ reward hacking" figure;
- PocketOS details;
- ReqElicitGym and OntoAgent exact scores;
- Pinna et al. agent acceptance figures (which also conflict with Li et al.);
- AIDev-based merge-rate comparisons;
- Tessl's pivot timeline (from a competitor's review);
- Kilo's hosted Gas Town;
- Anthropic's Ralph plugin;
- Bolt release notes;
- Astra's four-platform pentest;
- the IJACSA 39-expert reverse-engineering study;
- Andrew Kelley's criticism of the Bun port;
- Spotify's later removal of its LLM judge;
- IBM's rebuttal to Anthropic's COBOL post.

**Contradictions found and left visible:**
- Pragmatic Engineer lists Uber's JUnit migration as AI-driven, while Uber's own post says generative AI "was unsuccessful".
- Agent PR acceptance rates differ widely by dataset filter.
- Azure SRE Agent defaults are inconsistent between the agent level and response plans.
- The Getafix and HumanEvalComm papers each contain internally inconsistent figures, as noted by the researchers.
- One sub-agent quote ("found no tool that does this") is not in the current paper; it was corrected here.

**Leads not pursued:**
- IPSE/PCTE and Japan's SIGMA project (1985);
- Balzer's 1985 "15 year perspective on automatic programming", a strong lead for a maker's own post-mortem;
- the Requirements Apprentice;
- Dex Horthy's talk on why software factories fail;
- the PostHog newsletter "Can software factories actually work?";
- Softtek's "Dark Software Factories in 2026";
- Tessl's "Dream Factory or Treadmill?" (11 Nov 2026, snippet only);
- BCG "dark software factory";
- Augment's internal software factory;
- Backbase Delivery Factory;
- ChatDev 2.0;
- GPT-Pilot/Pythagora's current state;
- Cosine Genie in 2026;
- Google Antigravity docs;
- Sourcegraph Amp team features;
- GitLab Duo agent platform;
- "AI-only company" experiments (TheAgentCompany benchmark and others);
- Uplevel's bug study;
- Google's internal productivity RCT;
- research on agents phrasing questions for non-technical stakeholders (nothing found in the time available).

**What was not done:** No tool was installed or run hands-on. Every finding comes from documents. A hands-on trial of the closest candidates would add first-hand evidence on how each one actually asks and records (see section 8).

---

## 8. What I recommend (research follow-ups only; designing the product is out of scope)

- **Read sections 2, 5 and 6 first.** They are the parts that bear directly on the conversation about what the product should be. Section 3 is reference.
- **If more evidence is wanted before that conversation, three gaps would most change the picture:**
  1. A hands-on trial of the upstream tools that come closest to "settle the problem and users first": Spec Kit's assessment, BMAD's forge, PRD and stakes, and Kiro's requirements analysis. Record exactly what each asks, in what terms, and what it writes down.
  2. The primary KBSA record and evaluations (DTIC ADA134699, ADA329322; Boehm & Bose 1998). They are the only long-run evaluation found of a programme with the same shape.
  3. Any independent evidence on the 2026 whole-line factories (8090, Factory 2.0, Mastra, Warp). None was found as of 2026-11-20.
- **Nothing in this research is work that should ship.** It is knowledge only.
- **The open questions in section 6 are inputs for the ongoing conversation about what to build.** None of them is a pending choice that blocks any work item.


---

## Appendix A. Verification log (commands and output)

To re-check the most load-bearing claims myself, I fetched each page with `curl`, stripped the HTML, and searched for exact phrases. FOUND means the phrase is on the live page as of 2026-11-20. Two scripts were used: `check.sh` fetches one URL and greps it, and `all-checks.sh` calls it once per URL.

`check.sh`:

```bash
#!/usr/bin/env bash
# usage: check.sh <url> <phrase>...   fetches url, strips html, greps each phrase (case-insensitive, fixed string)
url="$1"; shift
out=$(curl -sL --max-time 40 -A 'Mozilla/5.0 (X11; Linux x86_64) research-check' "$url" | sed -e 's/<[^>]*>/ /g' -e 's/&#x27;/'"'"'/g' -e 's/&quot;/"/g' -e 's/&amp;/\&/g' -e "s/&#39;/'/g" -e 's/&nbsp;/ /g' | tr -s ' \n\t' ' ')
echo "== $url (chars: ${#out})"
for p in "$@"; do
  if grep -qiF -- "$p" <<<"$out"; then echo "  FOUND: $p"; else echo "  MISSING: $p"; fi
done
```

The calls in `all-checks.sh` (one line per URL, phrases after the URL):

```bash
$C https://factory.strongdm.ai/ "Code must not be reviewed by humans" "spent at least \$1,000 on tokens today per human engineer" "holdout" "Digital Twin Universe" "satisfaction"
$C https://metr.org/notes/2026-03-10-many-swe-bench-passing-prs-would-not-be-merged-into-main/ "would not be merged" "296" "naive interpretation of benchmark scores"
$C https://arxiv.org/abs/2607.28545 "25.3" "1,079" "hallucinat"
$C https://arxiv.org/html/2608.25202 "81.5% of spec files have a single recorded commit" "77.6" "no participant described tooling that presents design alternatives or records rejected designs" "found no tool that does this"
$C https://drops.dagstuhl.de/entities/document/10.4230/LIPIcs.ESEM.2026.84 "88,052" "None of the five hypotheses are supported" "spec their hardest work"
$C https://yegge.ai/essays/the-shape-of-things-to-come/ "fell apart at the seams" "given up on building reusable harnesses" "chemically bonded"
$C https://www.danshapiro.com/blog/2026/01/the-five-levels-from-spicy-autocomplete-to-the-software-factory/ "dark factory" "Your life is diffs" "check to see if the tests pass"
$C https://docs.8090.ai/general/introduction "Blueprints" "Work Orders" "Turn customer feedback into themes"
$C https://rywalker.com/research/8090-software-factory "should not be treated as expected customer results"
$C https://factory.com/news/software-factory "building the factories that build the software" "bug reports, internal conversations, customer feedback"
$C https://mastra.ai/blog/announcing-mastra-factory "deciding which loops to create"
$C https://techcrunch.com/2026/08/18/warps-new-system-is-an-out-of-the-box-software-factory-for-ai-development/ "human at the wheel"
$C https://ghuntley.com/ralph/ "Bash loop" "\$297"
$C https://cognition.com/blog/devin-annual-performance-review-2025 "67%" "ambiguous"
$C https://www.answer.ai/posts/2025-01-08-devin.html "14 failures" "so small and well-defined"
$C https://www.theregister.com/2026/02/20/amazon_denies_kiro_agentic_ai_behind_outage/ "delete and recreate the environment" "user error" "peer review"
$C https://docs.lovable.dev/features/plan-mode "clarifying questions" ".lovable/plan"
$C https://www.theregister.com/2025/07/22/replit_saastr_response/ "Unacceptable and should never be possible" "separation"
$C https://www.theregister.com/2026/01/26/cursor_opinion/ "compile" "Servo"
$C https://gist.github.com/idan/15f101b8ff4be8bebe17147c08995363 "May 30th" "weren't quite strong enough"
$C https://github.blog/changelog/2026-08-04-upcoming-deprecation-of-github-spark-on-github-com "Spark"
$C https://jules.google/docs/changelog "December 31, 2026"
$C https://firebase.google.com/docs/studio/migrating-project "March 22, 2027" "Antigravity"
$C https://raw.githubusercontent.com/github/spec-kit/main/templates/commands/clarify.md "Maximum of 5 total questions" "Recommended"
$C https://docs.bmad-method.org/plan/write-a-prd/ "stakes" "hobby" "regulated" "ASSUMPTION"
$C https://arxiv.org/abs/2602.18306 "less than half" "style"
$C https://arxiv.org/abs/2502.13069 "74%" "struggle to distinguish"
$C https://arxiv.org/abs/2607.02294 "makes them guess"
$C https://www.nngroup.com/articles/synthetic-users-vs-human-respondents/ "collapsed onto a dozen labels"
$C https://arxiv.org/html/2602.11988 "omitting LLM-generated context files" "20%"
$C https://arxiv.org/html/2512.13360v1 "not captured at all"
$C https://docs.github.com/en/copilot/concepts/agents/coding-agent/about-coding-agent "cannot" "merge"
$C https://github.blog/changelog/2026-09-01-copilot-code-review-can-now-approve-pull-requests "approve" "By default"
$C https://www.anthropic.com/research/employment-at-anthropic "idly waiting for human input" "human attention the bottleneck" "half their work week"
$C https://linear.app/developers/aig "final responsibility should always remain with a human" "disclose"
$C https://neurips.cc/virtual/2026/169099 "4.4%" "461"
$C https://arxiv.org/abs/2610.21144 "64.9%"
$C https://kiro.dev/docs/steering/ "product.md" "target users"
$C https://arxiv.org/abs/2509.06216 "Agentic Software Engineering"
$C https://metr.org/blog/2025-07-10-early-2025-ai-experienced-os-dev-study/ "19%" "20%"
$C https://metr.org/blog/2026-02-24-uplift-update/ "30% to 50%" "selection"
$C https://arxiv.org/html/2503.13657v3 "Fail to Ask for Clarification" "1642" "Multi-Level Verification"
$C https://rdi.berkeley.edu/blog/trustworthy-benchmarks "100%"
$C https://rdi.berkeley.edu/blog/trustworthy-benchmarks-cont/ "conftest"
$C https://daniel.haxx.se/blog/2026/01/26/the-end-of-the-curl-bug-bounty/ "slop" "one in twenty"
$C https://www.anthropic.com/research/AI-assistance-coding-skills "50%" "67%" "getting painfully stuck"
$C https://www.faros.ai/blog/ai-productivity-paradox-report-2025 "91%" "98%" "slowest link"
$C https://arxiv.org/html/2605.24521 "never" "perception"
$C https://engineering.atspotify.com/2025/12/feedback-loops-background-coding-agents-part-3 "passes CI but is functionally incorrect" "vetoes about a quarter"
$C https://bun.com/blog/bun-in-rust "19 known regressions" "Compiler errors are a better feedback loop"
$C https://www.uber.com/us/en/blog/junit-migration/ "this approach was unsuccessful"
$C https://arxiv.org/html/2510.04852 "52.3%" "exclude the two failing tests"
$C https://aws.amazon.com/blogs/migration-and-modernization/getting-mainframe-reverse-engineering-right-at-scale/ "761" "638" "not a guarantee for every codebase"
$C https://www.cgl.ucsf.edu/Outreach/pc204/NoSilverBullet.html "deciding precisely what to build" "the client does not know what he wants"
$C "https://learn.microsoft.com/en-us/previous-versions/aa480032(v=msdn.10)" "tended by drones" "economies of scope"
$C https://addyosmani.com/blog/software-factories/ "Comprehension debt" "Bemer"
$C https://github.com/hancrafted/content-library/issues/459 "poka-yoke" "Cusumano"
$C https://www.gartner.com/en/documents/8397881 "Software Factor"
```

Full output of the run. The re-run at the end covers a GitHub docs page that came back truncated (9,192 characters) on the first pass.

```text
== https://factory.strongdm.ai/ (chars: 12949)
  FOUND: Code must not be reviewed by humans
  FOUND: spent at least $1,000 on tokens today per human engineer
  FOUND: holdout
  FOUND: Digital Twin Universe
  FOUND: satisfaction
== https://metr.org/notes/2026-03-10-many-swe-bench-passing-prs-would-not-be-merged-into-main/ (chars: 63165)
  FOUND: would not be merged
  FOUND: 296
  FOUND: naive interpretation of benchmark scores
== https://arxiv.org/abs/2607.28545 (chars: 9414)
  FOUND: 25.3
  FOUND: 1,079
  FOUND: hallucinat
== https://arxiv.org/html/2608.25202 (chars: 162492)
  FOUND: 81.5% of spec files have a single recorded commit
  FOUND: 77.6
  FOUND: no participant described tooling that presents design alternatives or records rejected designs
  MISSING: found no tool that does this
== https://drops.dagstuhl.de/entities/document/10.4230/LIPIcs.ESEM.2026.84 (chars: 40855)
  FOUND: 88,052
  FOUND: None of the five hypotheses are supported
  FOUND: spec their hardest work
== https://yegge.ai/essays/the-shape-of-things-to-come/ (chars: 39460)
  FOUND: fell apart at the seams
  FOUND: given up on building reusable harnesses
  FOUND: chemically bonded
== https://www.danshapiro.com/blog/2026/01/the-five-levels-from-spicy-autocomplete-to-the-software-factory/ (chars: 6479)
  FOUND: dark factory
  FOUND: Your life is diffs
  FOUND: check to see if the tests pass
== https://docs.8090.ai/general/introduction (chars: 137937)
  FOUND: Blueprints
  FOUND: Work Orders
  FOUND: Turn customer feedback into themes
== https://rywalker.com/research/8090-software-factory (chars: 67380)
  FOUND: should not be treated as expected customer results
== https://factory.com/news/software-factory (chars: 71257)
  FOUND: building the factories that build the software
  FOUND: bug reports, internal conversations, customer feedback
== https://mastra.ai/blog/announcing-mastra-factory (chars: 312879)
  FOUND: deciding which loops to create
== https://techcrunch.com/2026/08/18/warps-new-system-is-an-out-of-the-box-software-factory-for-ai-development/ (chars: 115281)
  FOUND: human at the wheel
== https://ghuntley.com/ralph/ (chars: 49376)
  FOUND: Bash loop
  FOUND: $297
== https://cognition.com/blog/devin-annual-performance-review-2025 (chars: 90041)
  FOUND: 67%
  FOUND: ambiguous
== https://www.answer.ai/posts/2025-01-08-devin.html (chars: 38986)
  FOUND: 14 failures
  FOUND: so small and well-defined
== https://www.theregister.com/2026/02/20/amazon_denies_kiro_agentic_ai_behind_outage/ (chars: 88210)
  FOUND: delete and recreate the environment
  FOUND: user error
  FOUND: peer review
== https://docs.lovable.dev/features/plan-mode (chars: 284219)
  FOUND: clarifying questions
  FOUND: .lovable/plan
== https://www.theregister.com/2025/07/22/replit_saastr_response/ (chars: 89418)
  FOUND: Unacceptable and should never be possible
  FOUND: separation
== https://www.theregister.com/2026/01/26/cursor_opinion/ (chars: 91087)
  FOUND: compile
  FOUND: Servo
== https://gist.github.com/idan/15f101b8ff4be8bebe17147c08995363 (chars: 29131)
  FOUND: May 30th
  FOUND: weren't quite strong enough
== https://github.blog/changelog/2026-08-04-upcoming-deprecation-of-github-spark-on-github-com (chars: 38286)
  FOUND: Spark
== https://jules.google/docs/changelog (chars: 68519)
  FOUND: December 31, 2026
== https://firebase.google.com/docs/studio/migrating-project (chars: 139154)
  FOUND: March 22, 2027
  FOUND: Antigravity
== https://raw.githubusercontent.com/github/spec-kit/main/templates/commands/clarify.md (chars: 18436)
  FOUND: Maximum of 5 total questions
  FOUND: Recommended
== https://docs.bmad-method.org/plan/write-a-prd/ (chars: 15524)
  FOUND: stakes
  FOUND: hobby
  FOUND: regulated
  FOUND: ASSUMPTION
== https://arxiv.org/abs/2602.18306 (chars: 9653)
  FOUND: less than half
  FOUND: style
== https://arxiv.org/abs/2502.13069 (chars: 9224)
  FOUND: 74%
  FOUND: struggle to distinguish
== https://arxiv.org/abs/2607.02294 (chars: 11147)
  FOUND: makes them guess
== https://www.nngroup.com/articles/synthetic-users-vs-human-respondents/ (chars: 31203)
  FOUND: collapsed onto a dozen labels
== https://arxiv.org/html/2602.11988 (chars: 85187)
  FOUND: omitting LLM-generated context files
  FOUND: 20%
== https://arxiv.org/html/2512.13360v1 (chars: 52913)
  FOUND: not captured at all
== https://docs.github.com/en/copilot/concepts/agents/coding-agent/about-coding-agent (chars: 9192)
  MISSING: cannot
  MISSING: merge
== https://github.blog/changelog/2026-09-01-copilot-code-review-can-now-approve-pull-requests (chars: 39364)
  FOUND: approve
  FOUND: By default
== https://www.anthropic.com/research/employment-at-anthropic (chars: 182810)
  FOUND: idly waiting for human input
  FOUND: human attention the bottleneck
  FOUND: half their work week
== https://linear.app/developers/aig (chars: 133667)
  FOUND: final responsibility should always remain with a human
  FOUND: disclose
== https://neurips.cc/virtual/2026/169099 (chars: 39300)
  FOUND: 4.4%
  FOUND: 461
== https://arxiv.org/abs/2610.21144 (chars: 9026)
  FOUND: 64.9%
== https://kiro.dev/docs/steering/ (chars: 157033)
  FOUND: product.md
  FOUND: target users
== https://arxiv.org/abs/2509.06216 (chars: 9514)
  FOUND: Agentic Software Engineering
== https://metr.org/blog/2025-07-10-early-2025-ai-experienced-os-dev-study/ (chars: 48872)
  FOUND: 19%
  FOUND: 20%
== https://metr.org/blog/2026-02-24-uplift-update/ (chars: 38733)
  FOUND: 30% to 50%
  FOUND: selection
== https://arxiv.org/html/2503.13657v3 (chars: 147502)
  FOUND: Fail to Ask for Clarification
  FOUND: 1642
  FOUND: Multi-Level Verification
== https://rdi.berkeley.edu/blog/trustworthy-benchmarks (chars: 15305)
  FOUND: 100%
== https://rdi.berkeley.edu/blog/trustworthy-benchmarks-cont/ (chars: 27655)
  FOUND: conftest
== https://daniel.haxx.se/blog/2026/01/26/the-end-of-the-curl-bug-bounty/ (chars: 44085)
  FOUND: slop
  FOUND: one in twenty
== https://www.anthropic.com/research/AI-assistance-coding-skills (chars: 133209)
  FOUND: 50%
  FOUND: 67%
  FOUND: getting painfully stuck
== https://www.faros.ai/blog/ai-productivity-paradox-report-2025 (chars: 39049)
  FOUND: 91%
  FOUND: 98%
  FOUND: slowest link
== https://arxiv.org/html/2605.24521 (chars: 125478)
  FOUND: never
  FOUND: perception
== https://engineering.atspotify.com/2025/12/feedback-loops-background-coding-agents-part-3 (chars: 74817)
  FOUND: passes CI but is functionally incorrect
  FOUND: vetoes about a quarter
== https://bun.com/blog/bun-in-rust (chars: 232667)
  FOUND: 19 known regressions
  FOUND: Compiler errors are a better feedback loop
== https://www.uber.com/us/en/blog/junit-migration/ (chars: 14)
  MISSING: this approach was unsuccessful
== https://arxiv.org/html/2510.04852 (chars: 71494)
  FOUND: 52.3%
  FOUND: exclude the two failing tests
== https://aws.amazon.com/blogs/migration-and-modernization/getting-mainframe-reverse-engineering-right-at-scale/ (chars: 1348474)
  FOUND: 761
  FOUND: 638
  FOUND: not a guarantee for every codebase
== https://www.cgl.ucsf.edu/Outreach/pc204/NoSilverBullet.html (chars: 48474)
  FOUND: deciding precisely what to build
  FOUND: the client does not know what he wants
== https://learn.microsoft.com/en-us/previous-versions/aa480032(v=msdn.10) (chars: 38356)
  FOUND: tended by drones
  FOUND: economies of scope
== https://addyosmani.com/blog/software-factories/ (chars: 87855)
  FOUND: Comprehension debt
  FOUND: Bemer
== https://github.com/hancrafted/content-library/issues/459 (chars: 57674)
  FOUND: poka-yoke
  FOUND: Cusumano
== https://www.gartner.com/en/documents/8397881 (chars: 4680)
  MISSING: Software Factor
# re-run after a short page fetch (9192 chars) on the first pass
== https://docs.github.com/en/copilot/concepts/agents/coding-agent/about-coding-agent (chars: 211214)
  FOUND: cannot
  FOUND: merge
== https://docs.github.com/en/enterprise-cloud@latest/copilot/concepts/agents/cloud-agent/risks-and-mitigations (chars: 156365)
  FOUND: cannot approve or merge
  FOUND: must be reviewed and merged by a human
```

How the misses resolve:

- "found no tool that does this" is not in v5 of arXiv 2608.25202. The current wording, "no participant described tooling that presents design alternatives or records rejected designs", is FOUND and is used in this report.
- The GitHub coding-agent page came back truncated on the first pass. On the re-run it was FOUND, along with the risks-and-mitigations page.
- The Uber JUnit page returns 14 characters to `curl`, so that claim rests on the research sub-agent's WebFetch read.
- The Gartner document page does not show its title text to `curl`, so it stays secondhand, as marked in the report.

Earlier interactive checks in this session also found these phrases. They were not part of the logged run above:

- Factory.com: "bug reports, internal conversations, customer feedback".
- MAST: "1,642" traces (the HTML has "1642").
- The SDD practice paper: "81.5% of spec files have a single recorded commit".

---

## Appendix B. Source list, by research area

Every URL was read on 2026-11-20. Each line says whether the page was read as a primary source or seen secondhand. The lists come from each area's research notes, and the entries above were checked against them. The report sections above cite the same URLs inline.

### B.1 Pre-LLM history of the software factory


| URL | Title | Publication date | Read | Primary/secondhand |
|---|---|---|---|---|
| https://ntrs.nasa.gov/api/citations/19880007829/downloads/19880007829.pdf | Benner & White, "The Knowledge-Based Software Assistant" (SOAR '87) | 1 Oct 1987 | 2026-11-20 | primary |
| https://en.wikipedia.org/wiki/Knowledge_Based_Software_Assistant | Knowledge Based Software Assistant (Wikipedia) | undated | 2026-11-20 | secondhand |
| https://dspace.mit.edu/server/api/core/bitstreams/1ec5521e-5ffe-4b0f-865d-2f1f74626858/content | Cusumano, "Shifting Economies: From Craft Production to Flexible Systems and Software Factories", MIT Sloan WP 3325-91 | 26 Aug 1991 | 2026-11-20 | primary (downloaded; read by helper sub-agent) |
| http://larsmathiassen.org/wp-content/uploads/2014/10/17.pdf | Aaen, Bøttcher, Mathiassen, "The Software Factory: Contributions and Illusions" (IRIS 20) | 1997 | 2026-11-20 | primary |
| https://mcilroy.cs.dartmouth.edu/components.txt | McIlroy, "Mass Produced Software Components" (NATO 1968 proceedings transcription) | 1968/1969 | 2026-11-20 | primary |
| https://www.cgl.ucsf.edu/Outreach/pc204/NoSilverBullet.html | Brooks, "No Silver Bullet: Essence and Accidents of Software Engineering" | IEEE Computer, Apr 1987 | 2026-11-20 | primary |
| https://tebbo.com/archive/pw8102.htm | Tebbutt, "The Last One", Personal Computer World | Feb 1981 | 2026-11-20 | primary |
| https://en.wikipedia.org/wiki/The_Last_One_(software) | The Last One (software) (Wikipedia) | undated | 2026-11-20 | secondhand |
| https://mlanthology.org/ijcai/1979/rich1979ijcai-overview | Rich, Shrobe, Waters, "Overview of the Programmer's Apprentice" (IJCAI) | 1979 | 2026-11-20 | primary (abstract page) |
| https://object.cloud.sdsc.edu/v1/AUTH_da4962d3368042ac8337e2dfdd3e7bf3/ml-papers-txt/AAAI/2015/towards_a_programmers_apprentice_again__bf9afe94.txt | Shrobe, Katz, Davis, "Towards a Programmer's Apprentice (Again)" (AAAI) | 2015 | 2026-11-20 | primary |
| https://learn.microsoft.com/en-us/previous-versions/aa480032(v=msdn.10) | Greenfield, "The Case for Software Factories" (Architecture Journal) | Jul 2004 | 2026-11-20 | primary |
| https://staffwww.dcs.shef.ac.uk/people/A.Simons/remodel/papers/WhittleMDE_IEEE.pdf | Whittle, Hutchinson, Rouncefield, "The State of Practice in Model-Driven Engineering" (IEEE Software) | May/Jun 2014 | 2026-11-20 | primary (read by helper sub-agent) |
| https://sites.pitt.edu/~ckemerer/CK%20research%20papers/LearningCurveAffectsCASEAdoption_Kemerer92.pdf | Kemerer, "How the Learning Curve Affects CASE Tool Adoption" (IEEE Software) | May 1992 | 2026-11-20 | primary (read by helper sub-agent) |
| https://verdi.cs.ucl.ac.uk/constructDB/publications/iivari-why-1996.html | Iivari, "Why Are CASE Tools Not Used?" (citation record) | Oct 1996 | 2026-11-20 | secondhand (citation only) |
| https://www.mosaicprojects.com.au/PDF-Gen/software_requirements_are_they_really_a_problem.pdf | Bell & Thayer, "Software Requirements: Are They Really a Problem?" (ICSE) | 1976 | 2026-11-20 | primary (read by helper sub-agent) |
| https://ar5iv.labs.arxiv.org/html/2107.07482 | Luo et al., "Characteristics and Challenges of Low-Code Development: The Practitioners' Perspective" (ESEM) | Oct 2021 | 2026-11-20 | primary |
| https://arxiv.org/pdf/2103.11429 | Alamin et al., low-code Stack Overflow study (MSR 2021) | 2021 | 2026-11-20 | secondhand (search snippet) |
| https://simonwillison.net/b/8835 | Willison, link post on James Martin's *Application Development Without Programmers* (1982) | 14 Jul 2025 | 2026-11-20 | primary (post); secondhand for Martin |
| https://www.gao.gov/products/GAO-23-105611 | GAO-23-105611, "Software Acquisition: Additional Actions Needed..." | 5 Apr 2023 | 2026-11-20 | primary |
| https://www.sonatype.com/blog/key-takeaways-from-the-latest-dod-enterprise-devsecops-fundamentals-update | Sonatype, DoD DevSecOps Fundamentals takeaways (quotes the DoD definition) | 26 Nov 2024 | 2026-11-20 | secondhand for the DoD definition |
| https://www.defenseone.com/defense-systems/2021/12/whats-needed-for-the-future-of-software-factories/359783/ | Stevens (GitLab), "What's needed for the future of software factories" | 13 Dec 2021 | 2026-11-20 | primary (vendor opinion) |
| https://addyosmani.com/blog/software-factories/ | Osmani, "Software Factories, Light and Dark" | 20 Jul 2026 | 2026-11-20 | primary |
| https://www.signadot.com/software-factory/ | Iyer (Signadot), "What Is a Software Factory? AI and Dark Factories Explained" | 15 Oct 2026, updated 13 Nov 2026 | 2026-11-20 | primary (vendor page) |
| https://github.com/hancrafted/content-library/issues/459 | "Why does the factory metaphor fit AI-driven software production, and where does it break?" | 30 Oct 2026 | 2026-11-20 | primary |
| https://digitaleconomydispatches.substack.com/p/digital-economy-dispatch-299-the-return-of-the-software-factory | Alan Brown, Digital Economy Dispatch #299, "The Return of the Software Factory" | 13 Sep 2026 | 2026-11-20 | primary (opening only; paywalled) |
| https://en.wikipedia.org/wiki/Software_factory | Software factory (Wikipedia), used for reference leads only | undated | 2026-11-20 | secondhand |
| https://www.kestrel.edu/people/smith/pub/arpi96.pdf | Kestrel / Smith, transportation scheduling synthesis (KTS) | 1996 | 2026-11-20 | secondhand (search snippet) |
| https://trid.trb.org/View/863327 | Planware: Domain-Specific Synthesis of High-Performance Schedulers | about 1998 | 2026-11-20 | secondhand (search snippet) |
| https://learn.microsoft.com/en-us/previous-versions/msp-n-p/ff699491(v=pandp.10) | Web Service Software Factories (archived, "Retired: November 2011") | archived | 2026-11-20 | secondhand (search snippet) |
| https://law.stanford.edu/2026/02/08/built-by-agents-tested-by-agents-trusted-by-whom/ | Stanford CodeX, "Built by Agents, Tested by Agents, Trusted by Whom?" | 8 Feb 2026 | 2026-11-20 | secondhand (search snippet) |

### B.2 Whole-line systems


All read 2026-11-20.

#### StrongDM, Shapiro, Gas Town, Ralph

- https://factory.strongdm.ai/ - StrongDM Software Factory - 2026-02-06 - PRIMARY
- https://raw.githubusercontent.com/strongdm/attractor/main/README.md - Attractor README - undated - PRIMARY
- https://github.com/strongdm/attractor/blob/main/attractor-spec.md - Attractor spec - undated - PRIMARY (partial)
- https://simonwillison.net/2026/Feb/7/software-factory/ - How StrongDM's AI team build serious software without even looking at the code - 2026-02-07 - PRIMARY
- https://www.globenewswire.com/news-release/2026/03/05/3250113/0/en/ - Delinea Completes StrongDM Acquisition - 2026-03-05 - SECONDHAND (search)
- https://www.danshapiro.com/blog/2026/01/the-five-levels-from-spicy-autocomplete-to-the-software-factory/ - The Five Levels - 2026-01-23 - PRIMARY
- https://yegge.ai/essays/the-shape-of-things-to-come/ - The Shape of Things to Come - 2026-08 - PRIMARY
- https://simonwillison.net/2026/Aug/4/steve-yegge/ - Willison on Yegge - 2026-08-04 - PRIMARY
- https://maggieappleton.com/gastown - Gas Town (Maggie Appleton) - undated (~Jan 2026) - PRIMARY
- https://thenewstack.io/steve-yegges-ai-agent-orchestration-project-gas-town-comes-to-the-cloud-and-brings-the-wasteland-with-it/ - Gas Town comes to the cloud - 2026 - SECONDHAND (403 on fetch)
- https://ghuntley.com/ralph/ - Ralph Wiggum as a "software engineer" - 2025-07-14 - PRIMARY

#### Cognition, 8090, Factory

- https://cognition.com/blog/devin-2-1 - Devin 2.1 - 2025-05-15 - PRIMARY
- https://cognition.com/blog/devin-annual-performance-review-2025 - Devin's 2025 performance review - 2025-11-14 - PRIMARY
- https://cognition.com/blog/funding-growth-and-the-next-frontier-of-ai-coding-agents - Funding, growth... - 2025-09-08 - PRIMARY
- https://www.theregister.com/2025/01/23/ai_developer_devin_poor_reviews - Devin bad at its job, testers claim - 2025-01-23 - PRIMARY (OLD)
- https://docs.8090.ai/general/introduction - 8090 Software Factory docs - undated - PRIMARY
- https://rywalker.com/research/8090-software-factory - 8090 Software Factory research note - checked 2026-09-15 - PRIMARY
- https://factory.com/ - Factory homepage - undated - PRIMARY
- https://factory.com/news/software-factory - Factory 2.0 / software factory - 2026-06-15 - PRIMARY
- https://docs.factory.com/cli/user-guides/specification-mode - Specification Mode - undated - PRIMARY

#### Kiro / AWS

- https://kiro.dev/docs/specs/ - Kiro Specs - undated - PRIMARY
- https://www.aboutamazon.com/news/aws/amazon-ai-frontier-agents-autonomous-kiro - Frontier agents - 2025-12-02 - PRIMARY
- https://www.theregister.com/2026/02/20/amazon_denies_kiro_agentic_ai_behind_outage/ - Amazon denies Kiro behind outage - 2026-02-20 - PRIMARY

#### Lovable, Replit, Cursor

- https://docs.lovable.dev/features/plan-mode - Lovable Plan mode - undated - PRIMARY
- https://techcrunch.com/2026/03/11/lovable-says-it-added-100m-in-revenue-last-month-alone-with-just-146-employees/ - Lovable $400M ARR - 2026-03-11 - PRIMARY
- https://thenextweb.com/news/lovable-vibe-coding-security-crisis-exposed - Lovable left thousands of projects exposed for 48 days - 2026-04-21 - PRIMARY
- https://cybersecuritynews.com/lovable-security-vulnerability/ - CVE-2025-48757 article - 2025-06-10 - PRIMARY
- https://escape.tech/blog/methodology-how-we-discovered-vulnerabilities-apps-built-with-vibe-coding/ - Escape methodology - 2025-10-29 - PRIMARY
- https://replit.com/blog/introducing-agent-4-built-for-creativity - Introducing Replit Agent 4 - 2026-03-11 - PRIMARY
- https://docs.replit.com/replitai/agent - Replit Agent docs - undated - PRIMARY
- https://www.theregister.com/2025/07/22/replit_saastr_response/ - Replit makes vibe-y promise - 2025-07-22 - PRIMARY
- https://cursor.com/blog/scaling-agents - Scaling long-running autonomous coding - 2026-01-14 - PRIMARY
- https://www.theregister.com/2026/01/26/cursor_opinion/ - When AI 'builds a browser,' check the repo - 2026-01-26 - PRIMARY

#### GitHub, OpenAI, Google

- https://docs.github.com/copilot/concepts/coding-agent/about-copilot-coding-agent - About Copilot coding agent - undated - PRIMARY
- https://github.blog/news-insights/company-news/welcome-home-agents/ - Introducing Agent HQ - 2025-10-28 - PRIMARY
- https://gist.github.com/idan/15f101b8ff4be8bebe17147c08995363 - Copilot Workspace sunset notice - 2025-05-21 - PRIMARY
- https://github.blog/changelog/2026-08-04-upcoming-deprecation-of-github-spark-on-github-com - Spark deprecation - 2026-08-04 - PRIMARY
- https://techcrunch.com/2026/09/29/openai-gives-codex-reusable-cloud-environments-that-work-across-devices/ - Codex reusable cloud environments - 2026-09-29 - PRIMARY
- https://jules.google/docs/changelog - Jules changelog (Turndown entry) - 2026-10-29 - PRIMARY
- https://firebase.google.com/docs/studio/migrating-project - Firebase Studio sunset - 2026-03-19 onward - PRIMARY

#### Base44, Atoms, Emergent, v0

- https://wiz.io/blog/critical-vulnerability-base44 - Wiz on Base44 - 2025-07-29 - PRIMARY
- https://cybersecuritynews.com/ai-vibe-coding-platform-hacked/ - Base44 flaw article - 2025-07-31 - PRIMARY
- https://kr-asia.com/from-metagpt-to-atoms-deepwisdom-leads-chinas-push-into-vibe-coding - From MetaGPT to Atoms - 2026-01-26 - PRIMARY
- https://techcrunch.com/2026/02/17/emergent-hits-100m-arr-eight-months-after-launch-rolls-out-mobile-app - Emergent $100M ARR - 2026-02-17 - PRIMARY
- https://vercel.com/blog/introducing-the-new-v0 - Introducing the new v0 - 2026-02-03 - PRIMARY

#### Smaller factory launches and analyst notes

- https://techcrunch.com/2026/08/18/warps-new-system-is-an-out-of-the-box-software-factory-for-ai-development/ - Warp Factories - 2026-08-18 - PRIMARY
- https://mastra.ai/blog/announcing-mastra-factory - Announcing Mastra Factory - 2026-07-27 - PRIMARY
- https://openhands.dev/blog/agent-control-plane - The Software Agent Control Plane - 2026-04-03 - PRIMARY
- https://www.gartner.com/en/documents/8397881 - Innovation Insight: AI Software Factories - 2026-09-17 - SECONDHAND (search abstract)
- https://support.bolt.new/release-notes.md - Bolt release notes - 2026 - SECONDHAND (search)
- https://www.getastra.com/reports/vibe-coding-security-risks-study - Astra vibe coding security study - 2026 - SECONDHAND (search)

### B.3 Upstream: intake, elicitation, specification

- https://github.com/github/spec-kit - Spec Kit README - 2026 (undated page) - primary
- https://github.com/github/spec-kit/blob/main/spec-driven.md - Specification-Driven Development - undated (© 2026) - primary
- https://raw.githubusercontent.com/github/spec-kit/main/templates/commands/clarify.md - clarify command template - undated - primary
- https://github.github.io/spec-kit/guides/assessment.html - Idea assessment walkthrough - undated - primary
- https://github.github.com/spec-kit/history.html - Spec Kit history - 404 to me; date info via search - secondhand
- https://kiro.dev/docs/specs/ - Kiro Specs - updated 12 Nov 2026 - primary
- https://kiro.dev/docs/specs/feature-specs/ - Feature specs - 4 Aug 2026 - primary
- https://kiro.dev/blog/deep-spec-analysis/ - Requirements analysis: catching requirement bugs before they become code - 12 May 2026 - primary
- https://kiro.dev/docs/specs/correctness/ - Correctness / property-based testing - undated (2026) - primary
- https://kiro.dev/blog/specs-bugfix-and-design-first/ - New spec types - 18 Feb 2026 - primary
- https://github.com/bmad-code-org/BMAD-METHOD - BMAD Method README - 2026 - primary
- https://docs.bmad-method.org/ - BMAD docs home - 2026 - primary
- https://docs.bmad-method.org/clarify/clarify-the-idea/ - Clarify the Idea - 2026 - primary
- https://docs.bmad-method.org/plan/write-a-prd/ - Write a PRD - 2026 - primary
- https://github.com/Fission-AI/OpenSpec - OpenSpec README - 2026 - primary
- https://github.com/Fission-AI/OpenSpec/blob/main/docs/concepts.md - OpenSpec concepts - undated - primary
- https://code.claude.com/docs/en/best-practices - Best practices for Claude Code - undated - primary
- https://docs.lovable.dev/features/plan-mode - Lovable Plan mode - undated - primary
- https://www.intentapp.dev/ - Augment Intent - undated - primary
- https://tessl.io/ - Tessl home - 2026 - primary
- https://tessl.io/blog - Tessl blog index - Nov 2026 - primary
- https://codemyspec.com/blog/tessl-review - Tessl Review (2026): The Spec-as-Source Bet - 3 Jun 2026 - primary (competitor author)
- https://github.com/eyaltoledano/claude-task-master - Taskmaster README - undated - primary
- https://buildermethods.com/agent-os - Agent OS - undated (v3) - primary
- https://www.chatprd.ai/product/features - ChatPRD features - 2026 - primary
- https://www.productboard.com/blog/introducing-spark-ai-product-management-agent/ - Introducing Spark - 27 Jan 2026 - primary
- https://linear.app/changelog/2026-03-24-introducing-linear-agent - Introducing Linear Agent - 24 Mar 2026 - primary
- https://www.anthropic.com/research/anthropic-interviewer - Introducing Anthropic Interviewer - 4 Dec 2025 - primary
- https://arxiv.org/abs/2608.25202 and https://arxiv.org/html/2608.25202 - Spec-Driven Development as Prescribed and as Practiced - 25 Aug 2026 (v5 16 Nov 2026) - primary
- https://drops.dagstuhl.de/entities/document/10.4230/LIPIcs.ESEM.2026.84 - Specification Artifacts in Open-Source PR Workflows Do Not Reduce Defects - 5 Oct 2026 - primary (abstract)
- https://arxiv.org/abs/2502.13069 - Ambig-SWE - Feb 2025 / Feb 2026 - primary
- https://arxiv.org/abs/2603.26233 - Ask or Assume? - Mar 2026 / Sep 2026 - primary
- https://arxiv.org/abs/2406.00215 and https://arxiv.org/html/2406.00215v3 - HumanEvalComm - May 2024 / Jan 2025 - primary
- https://arxiv.org/abs/2310.10996 - ClarifyGPT - Oct 2023 - primary
- https://arxiv.org/abs/2607.00711 - ClarifyCodeBench - Jul 2026 - primary
- https://arxiv.org/abs/2507.20439 - When Prompts Go Wrong - Jul 2025 - primary
- https://arxiv.org/abs/2602.18306 - ReqElicitGym - Feb 2026 - primary
- https://arxiv.org/abs/2605.05828 - From Chat to Interview (OntoAgent) - May 2026 - primary
- https://arxiv.org/abs/2507.02564 - LLMREI - Jul 2025 - primary
- https://arxiv.org/abs/2507.02858 - Requirements Elicitation Follow-Up Question Generation - Jul 2025 - primary
- https://arxiv.org/abs/2507.15157 - Can LLMs Generate User Stories and Assess Their Quality? - Jul 2025 - primary
- https://arxiv.org/abs/2503.07800 - Lojo et al. LLM customer for elicitation training - Mar 2025 - secondhand
- https://arxiv.org/abs/2404.16045 - Elicitron - Apr 2024 - primary
- https://arxiv.org/abs/2509.11446 - LLMs for RE: Systematic Literature Review - Sep 2025 - primary
- https://arxiv.org/abs/2409.06741 - Generative AI for RE: SLR - 2024 - secondhand
- https://arxiv.org/abs/2403.01709 - Can LLMs Generate Architectural Design Decisions? - Mar 2024 - primary
- https://arxiv.org/abs/2604.03826 - Context Matters: ADR generation - Apr 2026 - primary
- https://arxiv.org/abs/2605.01392 - Using LLMs in Software Design - May 2026 - primary
- https://arxiv.org/abs/2605.01160 - The Productivity-Reliability Paradox - May 2026 - primary (abstract)
- https://arxiv.org/abs/2602.00180 - Spec-Driven Development: From Code to Contract - Jan 2026 - primary (abstract)
- https://www.ai.engineer/talks/8rABwKRsec4-specifications-are-the-new-code - Specifications Are the New Code (Sean Grove) - 2025 - primary (talk page)
- https://rjroy.github.io/writing/intent-driven-development/ - Intent-Driven Development - 15 Mar 2026 - primary
- https://tessl.io/blog/we-stopped-reviewing-code-and-started-verifying-intent - We stopped reviewing code and started verifying intent - 20 Oct 2026 - primary
- https://tessl.io/blog/your-software-factory-dream-factory-or-treadmill - Your Software Factory: Dream Factory or Treadmill? - 11 Nov 2026 - secondhand (search snippet only)
- https://www.infoq.com/articles/enterprise-spec-driven-development - Enterprise Spec-Driven Development - 19 Feb 2026 - primary
- https://martinfowler.com/articles/exploring-gen-ai/sdd-3-tools.html - Understanding Spec-Driven-Development: Kiro, spec-kit, and Tessl - 15 Oct 2025 - primary
- https://martinfowler.com/fragments/2026-01-08.html - Fowler fragment quoting Kent Beck - 8 Jan 2026 - primary
- https://www.thoughtworks.com/en-in/radar/techniques/spec-driven-development - Radar: Spec-driven development - 5 Nov 2025 - primary
- https://www.thoughtworks.com/en-br/radar/languages-and-frameworks/github-spec-kit - Radar: GitHub Spec Kit - 15 Apr 2026 - primary
- https://blog.scottlogic.com/2025/11/26/putting-spec-kit-through-its-paces-radical-idea-or-reinvented-waterfall.html - Putting Spec Kit Through Its Paces - 26 Nov 2025 - primary
- https://marmelab.com/blog/2025/11/12/spec-driven-development-waterfall-strikes-back.html - The Waterfall Strikes Back - 12 Nov 2025 - primary
- https://world.hey.com/johnnybutler/spec-first-ai-is-just-waterfall-with-better-typing-35a91a66 - Spec-first AI is just waterfall with better typing - 16 Jun 2026 - primary
- https://dev.to/pacheco/spec-driven-development-isnt-waterfall-but-it-keeps-ending-up-there-4eei - SDD isn't waterfall but it keeps ending up there - Apr 2026 (year inferred) - primary
- https://brooker.co.za/blog/2026/04/09/waterfall-vs-spec - Spec Driven Development isn't Waterfall - 9 Apr 2026 - primary
- https://www.nngroup.com/articles/synthetic-users-vs-human-respondents/ - Synthetic Users vs Human Respondents - 16 Oct 2026 - primary
- https://listenlabs.ai/articles/listen-vs-outset-user-interviews/ ; https://outset.ai/almanac/ai-moderated-research-tools-the-complete-guide-(2026) - AI-moderated interview vendors - 2026 - secondhand (search snippets, vendor)
- https://linear.app/docs/triage ; https://linear.app/changelog/2025-12-11-linear-agent-for-intercom-zendesk-gong - Linear triage intelligence - 2025 - secondhand

### B.4 Downstream: verification, operations, automatic intake, cost


All read 2026-11-20.

- https://engineering.fb.com/2018/09/13/developer-tools/finding-and-fixing-software-bugs-automatically-with-sapfix-and-sapienz/ - Finding and fixing software bugs automatically with SapFix and Sapienz - 2018-09-13 - primary
- https://engineering.fb.com/2018/11/06/developer-tools/getafix-how-facebook-tools-learn-to-fix-bugs-automatically/ - Getafix: How Facebook tools learn to fix bugs automatically - 2018-11-06 - primary
- https://arxiv.org/abs/2402.09171 - Automated Unit Test Improvement using LLMs at Meta (TestGen-LLM) - 2024-02-14 - primary (abstract)
- https://engineering.fb.com/2025/02/05/security/revolutionizing-software-testing-llm-powered-bug-catchers-meta-ach/ - LLM-powered bug catchers (ACH) - 2025-02-05 - primary
- https://arxiv.org/abs/2501.12862 - Mutation-Guided LLM-based Test Generation at Meta - 2025-01-22 - primary (abstract)
- https://research.google/blog/resolving-code-review-comments-with-ml/ - Resolving code review comments with ML - 2023-05-23 - primary
- https://arxiv.org/abs/2405.13565 and https://arxiv.org/html/2405.13565 - AI-Assisted Assessment of Coding Practices in Modern Code Review (AutoCommenter) - 2024-05-22 - primary
- https://arxiv.org/html/2501.06972 - How is Google using AI for internal code migrations? - 2025-01-12 - primary
- https://arxiv.org/abs/2501.07531 - Evaluating Agent-based Program Repair at Google - 2025-01-13 - primary (abstract)
- https://docs.renovatebot.com/key-concepts/automerge/ - Renovate Automerge - undated - primary
- https://docs.renovatebot.com/key-concepts/dashboard/ - Renovate Dependency Dashboard - undated - primary
- https://docs.github.com/en/code-security/dependabot/working-with-dependabot/automating-dependabot-with-github-actions - Automating Dependabot with GitHub Actions - undated - primary
- https://arxiv.org/abs/2206.07230 - Automating Dependency Updates in Practice: Dependabot - 2022-06-15 (rev. 2023-05-25) - primary (abstract)
- https://docs.sentry.io/product/ai-in-sentry/seer/autofix/ - Seer Autofix docs - undated (current) - primary
- https://blog.sentry.io/seer-sentrys-ai-debugger-is-generally-available/ - Seer is generally available - 2025-06-17 - primary
- https://docs.github.com/en/copilot/concepts/agents/code-review - About Copilot code review - undated (current) - primary
- https://docs.github.com/en/copilot/concepts/agents/coding-agent/about-coding-agent - About Copilot cloud agent - undated (current) - primary
- https://docs.github.com/en/enterprise-cloud@latest/copilot/concepts/agents/cloud-agent/risks-and-mitigations - Copilot cloud agent risks and mitigations - undated - primary
- https://github.blog/changelog/2026-03-13-optionally-skip-approval-for-copilot-coding-agent-actions-workflows/ - Optionally skip approval for Copilot coding agent workflows - 2026-03-13 - primary
- https://github.blog/changelog/2026/04/27/github-copilot-is-moving-to-usage-based-billing/ - Copilot moving to usage-based billing - 2026-04-27 - secondhand (search snippet)
- https://www.coderabbit.ai/ - CodeRabbit homepage - undated - primary
- https://graphite.com/docs/ai-reviews - Graphite AI reviews - undated - primary
- https://www.greptile.com/benchmarks - AI code review benchmark - run July 2025 - primary
- https://arxiv.org/abs/2412.18531 - Automated Code Review In Practice (Beko) - 2024-12 (ICSE-SEIP 2025) - primary (abstract)
- https://arxiv.org/abs/2607.03316 - Is Agentic Code Review Helpful? CodeRabbit in the wild - 2026-07-03 - primary (abstract)
- https://arxiv.org/abs/2508.18771 - Does AI Code Review Lead to Code Changes? GitHub Actions - 2025-08-26 (rev. 2026-04-25) - primary (abstract)
- https://arxiv.org/abs/2604.03196 - From Industry Claims to Empirical Reality: Code Review Agents in PRs - 2026-04-03 (MSR 2026) - primary (abstract)
- https://www.uber.com/us/en/blog/ureview/ - uReview - 2025-08-12 - primary
- https://learn.microsoft.com/en-us/azure/sre-agent/overview - Overview of Azure SRE Agent - 2026-10-28 - primary
- https://learn.microsoft.com/en-us/azure/sre-agent/run-modes - Run modes in Azure SRE Agent - 2026-06-02 - primary
- https://docs.aws.amazon.com/devopsagent/latest/userguide/about-aws-devops-agent.html - About AWS DevOps Agent - undated - primary
- https://infoq.com/news/2026/04/aws-devops-agent-ga - AWS DevOps Agent GA (InfoQ) - 2026-04-18 - primary (secondhand on AWS claims)
- https://www.datadoghq.com/blog/bits-investigations-cost-speed-accuracy - Bits investigations cost, speed, accuracy - 2026-11-02 - primary
- https://www.techtarget.com/searchitoperations/opinion/DASH-2026-Datadog-goes-from-watching-code-to-writing-it - DASH 2026: Datadog goes from watching code to writing it - 2026-06-10 - primary (opinion)
- https://www.pagerduty.com/blog/ai/meet-paige-sre-agent/ - Meet Paige, SRE agent - 2026-11-03 - primary
- https://cleric.ai/ - Cleric homepage - undated - primary
- https://resolve.ai/ - Resolve AI homepage - undated - primary
- https://arxiv.org/abs/2607.28545 - ORCA-bench: How Ready Are LM Agents for Oncall? - 2026-07-30 (v3 2026-09-29) - primary (abstract)
- https://www.langchain.com/blog/production-agents-self-heal/ - Production agents that self-heal - 2026-04-03 - primary
- https://linear.app/changelog/2025-12-11-linear-agent-for-intercom-zendesk-gong - Linear agent for Intercom, Zendesk, Gong - 2025-12-11 - primary
- https://linear.app/docs/triage-intelligence - Triage Intelligence - undated - primary
- https://linear.app/blog/how-we-use-linear-agent-at-linear - How we use Linear agent at Linear - 2026-04-10 - primary
- https://arxiv.org/abs/2404.05427 - AutoCodeRover: Autonomous Program Improvement - 2024-04-08 - primary (abstract)
- https://arxiv.org/abs/2407.01489 - Agentless: Demystifying LLM-based SE Agents - 2024-07-01 - primary (abstract)
- https://arxiv.org/abs/2503.15223 - Are "Solved Issues" in SWE-bench Really Solved Correctly? - 2025-03-19 - primary (abstract)
- https://metr.org/notes/2026-03-10-many-swe-bench-passing-prs-would-not-be-merged-into-main/ - Many SWE-bench-Passing PRs Would Not Be Merged into Main - 2026-03-10 - primary
- https://arxiv.org/abs/2410.21136 - Do LLMs generate test oracles that capture actual or expected behaviour? - 2024-10-28 (rev. 2026-10-05) - primary (abstract)
- https://blog.google/technology/developers/dora-report-2025/ - Inside our 2025 DORA report - 2025-09-23 - primary
- https://www.infoq.com/news/2025/09/dora-state-of-ai-in-dev-2025 - DORA State of AI-assisted Software Development (InfoQ) - 2025-09 - primary (secondhand on report)
- https://www.faros.ai/blog/ai-productivity-paradox-report-2025 - The AI Productivity Paradox Report 2025 - 2025-07-23 - primary
- https://code.claude.com/docs/en/costs - Manage costs effectively (Claude Code) - current docs - primary
- https://usegitai.com/blog/token-cost-by-pull-request - Token cost by pull request - 2026-05-27 - primary
- https://conf.researchr.org/details/fse-2026/fse-2026-industry-papers/8/AutoCodeRover-Agentic-Program-Repair-for-SonarQube-Issues - FSE 2026 industry paper listing - 2026 - secondhand (search snippet)
- https://langfuse.com/resources/engineering/coding-agent-cost-tracking - Coding agent cost tracking - undated - secondhand (search snippet)
- https://solar.cs.ucl.ac.uk/pdf/pinna2026msr.pdf - Comparing AI Coding Agents: PR acceptance (MSR 2026) - 2026 - secondhand (search snippet)

### B.5 Existing software

- https://arxiv.org/html/2501.06972v1 - How is Google using AI for internal code migrations? - 12 Jan 2025 - read 2026-11-20 - primary
- https://arxiv.org/abs/2504.09691 - Migrating Code At Scale With LLMs At Google - 13 Apr 2025 - read 2026-11-20 - primary (abstract)
- https://arxiv.org/abs/2603.27296 - A Multi-agent AI System for Deep Learning Model Migration from TensorFlow to JAX - 28 Mar 2026 - read 2026-11-20 - primary (abstract)
- https://airbnb.tech/?p=366 - Accelerating Large-Scale Test Migration with LLMs - about Mar-Apr 2025 (undated page) - read 2026-11-20 - primary
- https://engineering.atspotify.com/2025/11/spotifys-background-coding-agent-part-1 - 1,500+ PRs Later (Honk Part 1) - 6 Nov 2025 - read 2026-11-20 - primary
- https://engineering.atspotify.com/2025/11/context-engineering-background-coding-agents-part-2 - Context Engineering (Part 2) - 24 Nov 2025 - read 2026-11-20 - primary
- https://engineering.atspotify.com/2025/12/feedback-loops-background-coding-agents-part-3 - Predictable Results Through Strong Feedback Loops (Part 3) - 9 Dec 2025 - read 2026-11-20 - primary
- https://bun.com/blog/bun-in-rust - Rewriting Bun in Rust - 8 Jul 2026 - read 2026-11-20 - primary
- https://simonwillison.net/2024/Aug/24/andy-jassy-amazon-ceo/ - Jassy quotation - 24 Aug 2024 - read 2026-11-20 - secondhand (of Jassy's post)
- https://aws.amazon.com/blogs/aws/upgrade-your-java-applications-with-amazon-q-code-transformation-preview/ - Upgrade your Java applications with Amazon Q Code Transformation (preview) - 28 Nov 2023 - read 2026-11-20 - primary (curl)
- https://docs.aws.amazon.com/amazonq/latest/qdeveloper-ug/how-CT-works.html - How Amazon Q Developer transforms code for Java language upgrades - current - read 2026-11-20 - primary
- https://ecosystem4engineering.substack.com/p/automated-refactoring-ai-versus-deterministic - Automated refactoring: AI versus deterministic (Häuptle) - 25 Aug 2024 - read 2026-11-20 - primary
- https://aws.amazon.com/blogs/migration-and-modernization/getting-mainframe-reverse-engineering-right-at-scale/ - Getting Mainframe Reverse Engineering Right at Scale - 24 Jul 2026 - read 2026-11-20 - primary (curl)
- https://www.softwarereviews.com/vendor-technology-notes/aws-transform-says-it-s-processed-10-billion-lines-of-legacy-code - AWS Transform Says It's Processed 10 Billion Lines of Legacy Code - 24 Sep 2026 - read 2026-11-20 - primary (independent analyst)
- https://martinfowler.com/articles/legacy-modernization-gen-ai.html - Legacy Modernization meets GenAI - 24 Sep 2024 - read 2026-11-20 - primary
- https://www.thoughtworks.com/en-br/insights/articles/claude-code-cobol-modernization-reality - Claude Code and COBOL modernization: What's the reality? - 2 Mar 2026 - read 2026-11-20 - primary
- https://www.thoughtworks.com/en-es/insights/articles/ai-assisted-migration-lessons - AI-assisted migration lessons - 13 Jul 2026 - read 2026-11-20 - primary
- https://www.thoughtworks.com/en-br/radar/techniques/ai-for-code-migrations - Technology Radar: AI for code migrations (Trial) - Nov 2025 - read 2026-11-20 - primary
- https://www.uber.com/us/en/blog/junit-migration/ - How Uber Executed A JUnit Migration at Massive Scale - 7 Apr 2026 - read 2026-11-20 - primary
- https://javapro.io/2026/02/04/the-open-source-deterministic-engine-maintaining-javas-next-30-years/ - The Open Source, Deterministic Engine Maintaining Java's Next 30 Years - 4 Feb 2026 - read 2026-11-20 - primary
- https://www.entrepreneur.com/business-news/morgan-stanley-builds-ai-tool-that-fixes-major-coding-issue/492697 - Morgan Stanley builds AI tool... - 3 Jun 2025 - read 2026-11-20 - secondhand (of WSJ)
- https://cognition.com/blog/deepwiki - DeepWiki: AI docs for any repo - 5 May 2025 - read 2026-11-20 - primary
- https://cognition.com/blog/how-devin-is-modernizing-cobol-at-fortune-500-companies - How Devin Is Modernizing COBOL at Fortune 500 Companies - 8 Apr 2026 - read 2026-11-20 - primary
- https://hn.svelte.dev/item/45002092 - HN: DeepWiki: Understand Any Codebase - about 2025 - read 2026-11-20 - primary (independent comments)
- https://developers.googleblog.com/introducing-code-wiki-accelerating-your-code-understanding/ - Introducing Code Wiki - 13 Nov 2025 - read 2026-11-20 - primary
- https://www.theregister.com/2025/11/17/google_previews_code_wiki/ - Google previews Code Wiki: Can you trust AI to document your repository? - 17 Nov 2025 - read 2026-11-20 - primary (independent)
- https://swimm.io/platform - Swimm Application Understanding Platform - current - read 2026-11-20 - primary
- https://www.ibm.com/case-studies/national-organization-for-social-insurance - NOSI case study - 2025 - read 2026-11-20 - primary
- https://research.ibm.com/publications/enterprise-scale-cobol-to-java-translation-llms-augmented-with-program-analysis - Enterprise-Scale COBOL-to-Java Translation - 12 Apr 2026 - read 2026-11-20 - primary
- https://claude.com/blog/how-ai-helps-break-cost-barrier-cobol-modernization - COBOL Modernization with AI: Breaking the Cost Barrier - 23 Feb 2026 - read 2026-11-20 - primary
- https://devblogs.microsoft.com/dotnet/your-migrations-source-of-truth-the-modernization-assessment/ - Your migration's source of truth: the modernization assessment - 7 Apr 2026 - read 2026-11-20 - primary
- https://blog.pragmaticengineer.com/the-pulse-we-need-to-talk-about-migrations-with-ai/ - The Pulse: We need to talk about migrations with AI - 27 Aug 2026 (updated 22 Oct 2026) - read 2026-11-20 - primary (curl)
- https://slack.engineering/balancing-old-tricks-with-new-feats-ai-powered-conversion-from-enzyme-to-react-testing-library-at-slack/ - Balancing Old Tricks with New Feats - 22 May 2024 - read 2026-11-20 - primary
- https://arxiv.org/html/2509.16941v2 - SWE-Bench Pro - 21 Sep 2025 / v2 14 Nov 2025 - read 2026-11-20 - primary
- https://arxiv.org/html/2510.04852 - FreshBrew: A Benchmark for Evaluating AI Agents on Java Code Migration - Oct 2025 (v3) - read 2026-11-20 - primary
- https://arxiv.org/abs/2505.09569 - MigrationBench - 14 May 2025 / v3 28 May 2026 - read 2026-11-20 - primary (abstract)
- https://metr.org/blog/2026-02-24-uplift-update/ - METR uplift update - 24 Feb 2026 - read 2026-11-20 - primary
- https://arxiv.org/html/2512.13360v1 - UCRBench: Benchmarking LLMs on Use Case Recovery - 15 Dec 2025 - read 2026-11-20 - primary
- https://arxiv.org/abs/2606.25550 - On the Viability of Requirements Generation From Code - 24 Jun 2026 - read 2026-11-20 - primary (abstract)
- https://arxiv.org/html/2509.19587v1 - Reverse Engineering User Stories from Code using LLMs - 23 Sep 2025 - read 2026-11-20 - primary
- https://arxiv.org/abs/2510.24428 - CodeWiki: Evaluating AI's Ability to Generate Holistic Documentation for Large-Scale Codebases - 28 Oct 2025 / v6 4 Apr 2026 - read 2026-11-20 - primary (abstract)
- https://agents.md/ - AGENTS.md - current - read 2026-11-20 - primary
- https://arxiv.org/html/2602.11988 - Evaluating AGENTS.md: Are Repository-Level Context Files Helpful for Coding Agents? - Feb 2026 (v3 Sep 2026) - read 2026-11-20 - primary
- https://arxiv.org/html/2601.20404 - On the Impact of AGENTS.md Files on the Efficiency of AI Coding Agents - Jan 2026 / v2 30 Mar 2026 - read 2026-11-20 - primary
- https://thesai.org/Downloads/Volume17No4/Paper_13-Trust_and_Hallucinations.pdf - Trust and Hallucinations (IJACSA) - 2026 - read 2026-11-20 - secondhand (snippet only)
- https://www.theregister.com/2026/02/23/ibm_share_dive_anthropic_cobol/ - IBM stock dives after Anthropic points out AI can rewrite COBOL fast - 23 Feb 2026 - read 2026-11-20 - secondhand (headline/snippet)

### B.6 Opinions, evidence, failure modes



#### METR
- https://metr.org/blog/2025-07-10-early-2025-ai-experienced-os-dev-study/ - Measuring the Impact of Early-2025 AI on Experienced OS Developer Productivity - 2025-07-10 - primary
- https://metr.org/blog/2026-02-24-uplift-update/ - METR uplift update - 2026-02-24 - primary
- https://metr.org/blog/2026-05-11-ai-usage-survey/ - METR AI usage survey - 2026-05-11 - primary
- https://metr.org/blog/2026-01-29-time-horizon-1-1/ - Time Horizon 1.1 - 2026-01-29 - primary
- https://metr.org/notes/2026-01-22-time-horizon-limitations/ - Time horizon limitations - 2026-01-22 - primary
- https://metr.org/time-horizons/ - Task-Completion Time Horizons of Frontier AI Models - updated 2026-09-08 - primary
- https://www.technologyreview.com/2026/02/05/1132254/this-is-the-most-misunderstood-graph-in-ai/ - This is the most misunderstood graph in AI - 2026-02-05 - primary

#### Surveys and telemetry studies
- https://cloud.google.com/blog/products/ai-machine-learning/announcing-the-2025-dora-report - Announcing the 2025 DORA Report - 2025-09-24 - primary
- https://www.faros.ai/blog/ai-productivity-paradox-report-2025 - The AI Productivity Paradox Report 2025 - 2025-07-23 - primary
- https://survey.stackoverflow.co/2025/ai - Stack Overflow Developer Survey 2025, AI - 2025 - primary

#### Code quality and security studies
- https://leaddev.com/ai/code-maintainability-plummets-in-the-ai-coding-era - Code maintainability plummets in the AI coding era (GitClear 2026) - 2026-07-07 - primary for LeadDev / secondhand for GitClear
- https://www.coderabbit.ai/blog/state-of-ai-vs-human-code-generation-report - State of AI vs Human Code Generation - 2025-12-17 - primary
- https://www.veracode.com/press-release/ai-generated-code-poses-major-security-risks-in-nearly-half-of-all-development-tasks-veracode-research-reveals/ - Veracode 2025 GenAI Code Security - 2025-07-30 - primary
- https://veracode.com/press-release/veracode-finds-first-meaningful-gain-in-ai-code-security-since-2025-as-average-pass-rate-hits-62 - Veracode October 2026 update - 2026-10-29 - primary

#### Skills and comprehension
- https://www.anthropic.com/research/AI-assistance-coding-skills - How AI assistance impacts the formation of coding skills - 2026-01-29 - primary
- https://addyosmani.com/blog/the-80-problem-in-agentic-coding/ - The 80% Problem in Agentic Coding - 2026-01-28 - primary
- https://www.thoughtworks.com/radar/techniques/complacency-with-ai-generated-code - Complacency with AI-generated code (Hold) - 2024-10 to 2025-11 - primary
- https://heise.de/-11259127 - Thoughtworks warns: AI code grows faster than understanding of it - 2026-04-15 - primary

#### Adoption and productivity
- https://arxiv.org/html/2506.08945v2 - Who is using AI to code? (Daniotti et al.) - 2025/2026 - primary
- https://www.microsoft.com/en-us/research/?p=1148213 - The Effects of Generative AI on High-Skilled Work - 2025-06 - primary
- https://fortune.com/2026/01/29/100-percent-of-code-at-anthropic-and-openai-is-now-ai-written-boris-cherny-roon/ - 100% of code at Anthropic and OpenAI is now AI written - 2026-01-29 - primary
- https://blog.google/innovation-and-ai/infrastructure-and-cloud/google-cloud/cloud-next-2026-sundar-pichai/ - Cloud Next '26 - 2026-04-22 - secondhand (search snippet)

#### Practitioner opinions
- https://simonwillison.net/2025/Mar/19/vibe-coding/ - Not all AI-assisted programming is vibe coding - 2025-03-19 - primary
- https://simonwillison.net/2025/Oct/7/vibe-engineering/ - Vibe engineering - 2025-10-07 - primary
- https://simonwillison.net/2025/Oct/18/agi-is-still-a-decade-away/ - Karpathy: AGI is still a decade away (link post) - 2025-10-18 - primary
- https://simonwillison.net/2025/Dec/18/code-proven-to-work/ - Your job is to deliver code you have proven to work - 2025-12-18 - primary
- https://simonwillison.net/2026/Jan/28/the-five-levels/ - The Five Levels (link post) - 2026-01-28 - primary
- https://simonwillison.net/2026/Feb/7/software-factory/ - StrongDM software factory - 2026-02-07 - primary
- https://simonwillison.net/2026/Aug/4/steve-yegge/ - Steve Yegge quote on Gas Town - 2026-08-04 - primary
- https://werd.io/the-five-levels-from-spicy-autocomplete-to-the-software-factory/ - Werdmuller on the Five Levels - 2026-01-23 - primary
- https://law.stanford.edu/2026/02/08/built-by-agents-tested-by-agents-trusted-by-whom/ - Built by Agents, Tested by Agents, Trusted by Whom? - 2026-02-08 - primary
- https://newsletter.kentbeck.com/p/augmented-coding-beyond-the-vibes - Augmented Coding: Beyond the Vibes - 2025-06-25 - primary
- https://maggieappleton.com/gastown - Gas Town - about 2026-01 (undated) - primary
- https://steveklabnik.com/writing/how-to-think-about-gas-town/ - How to think about Gas Town - 2026-01-15 - primary
- https://www.answer.ai/posts/2025-01-08-devin.html - Thoughts On A Month With Devin - 2025-01-08 - primary (old)
- https://hn.algolia.com/api/v1/items/46771564 - HN item for Karpathy's 2026-01-26 notes (metadata only) - 2026-01-26 - primary metadata

#### Failure taxonomies and benchmark critiques
- https://arxiv.org/html/2503.13657v3 - Why Do Multi-Agent LLM Systems Fail? - 2025 (v3) - primary
- https://epoch.ai/benchmarks/swe-bench-verified/review - SWE-bench Verified benchmark review - 2026-09-03 - primary
- https://latent.space/reading/end-swe-bench-verified/ - End of SWE-bench Verified - 2026 - primary
- https://openai.com/index/why-we-no-longer-evaluate-swe-bench-verified/ - Why we no longer evaluate SWE-bench Verified - 2026-02-23 - not read (403); secondhand via Epoch and Latent Space
- https://arxiv.org/html/2506.12286v1 - The SWE-Bench Illusion - 2025-06 (v4 2025-12-01) - secondhand (search)
- https://rdi.berkeley.edu/blog/trustworthy-benchmarks - Trustworthy benchmarks (Berkeley RDI) - 2026-04 - primary
- https://rdi.berkeley.edu/blog/trustworthy-benchmarks-cont/ - Exploit coverage by benchmark - 2026-04 - primary

#### Incidents
- https://www.theregister.com/2025/07/21/replit_saastr_vibe_coding_incident - Replit/SaaStr incident - 2025-07-21 - primary
- https://www.theregister.com/2025/07/22/replit_saastr_response/ - Replit's response - 2025-07-22 - primary
- https://aishippingblog.com/p/how-i-dropped-our-production-database - How I Dropped Our Production Database - 2026-03-06 - primary
- https://www.pcgamer.com/software/ai/here-we-go-again-ai-deletes-entire-company-database-and-all-backups-in-9-seconds-then-cheerfully-admits-i-violated-every-principle-i-was-given/ - PocketOS (headline only) - 2026-04-28 - primary (truncated)
- https://www.aboutamazon.com/news/aws/aws-service-outage-ai-bot-kiro - Correcting the FT report about AWS, Kiro and AI - 2026-02-20 - primary
- https://thenextweb.com/news/lovable-vibe-coding-security-crisis-exposed - Lovable left thousands of projects exposed for 48 days - 2026-04-21 - primary

#### Maintainers
- https://daniel.haxx.se/blog/2026/01/26/the-end-of-the-curl-bug-bounty/ - The end of the curl bug bounty - 2026-01-26 - primary
- https://www.theregister.com/2025/10/02/curl_project_swamped_with_ai/ - Curl project, swamped with AI slop, finds not all AI is bad - 2025-10-02 - primary

#### Non-programmers
- https://arxiv.org/html/2605.24521 - From Prompting to Verification (Fawzy, Tahir, Blincoe) - 2026-05-23 - primary
- https://www.nngroup.com/articles/vibe-architects/ - Vibe Architects: Agentic Vibe Coders - 2026-06-19 - primary
- https://www.saastr.com/which-apps-make-sense-for-vibe-coding-by-non-engineers-and-which-probably-dont-yet-today/ - Which apps make sense for vibe coding by non-engineers - about 2025-07 (inferred) - primary

#### Secondhand only (search snippets)
- InfoQ DORA 2025; DevClass, The New Stack and LeadDev on GitClear 2025
- TechSpot, Tom's Hardware, Fast Company, DevOps.com and ABC7 on PocketOS
- The Register, GeekWire and Computerworld on Kiro
- NVD CVE-2025-48757
- Towards AI, WebProNews and DEV posts on costs
- Buttondown, The New Stack and AOL on Karpathy's "agentic engineering"

### B.7 People, roles, taste, reporting


- https://arxiv.org/abs/2509.06216 - Agentic Software Engineering: Foundational Pillars and a Research Roadmap - v1 2025-09-07, v4 2026-11-02 - PRIMARY
- https://arxiv.org/html/2509.06216v2 - same, full text v2 - 2025-09-23 - PRIMARY (partial)
- https://agentpatterns.ai/patterns/agent-design/structured-agentic-software-engineering/ - SASE summary - undated - SECONDHAND (snippet)
- https://www.anthropic.com/research/how-ai-is-transforming-work-at-anthropic - How AI is transforming work at Anthropic - 2025-12-02 - PRIMARY
- https://www.anthropic.com/research/employment-at-anthropic - Employment at Anthropic - 2026-10-16 - PRIMARY
- https://fortune.com/2026/10/19/work-botsitting-meetings-army-of-claudes-anthropic/ - Fortune on botsitting - 2026-10-19 - read (secondary coverage)
- https://claude.com/blog/how-anthropic-teams-use-claude-code - How Anthropic teams use Claude Code - 2025-07-24 - PRIMARY
- https://docs.github.com/en/copilot/concepts/agents/coding-agent/about-coding-agent - About Copilot coding agent - undated - PRIMARY
- https://docs.github.com/en/copilot/how-tos/use-copilot-agents/coding-agent/review-copilot-prs - Review Copilot PRs - undated - PRIMARY
- https://github.blog/changelog/2026-09-01-copilot-code-review-can-now-approve-pull-requests - Copilot code review can approve PRs - 2026-09-01 - PRIMARY
- https://github.blog/news-insights/company-news/welcome-home-agents/ - Agent HQ - 2025-10-28 - PRIMARY
- https://github.blog/changelog/2026-03-13-optionally-skip-approval-for-copilot-coding-agent-actions-workflows/ - skip workflow approval - 2026-03-13 - SECONDHAND (snippet)
- https://linear.app/developers/aig - Agent Interaction Guidelines - undated - PRIMARY
- https://linear.app/docs/agents-in-linear - AI Agents in Linear - undated - PRIMARY
- https://linear.app/docs/pulse - Pulse - undated - PRIMARY
- https://www.atlassian.com/blog/announcements/rovo-dev-in-jira - Rovo Dev in Jira - 2026-04-02 - PRIMARY
- https://futurumgroup.com/insights/atlassian-fuses-the-agent-work-surface-workflow-and-control-plane-into-jira/ - Futurum analysis - 2026-07-29 - PRIMARY
- https://code.claude.com/docs/en/agent-teams - Orchestrate teams of Claude Code sessions - undated - PRIMARY
- https://code.claude.com/docs/en/slack - Claude Code in Slack - undated - PRIMARY
- https://code.claude.com/docs/en/memory - How Claude remembers your project - undated - PRIMARY
- https://cursor.com/docs/background-agent - Cursor cloud agents - undated - PRIMARY
- https://cursor.com/docs/context/rules - Cursor rules - undated - PRIMARY
- https://docs.devin.ai/essential-guidelines/when-to-use-devin - When to use Devin - undated - PRIMARY
- https://github.com/steveyegge/gastown - Gas Town README - undated (2026) - PRIMARY
- https://maggieappleton.com/gastown - Gas Town's Agent Patterns, Design Bottlenecks, and Vibecoding at Scale - ~Jan 2026 - PRIMARY
- https://www.vibekanban.com/ - Vibe Kanban - undated - PRIMARY
- https://vibekanban.com/blog/shutdown - Goodbye bloop - 2026-04-10 - PRIMARY
- https://www.conductor.build/ - Conductor - undated - PRIMARY
- https://imbue.com/sculptor/ - Sculptor - 2025-09-26, updated 2026-04-30 - PRIMARY
- https://arxiv.org/abs/2308.00352 - MetaGPT - 2023-08-01 (rev 2024-11) - PRIMARY (OLD)
- https://github.com/OpenBMB/ChatDev - ChatDev README - 2026 (2.0 on 2026-01-07) - PRIMARY
- https://github.com/bmad-code-org/BMAD-METHOD - BMAD Method README - 2026 - PRIMARY
- https://docs.bmad-method.org/ - BMAD docs - 2026 - PRIMARY
- https://agents.md/ - AGENTS.md - undated - PRIMARY
- https://arxiv.org/abs/2602.11988 - Evaluating AGENTS.md - 2026-02-12 (v3 2026-09-29) - PRIMARY
- https://kiro.dev/docs/steering/ - Kiro steering - undated - PRIMARY
- https://martinfowler.com/articles/exploring-gen-ai/context-engineering-coding-agents.html - Context Engineering for Coding Agents (Böckeler) - 2026-02-05 - PRIMARY
- https://www.figma.com/blog/design-systems-ai-mcp/ - Design systems and AI: Why MCP servers are the unlock - 2025-08-06 - PRIMARY
- https://arxiv.org/html/2507.15003v1 - The Rise of AI Teammates in SE 3.0 - 2025-07-20 - PRIMARY
- https://arxiv.org/abs/2602.09185 - AIDev: Studying AI Coding Agents on GitHub - 2026-02-09 - PRIMARY
- https://arxiv.org/abs/2509.14745 - On the Use of Agentic Coding: PRs on GitHub - 2025-09-18 (v3 2026-02-09) - PRIMARY
- https://arxiv.org/abs/2606.13468 - Understanding the Rejection of Fixes Generated by Agentic PRs - 2026-06-11 - PRIMARY
- https://arxiv.org/abs/2610.21144 - Plausible Is Not Enough - 2026-10-15 - PRIMARY
- https://arxiv.org/abs/2606.01969 - Trust-Calibrated Code Review - 2026-06-01 - PRIMARY
- https://arxiv.org/abs/2609.33113 - ParallelPilot - 2026-09-27 - PRIMARY
- https://neurips.cc/virtual/2026/169099 - Nothing to Comply With - NeurIPS 2026 - PRIMARY
- https://arxiv.org/abs/2502.13069 - Ambig-SWE - 2025-02-18 (v3 2026-02-21) - PRIMARY
- https://arxiv.org/abs/2607.02294 - Coding Agents Are Guessing (UnderSpecBench) - 2026-07-02 - PRIMARY
- https://arxiv.org/abs/2605.06717 - Agentic Coding Needs Proactivity, Not Just Autonomy - 2026-05-07 - PRIMARY
- https://arxiv.org/html/2603.00187 - ClarEval - 2026-02 - SECONDHAND (snippet)
- https://www.langchain.com/blog/introducing-ambient-agents - Introducing ambient agents - 2025-01-14 - PRIMARY
- https://openai.com/index/harness-engineering/ - Harness engineering - 2026-02-11 - NOT READ (403)
- https://www.infoq.com/news/2026/02/openai-harness-engineering-codex - InfoQ on harness engineering - 2026-02-21 - SECONDHAND (read)
- https://azure.microsoft.com/en-us/blog/agentic-devops-evolving-software-development-with-github-copilot-and-microsoft-azure/ - Agentic DevOps - 2025-05-19 - PRIMARY
- https://www.thoughtworks.com/about-us/news/2026/combat-ai-cognitive-debt-radar-v34 - Radar Vol. 34 press release - 2026-04-15 - PRIMARY
- https://docs.replit.com/features/agent/plan-mode - Replit plan mode - undated - PRIMARY
- https://www.mckinsey.com/capabilities/tech-and-ai/our-insights/beyond-the-copilot-scaling-the-agentic-product-development-life-cycle - Beyond the copilot - 2026 - NOT READ (timeout); SECONDHAND snippets
