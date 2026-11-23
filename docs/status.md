# Status

Where premise is, in plain words. The owner said to build the whole of premise ([0130](decisions/0130-the-build-starts-and-covers-all-of-premise.md)); the plan is in the [roadmap](product/roadmap.md). Last updated 2026-11-23.

## One real run, everything else scripted

- **One real run has been made:** a tiny command-line tool (printing a file's lines in reverse) went through the whole line with real Claude Code agents, every agent on the fast tier at low effort ([0187](decisions/0187-kept-demos-and-one-real-run.md)). It proved the procedure, not the agents' intelligence. It built about three times what was asked, which led to the scope check, the effort level and the milestone waits ([0191](decisions/0191-scope-check-effort-and-milestones.md), [0192](decisions/0192-effort-in-proportion-to-what-was-asked.md)).
- **Everything else was shown with scripted agents:** tests, the two kept demos and continuous integration use a scripted agent and local git remotes, never Claude and never GitHub ([0134](decisions/0134-the-owners-claude-login-only-when-strictly-necessary.md)).

## Built

- **The foundation:** configuration (one file, with a generated reference), storage, the work queue, the setup check.
- **The record keeper:** each software's lasting record, its trace trailers and its own git repository ([0159](decisions/0159-how-the-record-keeper-is-built.md)).
- **The page and its server:** one session, three phases (Understand, Build, Running) with the eleven stages as detail, readable at phone width ([0165](decisions/0165-the-page-shows-three-phases.md), [0190](decisions/0190-how-the-first-visit-is-made-clear.md)).
- **The line:** Why, Who, What exists, What, the scope check, Say back and Plan, run by agents ([0183](decisions/0183-how-the-line-engine-is-built.md), [0184](decisions/0184-how-sizing-of-work-is-built.md)); then Build, Check and Run: a builder per task in its own working copy, a separate checker that uses the software as a user would, and the server landing the checked commit and starting it confined ([0186](decisions/0186-how-build-check-and-run-are-built.md), [0162](decisions/0162-how-the-runner-is-built.md)).
- **The gate:** premise asks before it acts outside this machine ([0182](decisions/0182-how-the-gate-is-built.md), [0220](decisions/0220-approvals-and-verdicts-tell-the-truth.md)).
- **The reporter:** reports from recorded facts only, about one named version, including what failed and what was not checked ([0164](decisions/0164-how-the-reporter-is-built.md), [0245](decisions/0245-reports-are-about-one-named-version.md)).
- **Intake:** from the session, the page's report box, a feedback page for each software's users, and GitHub issues; held items read together into a short list the operator decides line by line ([0185](decisions/0185-how-intake-in-a-thin-form-is-built.md), [0240](decisions/0240-how-github-issues-are-read-and-answered.md)–[0244](decisions/0244-a-feedback-sender-sees-only-their-own-words-and-a-plain-status.md)). A change from intake is planned and built as a change (its own few tasks, no milestones question) and asks at most one question before it is built, only when it matters ([0273](decisions/0273-a-change-is-planned-and-built-as-a-change.md), [0274](decisions/0274-a-change-asks-at-most-one-question.md)); an agent that ends without its structured answer is asked once more ([0275](decisions/0275-an-agent-without-its-answer-is-asked-once-more.md)).
- **Existing software, in a thin form:** premise recovers the record from a copy of the code, says it back to strike, and asks before adding it to the repository on a branch of its own ([0189](decisions/0189-how-taking-on-existing-software-is-built.md)).
- **Roles and taste** in the one session ([0196](decisions/0196-roles-and-taste-in-one-session.md)); **the measures** and **learning from corrections** ([0193](decisions/0193-how-the-measures-are-built.md)–[0195](decisions/0195-two-kinds-of-learning.md)).
- **Several softwares at once,** with priority, pause, resume and archive ([0197](decisions/0197-how-several-softwares-at-once-is-built.md)).
- **Pausing everything and coming back:** "Pause everything" and "Resume" on the page, a clean Ctrl+C (or `premise stop`), a pause that survives a restart, one line on what the start picked up, an optional same link across restarts, and a check of agent sessions after the computer sleeps ([0290](decisions/0290-pausing-and-resuming-the-whole-of-premise.md)). Tested with scripted agents only; never tried with real agents or a real sleep.
- **Cost and the spending limit,** on a mock of usage-ledger (see Mocked) ([0200](decisions/0200-how-cost-and-the-spending-limit-are-built.md)).
- **premise's own count** of what real sessions used (cost at list prices, tokens, turns, and the weekly window as last read), shown before the mocked figures and not marked mocked; every job names the change it served; attention counts only questions the line waited on; the "what exists" findings are one line each and strikable ([0270](decisions/0270-premises-own-figures-and-asks-that-cost-attention-honestly.md)). The figures are tested against a fake agent only; a real session has not yet confirmed their shape on the installed version ([issue 189](https://github.com/omkarbhale/premise/issues/189)).

## Built, but never exercised with real agents or real GitHub

- **Every stage after the first real run's path.** The one real run used the thin path with the fast tier at low effort. The Sonnet and Opus tiers, the other roles, taste claims, work split into parts, and several softwares at once have only been run with the scripted agent.
- **Real GitHub.** Creating a new software's repository on GitHub and pushing to it is built, through the GitHub CLI login, and asked through the gate each time ([0260](decisions/0260-the-real-github-step-is-built-and-each-use-is-asked.md)); it is tested only against a fake GitHub CLI and has not yet been run against GitHub: the first real use is the owner's own approval on the page. Reading a software's issues is built behind an interface and runs against a local fixture; pushing a brought-in repository with the person's own git login is tested on local remotes only ([0141](decisions/0141-github-repositories-in-tests-and-behind-the-gate.md)).
- **Claude Code details never seen with the real program:** a Claude Code configuration folder other than the default, a real usage-limit rejection and the resume after it, and escapes from the sandbox beyond the ones tested ([test record](record/subscription-sandbox-test-2026-11-21.md)).

## Mocked

- **usage-ledger's output.** usage-ledger does not exist yet, so everything cost-related (usage per step and change, budgets, the spending limit) is read from a mock, and every figure on the page is labelled Mocked beside premise's own counts ([0133](decisions/0133-usage-ledger-is-mocked-until-it-exists.md), [contract](specs/usage-ledger.md)). Real figures arrive when usage-ledger is built and meets the contract.

## Deliberately left for later

- **The checker on a different model from the builder** ([0176](decisions/0176-the-checker-on-a-different-model-later.md), [issue 62](https://github.com/omkarbhale/premise/issues/62)).
- **Tolerating commits made outside premise** ([0177](decisions/0177-tolerating-commits-made-outside-premise-later.md), [issue 63](https://github.com/omkarbhale/premise/issues/63)); a hand-edited existing software drifts from its record until then.
- **Hosting for other people, accounts and public deployment,** which wait until two real softwares have run through premise ([0178](decisions/0178-hosting-for-others-accounts-and-public-deployment-pushed-later.md)).
- **Finding out whether people want a software** stays outside premise ([0139](decisions/0139-finding-out-if-people-want-it-stays-out.md)).

## What waits on the owner

- The first real software through premise, and which one ([open questions](open-questions.md)).
- Whether the choices the assistant made for the owner stand ([open questions](open-questions.md)).
