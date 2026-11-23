# Decision records

Each record captures one decision that shaped premise: what prompted it, what was decided, who decided it, the reason given, the alternatives considered and why each was rejected, and what follows. They exist so that anyone can challenge a decision on its merits, and so that a later change of direction starts from the original reasoning rather than from memory ([0066](0066-documents-follow-the-aras-insight-layout.md)).

## Who decided

Every record has a **Decided by** line, so nothing inferred passes as the owner's:
- **The owner:** the call was the owner's, quoted in the owner's own words. Where the assistant proposed and the owner agreed, the record says so and quotes the agreement.
- **The assistant:** the assistant made the call; the record gives the owner's reaction exactly as recorded ([0032](0032-drop-the-review-page.md)).
- **The assistant, for the owner:** the owner asked the assistant to choose an answer to each question that was open with the owner ("choose for me", [0136](0136-open-questions-chosen-for-the-owner.md)). Each such record is open to the owner's correction (records 0137–0145).
- **The builders:** the owner did not make this choice. The builders made it, with the reason and the rejected alternatives. Records 0067–0110 are the choices the plan numbered P1–P44; records 0111 onward were made later, except 0124, 0126–0128, 0130–0136, 0149, 0166–0179, 0186 and 0249–0252, which are the owner's, and 0137–0145, chosen for the owner.

Words: the **owner** is the person premise is being made for; the **assistant** is the LLM agent the owner shaped premise with; the **builders** are the agents that build premise. Quotes are the speakers' own words. Where no reason was given, the record says "No reason was recorded."

## Numbers, sources and status

- Records 0001–0065 are the entries of the old `docs/decisions.md`, with the same numbers ([0112](0112-record-numbering-keeps-old-entry-numbers.md)). Entries 1–41 are dated 2026-11-20 and 42 onward 2026-11-21.
- Record 0066 is the owner's decision to lay the documents out this way.
- Records 0067–0110 are the old `docs/plan.md` choices: P*n* is record 0066 + *n* (P1 is 0067, P44 is 0110).
- Records 0111–0125 are builders' choices made while writing these documents, the specifications, the prompts and the skills; 0124 is the owner's ruling after the first test of the plan, and 0125 is the builders' choice from that test.
- Records 0126–0129 come from the conversation of 2026-11-21 in which the owner doubled back on the planning ([conversation record](../record/conversation-2026-11-21.md)): 0126–0128 are the owner's; 0129 is the builders' reading of 0128, open to the owner's correction.
- Records 0130–0136 are the owner's instruction of 2026-11-21 that started the build ([instruction record](../record/instruction-2026-11-21-build-starts.md)); 0137–0145 are the open questions the assistant chose for the owner on that instruction; 0146–0148 are the builders' choices made while building the foundation; 0149 is the owner's standing addition about suggestions left out of a task; 0150–0153 are the builders' choices made while building the agent runner and its tools; 0154–0158 are the builders' choices made while building the page and the page server; 0159–0161 are the builders' choices made while building the record keeper; 0162–0164 are the builders' choices made while building the runner and the reporter; 0165 is the builders' choice implementing the owner's agreement to show three phases; 0166–0179 are the owner's decisions of 2026-11-21 on scale, direction and order ([record](../record/scale-and-direction-2026-11-21.md), [assessment](../record/direction-assessment-2026-11-21.md)); 0181, 0182 and 0183 are the builders' choices made while building the line engine and the gate, and 0180 is the owner's correction that premise uses real agents by default; 0184 is the builders' choices made while building sizing of work, two of them chosen for the owner; 0185 is the builders' choices made while building intake in a thin form, three of them chosen for the owner; 0186 and 0187 are the builders' choices made while building Build, Check and Run, and the kept demos; 0188 is the owner's word on two points of taking on existing software, and 0189 the builders' choices made while building it, two of them chosen for the owner; 0190 is the builders' choices made while fixing the first visit; 0191 and 0192 are the builders' choices made while building the scope check, effort levels and proportion, and 0193 and 0194 are the builders' choices made while building the measures and learning from corrections, three points chosen for the owner, and 0195 is the owner's word that learning is two kinds; 0196 is the builders' choices made while building roles and taste claims, one point chosen for the owner; 0200 is the builders' choices made while building cost and the spending limit, two points chosen for the owner; 0240–0244 are the builders' choices made while finishing intake (GitHub issues, the feedback page, readings, duplicates and counts, and what a feedback sender sees of a joined item), four points chosen for the owner (numbered apart from the others, which were being written at the same time). 0220 is the builders' choices made while making approvals and verdicts truthful, the check rule chosen for the owner; 0245–0248 are the builders' choices made while validating (reports about one version, an interrupted floor action, an unfinished take-on, "sent back to Why"), each chosen for the owner; 0249–0252 are the owner's words of the later conversation of 2026-11-21 on making premise ([record](../record/later-conversation-2026-11-21.md)); 0260 is the owner's word and the builders' choices on building the real GitHub step, three points chosen for the owner (numbered apart, as other records were being written at the same time); 0270 is the builders' choices made while fixing premise's own cost and attention figures, four points chosen for the owner (numbered apart again). 0280 is the builders' choices made while fixing the Run step and the report's headline after the first real run, one point chosen for the owner (numbered apart, for the same reason); 0275 and 0276 are the builders' choices made while fixing the record keeper and the agents' tools after the first real run, one point chosen for the owner (numbered apart, as other records were being written at the same time). 0290 is the assistant's choices for the owner on pausing and resuming the whole of premise, stopping cleanly and coming back (numbered apart, for the same reason). 0273–0275 are the builders' choices fixing how a change from intake is planned, built and asked about, and how a missing structured answer is asked for again, after the owner's first real run; 0274 is chosen for the owner from vision principle 6 (numbered apart, as other records were being written at the same time).
- Every record has a **Source** line. For records 0001–0040 it points into the [conversation record](../record/conversation-2026-11-20.md) and, where used, the [shaping notes](../record/shaping-notes-2026-11-20.md) and the [scope page draft](../record/scope-page-draft-0.1.html). Records 0041–0065 quote the owner from the assistant's notes of the 2026-11-21 conversations, which are not kept in this repository. The old single files are in git history at commit f62615a.
- **Status** is Accepted, Superseded by NNNN, or Partly superseded by NNNN (naming the part). A record is never edited to reverse its decision: a new record supersedes it and both are kept. The new record carries a "Supersedes" or "Partly supersedes" line.
- **Scope** says where a decision holds: *The product* (premise as envisioned), *The plan* (premise as planned, across milestones), *Milestone N*, or *Making premise* (how premise itself is made).

