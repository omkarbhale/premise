# Open questions

What is still open in premise's documents, and why. Everything else is decided; the choices are in the [decision records](decisions/README.md).

## Chosen for the owner

The owner asked the assistant to choose an answer to every question that was open with the owner, and to keep the choices in the repository ("choose for me", [0136](decisions/0136-open-questions-chosen-for-the-owner.md)). Each is its own record and open to the owner's correction; a correction is a new record that supersedes it.

| Question | Chosen | Record |
| --- | --- | --- |
| When building starts | Now, for the whole of premise (the owner's own word) | [0130](decisions/0130-the-build-starts-and-covers-all-of-premise.md) |
| Which software goes through premise first | usage-ledger: the owner needs it and premise depends on it. It runs with real agents, since premise uses real agents by default; demos and tests while making premise use the scripted agent | [0137](decisions/0137-first-software-is-usage-ledger.md), [0180](decisions/0180-premise-uses-real-agents-by-default.md) |
| Whether the builders' reading of effort and milestone waits is right | It stands, except that priority between softwares is a field on each software from milestone 1 (the work queue orders by it); usage shares stay with usage-ledger, mocked | [0138](decisions/0138-priority-is-a-field-from-milestone-1.md), [0129](decisions/0129-builders-reading-of-effort-and-milestone-waits.md) |
| Whether finding out if real people want the software is "out" or "later" | Out, as written | [0139](decisions/0139-finding-out-if-people-want-it-stays-out.md) |
| premise's own Claude Code login folder, or the owner's existing login | The owner's existing login; the folder is a setting | [0140](decisions/0140-the-owners-existing-claude-code-login.md) |
| Creating GitHub repositories (milestone 1 step 1, point 7) | Automated tests use local git remotes only; the real GitHub step stays behind the gate and runs only on the owner's word | [0141](decisions/0141-github-repositories-in-tests-and-behind-the-gate.md) |
| Which repository step the gate asks about, and when approvals for a kind arrive | Creating any repository on GitHub is gated, private or public; declining does not stop the line; approvals for a kind of action are in milestone 1, for one software | [0182](decisions/0182-how-the-gate-is-built.md) |
| Whether sizing may shorten the line for a whole new software | No: a new software always goes through Why, What, the say-back and Plan; only Who and What exists may be skipped. Milestones and parts are sized freely | [0184](decisions/0184-how-sizing-of-work-is-built.md) |
| Whether the sizer's size or the Why draft's size wins | The sizer's guess comes first; the operator's word, at Why or on the Line tab, replaces it | [0184](decisions/0184-how-sizing-of-work-is-built.md) |
| Whether a confirmed change of purpose from intake redoes the whole software | No: it goes back to Why as its own piece of work, said back before it is built; sending the whole software back stays the operator's act | [0185](decisions/0185-how-intake-in-a-thin-form-is-built.md) |
| How senders are told where their item stands, while every sender is in the session | One line in the session at each change, and the Intake tab in plain words | [0185](decisions/0185-how-intake-in-a-thin-form-is-built.md) |
| Whether triage reads items one at a time or in batches | One at a time, at the fast tier | [0185](decisions/0185-how-intake-in-a-thin-form-is-built.md) |
| What happens when a check keeps failing, or a build task keeps stopping | premise stops and asks: more rounds or land it as it is; try the stopped tasks again or check what was built | [0186](decisions/0186-how-build-check-and-run-are-built.md) |
| Which branch of the operator's repository an existing software's record goes to | A branch of its own, `premise` (a setting), never the one the operator works on; the operator merges it | [0189](decisions/0189-how-taking-on-existing-software-is-built.md) |
| Whether a repository that already has a `premise/` folder can be taken on | Not in the thin form: premise asks to rename or remove it; picking up an existing record is later | [0189](decisions/0189-how-taking-on-existing-software-is-built.md) |
| What a first visit shows, and which tabs wait under "More" | Softwares, Waiting on you and Help at first; Conversation and Report on a software; the rest one click away | [0190](decisions/0190-how-the-first-visit-is-made-clear.md) |
| How the owner's "scope check, effort level, milestones where premise waits" works | One ask after What with three cuts and a rough cost each; effort low, medium or high per software (default medium) picks the starting cut and scales the stages before building; the first milestone is what was asked, and premise stops after it when only its own additions follow | [0191](decisions/0191-scope-check-effort-and-milestones.md) |
| Which effort a new software gets when nobody says | Medium: premise's recommendations are offered, built after the first milestone, and premise stops before them | [0191](decisions/0191-scope-check-effort-and-milestones.md) |
| Whether a bug report reopens What | No: a bug on something the record requires is built and checked straight away; a real change to what it must do reopens What without a question; a change asks at most once before it is built, and only when it matters ([0274](decisions/0274-a-change-asks-at-most-one-question.md)) | [0192](decisions/0192-effort-in-proportion-to-what-was-asked.md) |
| Whether a change from intake gets a blocking question, and when | At most one, only when it replaces a foundation decision or is otherwise costly to undo, touches the floor or purpose (their own routes), or the person's words left a real choice open; otherwise premise builds and says what it took and assumed, strikeable while it builds. Suggestions are built only when added. Per software: every change, when it matters (default), never; high effort asks every change | [0274](decisions/0274-a-change-asks-at-most-one-question.md) |
| What a change whose sizer gave it no Plan step builds, and what happens to an old milestones question of a change | One task named after the change; withdrawn at start-up and the change planned again as a change | [0273](decisions/0273-a-change-is-planned-and-built-as-a-change.md) |
| What the page says when triage fell back to the default | That the item was not triaged, why, and that premise took it in by its default | [0277](decisions/0277-an-agent-without-its-answer-is-asked-once-more.md) |
| How few events are too few for a measure | Fewer than 5 for a rate or a typical time (a setting): it reads "not enough yet" with the count | [0193](decisions/0193-how-the-measures-are-built.md) |
| Whether the feedback link's token is kept so it can be shown again | Yes: it can do one harmless thing, and the operator replaces it in one click if it leaks | [0241](decisions/0241-how-the-feedback-page-is-built.md) |
| How many items a feedback page takes in an hour | 30 per software, a setting; beyond that it says so and waits | [0241](decisions/0241-how-the-feedback-page-is-built.md) |
| When a GitHub issue's sender is told where it stands | Once for each thing that matters (held, running, merged, answered, closed), always asked at the gate first | [0240](decisions/0240-how-github-issues-are-read-and-answered.md) |
| What "Noted" does to a short list's lines nobody decided | Their items stay held, so nothing is lost and nothing is decided for the operator | [0242](decisions/0242-readings-name-their-items-and-the-operator-decides-each-line.md) |
| What a report is about, and what a check counts for | One named version; a check counts only for the version it was made on, and the same code counts | [0245](decisions/0245-reports-are-about-one-named-version.md) |
| What happens to an approved action premise stopped before finishing | Marked failed at start-up and handed back to the person; premise never repeats it | [0246](decisions/0246-an-approved-action-that-never-finished-is-failed-at-start-up.md) |
| What a take-on does while its copy is unfinished or failed | Takes nothing in; copies again at start-up | [0247](decisions/0247-a-take-on-that-is-still-copying-or-failed-takes-nothing-in.md) |
| When "sent back to Why" is recorded | Only once going back has started | [0248](decisions/0248-sent-back-to-why-is-recorded-only-once-it-has-started.md) |
| When a software paused for a weekly overrun resumes | At the weekly reset, unless the operator chose to leave it paused | [0200](decisions/0200-how-cost-and-the-spending-limit-are-built.md) |
| Whether a feedback sender may see the answer written for another item their item was joined to | No: they see that it was joined with an earlier report and its plain status, never text written for or by anyone else | [0244](decisions/0244-a-feedback-sender-sees-only-their-own-words-and-a-plain-status.md) |
| How "fairly" shares the agent sessions between several softwares | Priority first; among equally important ones, turns; a software that waited 30 minutes (a setting) behind more important ones gets the next free session | [0197](decisions/0197-how-several-softwares-at-once-is-built.md) |
| When a software may be archived, and whether one is ever deleted | When it is finished, ended or paused; archiving keeps everything and can be restored; nothing deletes a software | [0197](decisions/0197-how-several-softwares-at-once-is-built.md) |
| How many softwares run at once on one machine | Up to 5, while at least 256 MB of memory is free (both settings); premise says which limit stopped a start | [0197](decisions/0197-how-several-softwares-at-once-is-built.md) |
| How long the lists of lessons are | At most 10 lines per software and 10 of taste (settings); over that, the least-used line is dropped, with a note | [0194](decisions/0194-how-learning-from-corrections-is-built.md) |
| Whether a new lesson asks the person first | No: it is said once in passing and takes effect unless removed, in one click | [0194](decisions/0194-how-learning-from-corrections-is-built.md) |
| What a software's budget is made of | A share of a week's usage or an amount in dollars a week at list prices, one of the two; "no budget" is allowed. Amounts are offered because a share means little without knowing what a week is worth | [0200](decisions/0200-how-cost-and-the-spending-limit-are-built.md) |
| What "finish the current change" lets run after an overrun | The piece of work the software is on (the running job's, else the oldest waiting or queued one) and its parts; then it stops again | [0200](decisions/0200-how-cost-and-the-spending-limit-are-built.md) |
| When a check has passed, and what lands unverified | "Passed" only when every must item is met; some unverified: it lands, marked not fully verified; nothing verified: premise asks once (land unverified, tell the checker what it needs, or stop), or lands as `line.when_nothing_verified` says | [0220](decisions/0220-approvals-and-verdicts-tell-the-truth.md) |
| If bubblewrap or socat is missing | The setup check names what is missing and how to install it; premise refuses to start real agents without them | [0142](decisions/0142-setup-check-names-bubblewrap-and-socat.md) |
| The other Premise project, and the name | The name stays premise | [0143](decisions/0143-the-name-stays-premise.md) |
| How the owner pauses premise, closes it and comes back | "Pause everything" and "Resume" in the top bar (let running work finish by default, or stop it now); a pause survives a restart; Ctrl+C once stops cleanly after the running work and says what it waits for, twice stops now; `premise stop` does the same from another terminal; one line says what the start picked up | [0290](decisions/0290-pausing-and-resuming-the-whole-of-premise.md) |
| Whether the link stays the same across restarts | No by default, for safety; `server.keep_link` keeps it, with the risk stated in the setting | [0290](decisions/0290-pausing-and-resuming-the-whole-of-premise.md) |
| How many pieces of one software are built at once, and when one starts beside another | Up to two by default (a setting, and a choice per software; one restores one after another); a piece leaves the front only at Build, so questions stay one piece at a time | [0313](decisions/0313-several-pieces-of-one-software-at-once.md) |
| What happens when two pieces built at once changed the same lines | The second goes back to its builder once with the files; if it still conflicts, the person chooses another round or building it again on the new version | [0313](decisions/0313-several-pieces-of-one-software-at-once.md) |
| Being reached from other machines | Stays off by default; no setting opens it | [0144](decisions/0144-reach-from-other-machines-stays-off.md) |
| Using an API key | No API key is used | [0145](decisions/0145-no-api-key.md) |

## Still open with the owner

- **The first real run of a real software, and which one.** One real run has been made on a tiny command-line tool ([status](status.md)). Putting a software the owner needs through premise is the owner's pick, made when the owner wants ([0050](decisions/0050-first-software-is-the-owners-pick.md)); the assistant's choice is usage-ledger ([0137](decisions/0137-first-software-is-usage-ledger.md)), once usage-ledger is wanted. The owner asked to be told when a small real software can go through the line ([0249](decisions/0249-the-owners-requests-during-the-build-are-intake-and-never-cost-structure.md)): it can now, with the scripted operator's place taken by the owner.
- **Whether the choices made for the owner stand.** Every row in the table above, and the four made during validation: [0245](decisions/0245-reports-are-about-one-named-version.md) (reports about one version), [0246](decisions/0246-an-approved-action-that-never-finished-is-failed-at-start-up.md) (an approved action that never finished), [0247](decisions/0247-a-take-on-that-is-still-copying-or-failed-takes-nothing-in.md) (an unfinished take-on), [0248](decisions/0248-sent-back-to-why-is-recorded-only-once-it-has-started.md) ("sent back to Why"). A correction is a new record.
- **The owner's read of the vision.** Open since 2026-11-20; the vision is draft 5, which adds the owner's two decisions on scale and on adapting to each software ([VISION.md](../VISION.md), [0166](decisions/0166-any-software-of-any-scale.md), [0167](decisions/0167-premise-adapts-at-runtime-to-the-software.md)). The vision is the owner's statement, so the assistant does not choose it.
- **Where a rebuild could still come from.** The conversation itself (eleven fixed stages may feel like paperwork; the record's shape may not suit), which only use can settle, and the record's format, which is costly to undo ([0126](decisions/0126-what-is-being-built-confirmed.md)). Use settles it, not a choice.

## Builders' choices on the new order, open to the owner's correction

The owner's decisions of 2026-11-21 on scale, direction and order are records [0166](decisions/0166-any-software-of-any-scale.md)–[0178](decisions/0178-hosting-for-others-accounts-and-public-deployment-pushed-later.md). Where the owner did not say how to write them down, the builders chose, and the choice is open to the owner's correction ([0179](decisions/0179-the-roadmap-is-reordered.md)):
- **Milestone numbers stay as they were.** The new order is stated at the top of the roadmap; the two new steps are milestones 8 (measures and learning from corrections) and 9 (real use).
- **Intake and existing software are each built in two parts:** the thin form early, the rest with roles and cost.
- **Use starts as soon as milestone 1 runs,** not at its place in the list ([0175](decisions/0175-premise-is-used-for-real-as-soon-as-milestone-1-runs.md)).
- **Which stages sit in which of the three phases** (Understand: Why to Say back; Build: Plan, Build, Check; Running: Run, Report, Intake), since the owner gave the names and not the split ([0174](decisions/0174-the-page-shows-three-phases.md)).
- **Where learned taste is kept:** the operator's list in premise's own data, never in a software's repository ([0173](decisions/0173-premise-learns-from-corrections.md), [0081](decisions/0081-nothing-about-people-in-the-repository.md)).
- **No several agents per stage by default, and each split recorded with its reason** ([0170](decisions/0170-what-may-be-split-is-decided-by-strong-prompting.md)).

## The owner's calls that come later, named in the plan

These are not open now; the plan says they wait for the owner when they arrive.

- **The owner's Claude login while making premise.** Used only when strictly necessary, on Haiku at low effort, very sparingly ([0134](decisions/0134-the-owners-claude-login-only-when-strictly-necessary.md)); premise itself uses real agents by default ([0180](decisions/0180-premise-uses-real-agents-by-default.md)), so running usage-ledger through it needs no separate word.
- **The real GitHub step.** Creating a repository on the owner's GitHub runs once, on the owner's word ([0141](decisions/0141-github-repositories-in-tests-and-behind-the-gate.md)).
- **Accounts, hosting for other people and public deployment.** Decided at milestones 5 and 7, which come last, after two real softwares have run through premise ([0045](decisions/0045-a-link-per-person-no-accounts.md), [0178](decisions/0178-hosting-for-others-accounts-and-public-deployment-pushed-later.md)).
- **The checker on a different model, and tolerating commits made outside premise.** Put on later by the owner, one GitHub issue each ([issue 62](https://github.com/omkarbhale/premise/issues/62), [issue 63](https://github.com/omkarbhale/premise/issues/63)).

## Noted by the builders

- **Not yet tested for milestone 1 step 1** ([test record](record/subscription-sandbox-test-2026-11-21.md)):
  - the server, not an agent, creating a private GitHub repository and pushing to it (roadmap point 7), which is proved on a local remote and run on GitHub only on the owner's word ([0141](decisions/0141-github-repositories-in-tests-and-behind-the-gate.md));
  - a Claude Code configuration folder other than the default, which is now a setting ([0140](decisions/0140-the-owners-existing-claude-code-login.md)); the test used the default login;
  - a real usage-limit rejection and resuming after the reset; only a simulated event was run;
  - the Sonnet and Opus tiers: the test used Haiku only;
  - process-level escapes from the sandbox (symlinks, `/proc`, git hooks, programs the agent runs), and an allowed host on the network list;
  - the terms question is closed by [0124](decisions/0124-unattended-claude-code-on-the-subscription-is-allowed.md).

- **The real agent runner has run once against real Claude Code,** in the real run of a tiny command-line tool on the fast tier at low effort ([0187](decisions/0187-kept-demos-and-one-real-run.md), [status](status.md)). Not yet seen with the real program: the Sonnet and Opus tiers, the generated settings for roles other than the builder and checker, and any longer run.
- **A session can read the working copy of a session started after it.** Each session's confinement names the other folders that exist when it starts ([0153](decisions/0153-confinement-names-the-folders-that-exist-at-start.md)). The likely fix (deny `work/`, allow the session's own folder for reading and writing) needs testing with socat installed.

- **The feedback page while premise listens on localhost only.** The plan gives each software a feedback page for its users, but premise is reachable only on the owner's machine ([0079](decisions/0079-localhost-only.md)). Until the owner decides on being reached from other machines, users elsewhere reach a software through its GitHub issues ([0119](decisions/0119-feedback-page-has-its-own-link.md), [intake spec](specs/intake.md)).
- **Asking for more detail before triage exists.** Milestone 1 has no triager, so a request for more detail is made with a control on the page; asking for it in chat comes with triage in milestone 4 ([0118](decisions/0118-how-chat-messages-are-routed.md), [reporter spec](specs/reporter.md)).
- **VISION.md's "Not yet worked out" list.** The vision still lists four things as not yet worked out. The plan answers each as builders' choices ([scope](product/scope.md#not-yet-worked-out-in-the-vision)). The builders did not change those parts of the vision: it is the owner's statement, and the owner's read of it is open.

## Handed to the builders and answered

The owner asked to settle everything that needs the owner first, so premise can be built without the owner ([0042](decisions/0042-plan-top-down-settle-owner-calls-first.md)). These were left to the builders and are answered:

| Question | Answer |
| --- | --- |
| The floor: what is on it is settled ([0056](decisions/0056-what-is-on-the-floor.md)); how premise slows down for it | [0100](decisions/0100-floor-actions.md), [0101](decisions/0101-the-gate-asks-in-the-session.md), [the floor and the gate](architecture/the-floor-and-the-gate.md) |
| Security defaults for an operator who cannot judge them | [0092](decisions/0092-security-defaults.md) |
| How automatic intake works, including which items are held ([0041](decisions/0041-intake-can-be-held.md), [0062](decisions/0062-intake-goes-in-normally.md)) | [0094](decisions/0094-triager-reads-every-item.md), [0095](decisions/0095-what-is-held.md), [0096](decisions/0096-when-held-items-are-read.md), [intake and reporting](architecture/intake-and-reporting.md) |
| What taking on existing software requires | [Existing software](architecture/the-line.md#existing-software-milestone-6) |
| What is set per software and what stays with the product | [0106](decisions/0106-per-software-and-with-premise.md) |
| The four risks and the table of who has the last word, raised on the [scope page draft](record/scope-page-draft-0.1.html) and never discussed | [Risks](architecture/overview.md#where-this-can-go-wrong-and-what-meets-it), [0084](decisions/0084-who-has-the-last-word.md) |

## Settled since the first records

- **Which kind of software the first proof is on:** none; premise works for any kind ([0049](decisions/0049-any-kind-of-software.md)).
- **The spending limit and cost tracking:** from usage-ledger ([0064](decisions/0064-cost-and-spending-limit-from-usage-ledger.md)), mocked until it exists ([0133](decisions/0133-usage-ledger-is-mocked-until-it-exists.md)).
- **How changes to premise ship:** through the no-mistakes validation pipeline; the assistant merges ([0131](decisions/0131-changes-go-through-the-validation-pipeline.md)).
- **Whether unattended use of the owner's subscription is within Anthropic's terms:** allowed, by the owner's ruling ([0124](decisions/0124-unattended-claude-code-on-the-subscription-is-allowed.md)).
- **Visibility of each software's repository:** per software, or whatever GitHub says ([0059](decisions/0059-repository-visibility-per-software.md)).
- **Where people converse:** one session on the web page where everything is open; no per-person links ([0065](decisions/0065-one-open-session.md)).