Superseded so far:
- [0038](0038-premise-stands-alone.md) by [0063](0063-premise-may-depend-on-other-tools.md): premise may depend on other tools; nobody has to use another tool alongside it.
- [0041](0041-intake-can-be-held.md) by [0062](0062-intake-goes-in-normally.md): intake goes in normally; only what needs holding is held.
- [0058](0058-cost-tracking-inside-premise.md) by [0064](0064-cost-and-spending-limit-from-usage-ledger.md): cost and the spending limit come from usage-ledger.
- [0033](0033-answers-to-the-ten-assumptions.md), item 8, partly by [0049](0049-any-kind-of-software.md): no first kind of software.
- [0045](0045-a-link-per-person-no-accounts.md), the link per person, partly by [0065](0065-one-open-session.md): one open session; no accounts still stands.
- [0060](0060-first-software-does-not-hold-up-premise.md) and [0110](0110-two-sample-softwares.md), partly by [0127](0127-first-software-is-one-the-owner-needs.md): the owner's first software goes through premise as early as possible; the samples stay as extra proof.
- [0087](0087-agents-run-confined.md), the container fallback, partly by [0125](0125-the-claude-code-sandbox-is-the-confinement.md): the sandbox is the confinement; every agent still runs confined.
- [0061](0061-nothing-built-until-the-owner-says.md) by [0130](0130-the-build-starts-and-covers-all-of-premise.md): the build has started and covers the whole of premise.
- [0040](0040-fast-i-merge.md) and [0052](0052-fast-i-merge-reconfirmed.md), partly by [0131](0131-changes-go-through-the-validation-pipeline.md): changes go through the no-mistakes validation pipeline; the assistant still merges.
- [0064](0064-cost-and-spending-limit-from-usage-ledger.md), the prerequisite, partly by [0133](0133-usage-ledger-is-mocked-until-it-exists.md): usage-ledger's output is mocked until it exists.
- [0076](0076-own-claude-code-configuration.md) by [0140](0140-the-owners-existing-claude-code-login.md): the owner's existing Claude Code login by default; the folder is a setting.
- [0129](0129-builders-reading-of-effort-and-milestone-waits.md), where priority is built, partly by [0138](0138-priority-is-a-field-from-milestone-1.md): priority is a field from milestone 1.
- [0034](0034-first-proof-new-software.md), that existing software follows once the line works, partly by [0171](0171-existing-software-much-earlier-in-a-thin-form.md) and [0179](0179-the-roadmap-is-reordered.md): existing software comes much earlier, in a thin form.
- [0033](0033-answers-to-the-ten-assumptions.md), item 7, partly by [0178](0178-hosting-for-others-accounts-and-public-deployment-pushed-later.md): other people setting premise up, hosting and accounts are pushed until two real softwares have run.
- [0220](0220-approvals-and-verdicts-tell-the-truth.md), point 9, partly by [0280](0280-the-run-step-builds-first-and-the-headline-tells-the-truth.md): the report's first line never says "Works" when the latest start failed or an item was met only on made-up data.

How the decisions fit together is in the [architecture overview](../architecture/overview.md); the order of building is in the [roadmap](../product/roadmap.md); what is still open is in [open questions](../open-questions.md).

## Index

### What premise is

| # | Decision | Decided by | Status |
| --- | --- | --- | --- |
| 0001 | [Build the factory as a new product](0001-build-the-factory-as-a-new-product.md) | owner | Accepted |
| 0002 | [Rethink everything, and decide what is in and out](0002-rethink-everything.md) | owner | Accepted |
| 0003 | [Scope: from ideas and decisions to properly built software, with intake](0003-scope-ideas-to-built-software-with-intake.md) | owner | Accepted |
| 0004 | [The operator relationship is two-way](0004-two-way-with-the-operator.md) | owner | Accepted |
| 0005 | [Implementation is free](0005-implementation-is-free.md) | owner | Accepted |
| 0010 | [The whole line is the product](0010-the-whole-line-is-the-product.md) | owner | Accepted |
| 0017 | [The line ends at running software](0017-the-line-ends-at-running-software.md) | owner | Accepted |
| 0018 | [Existing software too, with automatic intake](0018-existing-software-and-automatic-intake.md) | owner | Accepted |
| 0021 | [Vocabulary: product and software](0021-vocabulary-product-and-software.md) | owner | Accepted |
| 0024 | [Do not adopt other tools unless they match the vision](0024-no-other-tools-unless-they-match-the-vision.md) | owner | Accepted |
| 0031 | [The product is general](0031-the-product-is-general.md) | owner | Accepted |
| 0033 | [Answers to the ten assumptions](0033-answers-to-the-ten-assumptions.md) | owner | Partly superseded by [0049](0049-any-kind-of-software.md): item 8's "The first version proves itself on one kind the owner chooses"; and by [0178](0178-hosting-for-others-accounts-and-public-deployment-pushed-later.md): item 7's "sooner than fully deferred" |
| 0035 | [The vision states the vision only](0035-the-vision-states-the-vision-only.md) | owner | Accepted |
| 0036 | [Finding out whether real people want the software is out](0036-finding-out-if-people-want-it-is-out.md) | owner | Accepted |
| 0037 | [Name: premise](0037-name-premise.md) | owner | Accepted |
| 0038 | [premise stands alone](0038-premise-stands-alone.md) | owner | Superseded by [0063](0063-premise-may-depend-on-other-tools.md) |
| 0049 | [Any kind of software; no first kind](0049-any-kind-of-software.md) | owner | Accepted |
| 0057 | [The vision stays "any software"](0057-vision-stays-any-software.md) | owner | Accepted |
| 0063 | [Nobody has to use another tool alongside premise; premise may depend on other tools](0063-premise-may-depend-on-other-tools.md) | owner | Accepted |
| 0126 | [What is being built is confirmed: eight points, and the problem statement as written](0126-what-is-being-built-confirmed.md) | owner | Accepted |
| 0128 | [Per software, the owner decides how much effort it gets, and can set milestones to wait after](0128-effort-per-software-and-milestone-waits.md) | owner | Accepted |
| 0132 | [What is sensible to configure in premise is configurable](0132-sensible-things-are-configurable.md) | owner | Accepted |
| 0135 | [premise is usable by someone who has not read the user guide](0135-the-experience-works-without-the-guide.md) | owner | Accepted |
| 0139 | [Finding out whether real people want the software stays out, as written](0139-finding-out-if-people-want-it-stays-out.md) | assistant, for the owner | Accepted |
| 0166 | [premise is for any software, of any scale](0166-any-software-of-any-scale.md) | owner | Accepted |
| 0167 | [premise adapts at runtime to the software](0167-premise-adapts-at-runtime-to-the-software.md) | owner | Accepted |
| 0143 | [The name stays premise](0143-the-name-stays-premise.md) | assistant, for the owner | Accepted |

### Principles: LLMs, people and mistakes

| # | Decision | Decided by | Status |
| --- | --- | --- | --- |
| 0006 | [If an LLM can do it, an LLM does it; return on effort decides](0006-llm-does-what-it-can.md) | owner | Accepted |
| 0007 | [If an LLM cannot reliably do it, it does not decide it](0007-llm-does-not-decide-what-it-cannot.md) | owner | Accepted |
| 0008 | [Target operator: a person who knows what the software is for](0008-operator-knows-the-purpose.md) | owner | Accepted |
| 0009 | [Everyone needed is a user of the product](0009-everyone-needed-is-a-user.md) | owner | Accepted |
| 0011 | [The product is opinionated about the conversation and its records](0011-opinionated-about-conversation-and-records.md) | owner | Accepted |
| 0013 | [The mistake that matters is a mismatch of intent](0013-mismatch-of-intent-is-the-mistake-that-matters.md) | owner | Accepted |
| 0014 | [Guard against further sources of big mistakes](0014-guard-against-further-big-mistakes.md) | owner | Accepted |
| 0022 | [People can put their own taste into the software](0022-people-can-put-in-their-taste.md) | owner | Accepted |
| 0027 | [People's attention is what the product spends least of](0027-spend-least-of-peoples-attention.md) | owner | Accepted |
| 0029 | [Lists over long paragraphs](0029-lists-over-long-paragraphs.md) | owner | Accepted |
| 0169 | [A first pass need not be perfect: return over perfection](0169-a-first-pass-need-not-be-perfect.md) | owner | Accepted |

### The record

| # | Decision | Decided by | Status |
| --- | --- | --- | --- |
| 0025 | [Two kinds of record](0025-two-kinds-of-record.md) | owner | Accepted |
| 0026 | [A description of what exists is not maintained](0026-no-maintained-description-of-what-exists.md) | owner | Accepted |
| 0080 | [The lasting record lives in the software's repository, in premise/](0080-record-in-the-softwares-repository.md) | builders | Accepted |
| 0081 | [Nothing about real people goes into a software's repository](0081-nothing-about-people-in-the-repository.md) | builders | Accepted |
| 0082 | [The record is Markdown, one item per line with a stable ID](0082-record-as-markdown-with-ids.md) | builders | Accepted |
| 0083 | [Every commit carries a Premise-Trace trailer](0083-trace-trailer-on-every-commit.md) | builders | Accepted |
| 0084 | [Who has the last word](0084-who-has-the-last-word.md) | builders | Accepted |
| 0121 | [Best-guess links from old code live in premise/recovered-trace.md](0121-recovered-trace-file.md) | builders | Accepted |

### The line

| # | Decision | Decided by | Status |
| --- | --- | --- | --- |
| 0019 | [Existing software goes through the same line, with people](0019-existing-software-through-the-same-line.md) | owner | Accepted |
| 0020 | [When the product says back what it understood](0020-when-to-say-back.md) | owner | Accepted |
| 0023 | [Looking at what already exists is a step of the line](0023-looking-at-what-exists.md) | owner | Accepted |
| 0028 | [The say-back is a list of assumptions to strike out](0028-say-back-as-assumptions-to-strike.md) | owner | Accepted |
| 0032 | [Drop the review page for a short list of assumptions](0032-drop-the-review-page.md) | assistant | Accepted |
| 0034 | [First proof, and existing software after](0034-first-proof-new-software.md) | owner | Partly superseded by [0171](0171-existing-software-much-earlier-in-a-thin-form.md): that existing software follows once the line works |
| 0085 | [Each stage has an effort budget sized to the software](0085-stage-effort-budgets.md) | builders | Accepted |
| 0117 | [Three size classes set the stage budgets](0117-size-classes-set-stage-budgets.md) | builders | Accepted |
| 0118 | [How chat messages are routed](0118-how-chat-messages-are-routed.md) | builders | Accepted |
| 0129 | [The builders' reading of effort per software and milestone waits](0129-builders-reading-of-effort-and-milestone-waits.md) | builders | Accepted, as the builders' reading; open to the owner's correction; partly superseded by [0138](0138-priority-is-a-field-from-milestone-1.md): where priority is built |
| 0168 | [Any piece of work goes through the same line, at its own size](0168-any-piece-of-work-goes-through-the-same-line-at-its-own-size.md) | owner | Accepted |
| 0170 | [What may be split is decided by strong prompting](0170-what-may-be-split-is-decided-by-strong-prompting.md) | owner | Accepted |
| 0171 | [Existing software comes much earlier, in a thin form](0171-existing-software-much-earlier-in-a-thin-form.md) | owner | Accepted |
| 0174 | [The page shows three phases, with the eleven stages as detail](0174-the-page-shows-three-phases.md) | owner | Accepted |
| 0138 | [Priority between softwares is a field on each software from milestone 1](0138-priority-is-a-field-from-milestone-1.md) | assistant, for the owner | Accepted |

### Build, independent check and run

| # | Decision | Decided by | Status |
| --- | --- | --- | --- |
| 0030 | [The check is independent of the builder](0030-independent-check.md) | owner | Accepted |
| 0086 | [The builder works in its own working copy, on a branch per change](0086-working-copy-and-branch-per-change.md) | builders | Accepted |
| 0088 | [Turn and time limits; the same failure three times stops the task](0088-turn-and-time-limits.md) | builders | Accepted |
| 0089 | [The checker is a fresh session that never sees the builder's account](0089-checker-in-a-fresh-session.md) | builders | Accepted |
| 0090 | [The checker's scenarios live where builders cannot read them](0090-scenarios-out-of-the-builders-reach.md) | builders | Accepted |
| 0091 | [The checker uses the same provider, a fresh session, the strongest tier](0091-checker-same-provider-strongest-tier.md) | builders | Accepted |
| 0093 | [After a pass, the server merges and pushes; no GitHub pull requests](0093-server-merges-no-pull-requests.md) | builders | Accepted |
| 0141 | [Tests use local git remotes only; creating a real GitHub repository stays behind the gate](0141-github-repositories-in-tests-and-behind-the-gate.md) | assistant, for the owner | Accepted |
| 0176 | [The checker on a different model from the builder: later](0176-the-checker-on-a-different-model-later.md) | owner | Accepted |
| 0177 | [Tolerating commits made outside premise: later](0177-tolerating-commits-made-outside-premise-later.md) | owner | Accepted |
| 0115 | [Taste proposals are built on a throwaway branch and captured by the server](0115-taste-prototypes-on-a-throwaway-branch.md) | builders | Partly superseded by [0196](0196-roles-and-taste-in-one-session.md): for now a proposal is described options written by the planner |
| 0122 | [Check scenarios are written from the record before the build](0122-scenarios-written-before-the-build.md) | builders | Accepted |

### Intake, reporting and taste

| # | Decision | Decided by | Status |
| --- | --- | --- | --- |
| 0012 | [Reporting is part of the line, with a product default](0012-reporting-with-a-product-default.md) | owner | Accepted |
| 0041 | [Intake can be held](0041-intake-can-be-held.md) | owner | Superseded by [0062](0062-intake-goes-in-normally.md) |
| 0062 | [Intake goes in normally; only what needs holding is held](0062-intake-goes-in-normally.md) | owner | Accepted |
| 0094 | [A triager agent reads every intake item against the record](0094-triager-reads-every-item.md) | builders | Accepted |
| 0095 | [Held means only items that mean little alone and something together](0095-what-is-held.md) | builders | Accepted |
| 0096 | [When held items are read together](0096-when-held-items-are-read.md) | builders | Accepted |
| 0097 | [Reports are built from recorded facts only](0097-reports-from-recorded-facts.md) | builders | Accepted |
| 0098 | [A short report each time a change reaches running](0098-report-when-a-change-reaches-running.md) | builders | Accepted |
| 0099 | [Notices in the session, the tab count and browser notifications](0099-notices-in-the-session.md) | builders | Accepted |
| 0102 | [A proposal is shown before a claimed area is built](0102-taste-proposals-before-building.md) | builders | Accepted |
| 0172 | [premise measures its own return, and shows it in reports](0172-premise-measures-its-own-return.md) | owner | Accepted |
| 0173 | [premise learns from corrections](0173-premise-learns-from-corrections.md) | owner | Accepted |
| 0123 | [The reporter drafts release notes from met items only](0123-reporter-drafts-release-notes.md) | builders | Accepted |

### The floor, the gate and security

| # | Decision | Decided by | Status |
| --- | --- | --- | --- |
| 0015 | [Some things are never traded for speed (accepted in principle)](0015-a-floor-never-traded-for-speed.md) | owner | Accepted |
| 0056 | [What is never traded for speed](0056-what-is-on-the-floor.md) | owner | Accepted |
| 0087 | [Every agent runs confined](0087-agents-run-confined.md) | builders | Partly superseded by [0125](0125-the-claude-code-sandbox-is-the-confinement.md): the container fallback |
| 0125 | [The Claude Code sandbox is the confinement; no container fallback on the owner's machine](0125-the-claude-code-sandbox-is-the-confinement.md) | builders | Accepted |
| 0092 | [Security defaults for every software](0092-security-defaults.md) | builders | Accepted |
| 0100 | [Floor actions](0100-floor-actions.md) | builders | Accepted |
| 0101 | [The gate asks in the session, under the role whose call it is](0101-the-gate-asks-in-the-session.md) | builders | Accepted |
| 0116 | [Content from outside the session is data, never instructions](0116-outside-content-is-data.md) | builders | Accepted |
| 0119 | [The feedback page has its own link, which can only submit feedback](0119-feedback-page-has-its-own-link.md) | builders | Accepted |
| 0120 | [A software's secrets are written by a person; premise never holds their values](0120-secrets-stay-out-of-premise.md) | builders | Accepted |
| 0142 | [The setup check names bubblewrap and socat; real agents do not start without them](0142-setup-check-names-bubblewrap-and-socat.md) | assistant, for the owner | Accepted |

### Where premise and the software live, and how people reach premise

| # | Decision | Decided by | Status |
| --- | --- | --- | --- |
| 0043 | [premise runs on the owner's machine first](0043-runs-on-the-owners-machine-first.md) | owner | Accepted |
| 0044 | [One browser page](0044-one-browser-page.md) | owner | Accepted |
| 0045 | [A link per person, no accounts](0045-a-link-per-person-no-accounts.md) | owner | Partly superseded by [0065](0065-one-open-session.md): the link per person; "No accounts" stands |
| 0051 | [Each software in its own repository](0051-each-software-in-its-own-repository.md) | owner | Accepted |
| 0059 | [Visibility of each software's repository](0059-repository-visibility-per-software.md) | owner | Accepted |
| 0065 | [One session where everything is open, as if one person does everything](0065-one-open-session.md) | owner | Accepted |
| 0076 | [premise runs Claude Code with its own configuration folder](0076-own-claude-code-configuration.md) | builders | Superseded by [0140](0140-the-owners-existing-claude-code-login.md) |
| 0140 | [premise uses the owner's existing Claude Code login; the configuration folder is a setting](0140-the-owners-existing-claude-code-login.md) | assistant, for the owner | Accepted |
| 0077 | [GitHub through the machine's existing GitHub CLI login, server only](0077-github-through-existing-cli-login.md) | builders | Accepted |
| 0078 | [The session link carries a long random token; Host and Origin checked](0078-session-token-and-header-checks.md) | builders | Accepted |
| 0079 | [premise listens on localhost only](0079-localhost-only.md) | builders | Accepted |
| 0144 | [Reaching premise from other machines stays off by default](0144-reach-from-other-machines-stays-off.md) | assistant, for the owner | Accepted |

### The server, agents and models

| # | Decision | Decided by | Status |
| --- | --- | --- | --- |
| 0046 | [Claude through the owner's subscription first](0046-claude-through-the-owners-subscription.md) | owner | Accepted |
| 0047 | [premise is written in TypeScript](0047-typescript.md) | owner | Accepted |
| 0067 | [One Node.js process holds every module; agents are its child processes](0067-one-process-agents-as-children.md) | builders | Accepted |
| 0068 | [The server uses Fastify on the current Node.js LTS](0068-fastify-on-node-lts.md) | builders | Accepted |
| 0069 | [The page is React, built with Vite, served as static files](0069-react-and-vite-page.md) | builders | Accepted |
| 0070 | [Page and server talk by HTTP requests plus server-sent events](0070-http-and-server-sent-events.md) | builders | Accepted |
| 0071 | [Agents are Claude Code run headless, as child processes](0071-headless-claude-code-agents.md) | builders | Accepted |
| 0072 | [premise keeps its own state in SQLite in a data folder](0072-sqlite-state.md) | builders | Accepted |
| 0073 | [Agent tools over MCP, with a token per session](0073-mcp-tools-with-session-tokens.md) | builders | Accepted |
| 0074 | [At most two agent sessions at once by default](0074-two-agent-sessions-at-once.md) | builders | Accepted |
| 0075 | [premise's code is one package in this repository](0075-one-package.md) | builders | Accepted |
| 0103 | [The owner's subscription only through Claude Code, for the owner's own use](0103-subscription-only-for-the-owner.md) | builders | Accepted |
| 0124 | [Unattended use of Claude Code on the owner's subscription is allowed](0124-unattended-claude-code-on-the-subscription-is-allowed.md) | owner | Accepted |
| 0104 | [Model tier by role](0104-model-tier-by-role.md) | builders | Accepted |
| 0105 | [Models named by tier aliases, not pinned versions](0105-tier-aliases.md) | builders | Accepted |
| 0106 | [What is set per software, and what stays with premise](0106-per-software-and-with-premise.md) | builders | Accepted |
| 0107 | [The agent runner is the only part that knows the runtime and provider](0107-one-part-knows-the-runtime.md) | builders | Accepted |
| 0113 | [Nine agent roles: the plan's seven plus reviewer and reader](0113-agent-roles.md) | builders | Accepted |
| 0114 | [Prompts and skills ship as files; skills are appended in full to the role prompt](0114-prompts-and-skills-as-files.md) | builders | Accepted |
| 0134 | [The owner's Claude login is used only when strictly necessary, on Haiku at low effort](0134-the-owners-claude-login-only-when-strictly-necessary.md) | owner | Accepted; clarified by [0180](0180-premise-uses-real-agents-by-default.md): it is about making premise |
| 0145 | [No API key is used](0145-no-api-key.md) | assistant, for the owner | Accepted |
| 0146 | [Configuration is one JSON file in the data folder, checked against one schema](0146-configuration-in-one-json-file.md) | builders | Accepted |
| 0147 | [SQLite through Node.js's built-in module](0147-sqlite-through-nodes-built-in-module.md) | builders | Accepted |
| 0148 | [A scripted agent, driven by a script file, stands in for Claude in every test](0148-scripted-agent-driven-by-a-script-file.md) | builders | Accepted |
| 0150 | [Agent tools are served over MCP's plain HTTP form by premise itself; session tokens live in memory](0150-agent-tools-over-plain-http-mcp-tokens-in-memory.md) | builders | Accepted |
| 0151 | [premise chooses each session's id, and carries a cut-off session on in the same working copy](0151-session-ids-chosen-by-premise-and-cut-off-sessions-carried-on.md) | builders | Accepted |
| 0152 | [Until their module is built, agent tools record the call and say nothing more comes of it](0152-tools-of-unbuilt-modules-record-and-say-so.md) | builders | Accepted |
| 0153 | [A session's confinement names the other folders that exist when it starts](0153-confinement-names-the-folders-that-exist-at-start.md) | builders | Accepted |
| 0154 | [A stand-in line walks the page through the eleven stages until the line engine exists](0154-a-stand-in-line-until-the-line-engine-exists.md) | builders | Partly superseded by [0183](0183-how-the-line-engine-is-built.md): the line engine replaces it up to Plan; the later stages stay a stand-in |
| 0155 | [The page is readable at phone width, in light and dark](0155-the-page-is-readable-at-phone-width.md) | builders | Accepted |
| 0156 | [The page is tested with Testing Library, plus one headless browser test with screenshots](0156-page-tests-with-testing-library-and-one-browser-test.md) | builders | Accepted |
| 0157 | [Browser notifications are offered on the page, not asked for on first open](0157-browser-notifications-are-offered-not-asked.md) | builders | Accepted |
| 0158 | [The event stream reads the events table, and the link can be renewed from the terminal](0158-the-event-stream-reads-the-events-table.md) | builders | Accepted |

### Cost and the spending limit

| # | Decision | Decided by | Status |
| --- | --- | --- | --- |
| 0016 | [Coarse cost tracking is in](0016-coarse-cost-tracking.md) | owner | Accepted |
| 0048 | [A spending limit](0048-a-spending-limit.md) | owner | Accepted |
| 0058 | [Cost tracking inside premise](0058-cost-tracking-inside-premise.md) | owner | Superseded by [0064](0064-cost-and-spending-limit-from-usage-ledger.md) |
| 0064 | [Cost tracking and the spending limit come from usage-ledger](0064-cost-and-spending-limit-from-usage-ledger.md) | owner | Partly superseded by [0133](0133-usage-ledger-is-mocked-until-it-exists.md): the prerequisite |
| 0133 | [usage-ledger's output is mocked until it exists, and the page says so](0133-usage-ledger-is-mocked-until-it-exists.md) | owner | Accepted |

### Making premise

| # | Decision | Decided by | Status |
| --- | --- | --- | --- |
| 0039 | [The repository: public, on the owner's GitHub](0039-public-repository.md) | owner | Accepted |
| 0040 | [How changes to premise ship: "Fast, I merge"](0040-fast-i-merge.md) | owner | Partly superseded by [0131](0131-changes-go-through-the-validation-pipeline.md): no automated run |
| 0042 | [Plan top-down, and first settle what needs the owner](0042-plan-top-down-settle-owner-calls-first.md) | owner | Accepted |
| 0050 | [The first software is the owner's pick](0050-first-software-is-the-owners-pick.md) | owner | Accepted |
| 0052 | [How changes to premise ship, reconfirmed](0052-fast-i-merge-reconfirmed.md) | owner | Partly superseded by [0131](0131-changes-go-through-the-validation-pipeline.md): no automated run |
| 0053 | [When work stops for the owner](0053-when-work-stops-for-the-owner.md) | owner | Accepted |
| 0054 | [Reports to the owner](0054-reports-to-the-owner.md) | owner | Accepted |
| 0055 | [Licence: all rights reserved](0055-all-rights-reserved.md) | owner | Accepted |
| 0060 | [The first software does not hold up building premise](0060-first-software-does-not-hold-up-premise.md) | owner | Partly superseded by [0127](0127-first-software-is-one-the-owner-needs.md): that the first software does not hold up building premise |
| 0127 | [The first software through premise is one the owner needs, as early as possible](0127-first-software-is-one-the-owner-needs.md) | owner | Accepted |
| 0137 | [The first software through premise is usage-ledger](0137-first-software-is-usage-ledger.md) | assistant, for the owner | Partly superseded by [0180](0180-premise-uses-real-agents-by-default.md): the first real run does not wait for a separate permission |
| 0061 | [The whole plan is committed; nothing is built until the owner says to start](0061-nothing-built-until-the-owner-says.md) | owner | Superseded by [0130](0130-the-build-starts-and-covers-all-of-premise.md) |
| 0130 | [The build starts, and covers the whole of premise](0130-the-build-starts-and-covers-all-of-premise.md) | owner | Accepted |
| 0175 | [premise is used for real as soon as milestone 1 runs](0175-premise-is-used-for-real-as-soon-as-milestone-1-runs.md) | owner | Accepted |
| 0178 | [Hosting for other people, accounts and public deployment are pushed until two real softwares have run](0178-hosting-for-others-accounts-and-public-deployment-pushed-later.md) | owner | Accepted |
| 0249 | [The owner's requests during the build are intake: sized and slotted, never at the cost of planning's structure](0249-the-owners-requests-during-the-build-are-intake-and-never-cost-structure.md) | owner | Accepted |
| 0250 | [Copies of work that lose nothing may be cleaned up](0250-copies-that-lose-nothing-may-be-cleaned-up.md) | owner | Accepted |
| 0251 | [Three or four workers at a time while building premise](0251-three-or-four-workers-at-a-time-while-building.md) | owner | Accepted |
| 0252 | [The name of the assistant's tooling is not written in the repository](0252-the-assistants-tooling-is-not-named-in-the-repository.md) | owner | Accepted |
| 0179 | [The roadmap is reordered](0179-the-roadmap-is-reordered.md) | owner | Accepted |
| 0149 | [Suggestions left out of a task go in as GitHub issues](0149-left-out-suggestions-become-github-issues.md) | owner | Accepted |
| 0159 | [How the record keeper keeps the record, and the commits that carry it](0159-how-the-record-keeper-is-built.md) | builders | Accepted |
| 0160 | [A software's milestones are record items; its priority stays in the database](0160-milestones-are-record-items.md) | builders | Accepted |
| 0161 | [Creating a GitHub repository is an interface with a step that is not approved yet](0161-github-repository-step-not-approved.md) | builders | Superseded by [0260](0260-the-real-github-step-is-built-and-each-use-is-asked.md) |
| 0162 | [How the runner starts, keeps up and stops software](0162-how-the-runner-is-built.md) | builders | Accepted |
| 0163 | [Running software is confined with bubblewrap](0163-running-software-is-confined-with-bubblewrap.md) | builders | Accepted |
| 0164 | [How the reporter builds a report, and what counts as a fact](0164-how-the-reporter-is-built.md) | builders | Accepted |
| 0165 | [The page shows three phases, with the eleven stages as detail](0165-the-page-shows-three-phases.md) | builders (owner agreed) | Accepted |
| 0180 | [premise works with real agents by default; the login limit is for making premise](0180-premise-uses-real-agents-by-default.md) | owner | Accepted |
| 0181 | [The line works on work items; today each software is one](0181-the-line-works-on-work-items.md) | builders | Accepted |
| 0182 | [How the gate asks, approves and acts; creating any GitHub repository is gated](0182-how-the-gate-is-built.md) | builders; points 5 to 7 for the owner | Partly superseded by [0220](0220-approvals-and-verdicts-tell-the-truth.md): what an approved GitHub step says, and standing approvals scoped to one kind of action |
| 0183 | [How the line engine runs Why to Plan in their thinnest form](0183-how-the-line-engine-is-built.md) | builders | Accepted |
| 0184 | [How sizing of work is built: a sizer per piece, parts one after another, a check of the whole](0184-how-sizing-of-work-is-built.md) | builders; two points chosen for the owner | Accepted |
| 0185 | [How intake in a thin form is built: triage per item, work on the same line, status in plain words](0185-how-intake-in-a-thin-form-is-built.md) | builders; three points chosen for the owner | Accepted |
| 0186 | [How Build, Check and Run are built; what a check that cannot pass leads to](0186-how-build-check-and-run-are-built.md) | builders; points 9 and 10 for the owner | Partly superseded by [0220](0220-approvals-and-verdicts-tell-the-truth.md): when a check has passed |
| 0245 | [A report is about one named version, and a check counts only for that version](0245-reports-are-about-one-named-version.md) | builders; chosen for the owner | Accepted |
| 0187 | [The kept demos, and one real run with real agents](0187-kept-demos-and-one-real-run.md) | builders | Accepted |
| 0188 | [An existing software's record goes into its repository only on approval, and hand edits stay later](0188-existing-softwares-record-and-hand-edits.md) | owner | Accepted |
| 0189 | [How taking on existing software is built: a copy, a recovery job, one strike-out pass, a gated branch](0189-how-taking-on-existing-software-is-built.md) | builders; two points chosen for the owner | Accepted |
| 0190 | [How the first visit is made clear](0190-how-the-first-visit-is-made-clear.md) | builders | Accepted |
| 0191 | [A scope check after What, an effort level per software, and the first milestone for what was asked](0191-scope-check-effort-and-milestones.md) | the owner (quoted); the builders' reading | Accepted |
| 0192 | [Effort in proportion to what was asked: prompts, plan checks, triage and measures](0192-effort-in-proportion-to-what-was-asked.md) | builders | Accepted; point 5's What confirm partly superseded by [0274](0274-a-change-asks-at-most-one-question.md) |
| 0193 | [How the measures are built: from recorded events, attention while the page is in front of someone, "not enough yet"](0193-how-the-measures-are-built.md) | builders; one point chosen for the owner | Accepted |
| 0194 | [How learning from corrections is built: one destination each, read by the triager, short lists in briefs](0194-how-learning-from-corrections-is-built.md) | builders; two points chosen for the owner | Accepted |
| 0195 | [Two kinds of learning: premise adapting, and premise itself improving](0195-two-kinds-of-learning.md) | owner (quoted), builders' reading | Accepted |
| 0196 | [How roles and taste claims are built in the one session: labels, no label for the operator alone, described proposals before the build, real-world acts as steps](0196-roles-and-taste-in-one-session.md) | builders; one point chosen for the owner | Accepted |
| 0240 | [How a software's GitHub issues are read and answered: an interface with a fixture, comments through the gate](0240-how-github-issues-are-read-and-answered.md) | builders; one point chosen for the owner | Accepted |
| 0241 | [How the feedback page is built: a plain page, a receipt, a kept token, a limit per hour](0241-how-the-feedback-page-is-built.md) | builders; two points chosen for the owner | Accepted |
| 0242 | [Readings name the items behind each line, and the operator decides each line](0242-readings-name-their-items-and-the-operator-decides-each-line.md) | builders; one point chosen for the owner | Accepted |
| 0243 | [Duplicates across sources are merged, and items are counted per route](0243-duplicates-across-sources-and-counts-per-route.md) | builders | Accepted |
| 0244 | [A feedback sender sees only their own words and a plain status](0244-a-feedback-sender-sees-only-their-own-words-and-a-plain-status.md) | builders | Accepted |
| 0197 | [How looking after several softwares at once is built: shared sessions with a fair wait, the summary, pause and archive](0197-how-several-softwares-at-once-is-built.md) | builders; three points chosen for the owner | Accepted |
| 0200 | [How cost and the spending limit are built: sessions read from the queue's records, budgets as a share or an amount, three answers to an overrun, measured counts beside mocked figures](0200-how-cost-and-the-spending-limit-are-built.md) | builders; two points chosen for the owner | Accepted |
| 0260 | [The real GitHub step is built, and each use is asked through the gate](0260-the-real-github-step-is-built-and-each-use-is-asked.md) | the owner (quoted); builders; three points chosen for the owner | Accepted |
| 0270 | [premise's own cost and attention figures, and asks that cost attention honestly](0270-premises-own-figures-and-asks-that-cost-attention-honestly.md) | builders; four points chosen for the owner | Accepted |
| 0275 | [The commit hook puts the trace line last, and a refusal says what is wrong](0275-the-commit-hook-puts-the-trace-line-last.md) | builders | Accepted |
| 0276 | [The record keeper lands each decision once, and the agents' tools say how to use them](0276-the-record-keeper-lands-each-decision-once.md) | builders; one point chosen for the owner | Accepted |
| 0273 | [A change is planned and built as a change, never as the software's whole plan again](0273-a-change-is-planned-and-built-as-a-change.md) | builders; two points chosen for the owner | Accepted |
| 0274 | [A change asks at most one question before it is built, and otherwise tells](0274-a-change-asks-at-most-one-question.md) | the assistant for the owner, from vision principle 6 | Accepted |
| 0275 | [An agent that ends without its structured answer is asked once more, and lists sent as text are read](0275-an-agent-without-its-answer-is-asked-once-more.md) | builders; one point chosen for the owner | Accepted |
| 0220 | [Approvals and verdicts tell the truth: one card per kind of action, what really happens, "passed" only when every must item is met](0220-approvals-and-verdicts-tell-the-truth.md) | builders; the check rule chosen for the owner | Partly superseded by [0280](0280-the-run-step-builds-first-and-the-headline-tells-the-truth.md) (point 9) |
| 0280 | [The Run step builds first, and the report's headline tells the truth: build lines in run.md, a failed start holds at Run and goes back to Build once, never "Works" on a failed start or on made-up data](0280-the-run-step-builds-first-and-the-headline-tells-the-truth.md) | builders; one point chosen for the owner | Accepted |
| 0290 | [Pausing and resuming the whole of premise, stopping cleanly with Ctrl+C or `premise stop`, and coming back: the paused state survives a restart, one line says what was picked up, the same link is a setting, a sleeping laptop's dead sessions are restarted](0290-pausing-and-resuming-the-whole-of-premise.md) | the assistant, for the owner | Accepted |
| 0246 | [An approved floor action that never finished is marked failed at start-up, and premise never repeats it](0246-an-approved-action-that-never-finished-is-failed-at-start-up.md) | builders; chosen for the owner | Accepted |
| 0247 | [A take-on that is still copying, or whose copy failed, takes nothing in](0247-a-take-on-that-is-still-copying-or-failed-takes-nothing-in.md) | builders; chosen for the owner | Accepted |
| 0248 | ["Sent back to Why" is recorded only once it has started](0248-sent-back-to-why-is-recorded-only-once-it-has-started.md) | builders; chosen for the owner | Accepted |
| 0131 | [Changes to premise go through the no-mistakes validation pipeline; the assistant still merges](0131-changes-go-through-the-validation-pipeline.md) | owner | Accepted |
| 0136 | [The assistant chooses the open questions for the owner, and records each choice](0136-open-questions-chosen-for-the-owner.md) | owner | Accepted |
| 0066 | [premise's documents follow aras-insight's layout](0066-documents-follow-the-aras-insight-layout.md) | owner | Accepted |
| 0108 | [Demos use a scripted operator](0108-scripted-operator-for-demos.md) | builders | Accepted |
| 0109 | [Unit tests with Vitest; each milestone's demo kept as a scripted run](0109-vitest-and-kept-demos.md) | builders | Accepted |
| 0110 | [Two small softwares of different kinds shown running in milestone 1](0110-two-sample-softwares.md) | builders | Partly superseded by [0127](0127-first-software-is-one-the-owner-needs.md): the step after the samples; the samples stay as extra proof |
| 0111 | [VISION.md stays at the root](0111-vision-stays-at-the-root.md) | builders | Accepted |
| 0112 | [Decision records keep the old entry numbers](0112-record-numbering-keeps-old-entry-numbers.md) | builders | Accepted |

## Record format

Every record opens with these lines:
- **Status:** Accepted; Superseded by NNNN; or Partly superseded by NNNN, naming the part. A replacing record adds "Supersedes: NNNN" or "Partly supersedes: NNNN".
- **Scope:** The product, The plan, Milestone N, or Making premise.
- **Date:** when it was decided.
- **Decided by:** the owner (quoted), the assistant, the assistant for the owner, or the builders (see above).
- **Source:** where in the raw record, or which old entry or plan choice, it comes from.

Then the same sections:
- **Context:** what prompted the decision, from the sources only.
- **Decision:** what was decided, stated so it can be checked.
- **Reason:** the reason as recorded, quoted where it was spoken, or "No reason was recorded."
- **Alternatives considered:** a table of each alternative and why it was rejected.
- **Consequences:** what follows, and where the decision is carried.
- **Related:** other records and documents.

New records take the next free number and the same sections. Numbers are never reused. The format is aras-insight's, plus the Date, Decided by, Source and Reason parts ([0066](0066-documents-follow-the-aras-insight-layout.md)).
