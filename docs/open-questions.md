# Open questions

What is still open in premise's documents, and why. Everything else is decided; the choices are in the [decision records](decisions/README.md).

## Chosen for the owner

The owner asked the assistant to choose an answer to every question that was open with the owner, and to keep the choices in the repository ("choose for me", [0136](decisions/0136-open-questions-chosen-for-the-owner.md)). Each is its own record and open to the owner's correction; a correction is a new record that supersedes it.

| Question | Chosen | Record |
| --- | --- | --- |
| When building starts | Now, for the whole of premise (the owner's own word) | [0130](decisions/0130-the-build-starts-and-covers-all-of-premise.md) |
| Which software goes through premise first | usage-ledger: the owner needs it and premise depends on it. It runs with real agents when the owner allows real agent work on the Claude login; until then demos use the scripted agent | [0137](decisions/0137-first-software-is-usage-ledger.md) |
| Whether the builders' reading of effort and milestone waits is right | It stands, except that priority between softwares is a field on each software from milestone 1 (the work queue orders by it); usage shares stay with usage-ledger, mocked | [0138](decisions/0138-priority-is-a-field-from-milestone-1.md), [0129](decisions/0129-builders-reading-of-effort-and-milestone-waits.md) |
| Whether finding out if real people want the software is "out" or "later" | Out, as written | [0139](decisions/0139-finding-out-if-people-want-it-stays-out.md) |
| premise's own Claude Code login folder, or the owner's existing login | The owner's existing login; the folder is a setting | [0140](decisions/0140-the-owners-existing-claude-code-login.md) |
| Creating GitHub repositories (milestone 1 step 1, point 7) | Automated tests use local git remotes only; the real GitHub step stays behind the gate and runs only on the owner's word | [0141](decisions/0141-github-repositories-in-tests-and-behind-the-gate.md) |
| If bubblewrap or socat is missing | The setup check names what is missing and how to install it; premise refuses to start real agents without them | [0142](decisions/0142-setup-check-names-bubblewrap-and-socat.md) |
| The other Premise project, and the name | The name stays premise | [0143](decisions/0143-the-name-stays-premise.md) |
| Being reached from other machines | Stays off by default; no setting opens it | [0144](decisions/0144-reach-from-other-machines-stays-off.md) |
| Using an API key | No API key is used | [0145](decisions/0145-no-api-key.md) |

## Still open with the owner

- **The owner's read of the vision.** Open since 2026-11-20; the vision is draft 4 ([VISION.md](../VISION.md)). The vision is the owner's statement, so the assistant does not choose it.
- **Where a rebuild could still come from.** The conversation itself (eleven fixed stages may feel like paperwork; the record's shape may not suit), which only use can settle, and the record's format, which is costly to undo ([0126](decisions/0126-what-is-being-built-confirmed.md)). Use settles it, not a choice.

## The owner's calls that come later, named in the plan

These are not open now; the plan says they wait for the owner when they arrive.

- **Real agent work on the owner's Claude login.** Used only when strictly necessary, on Haiku at low effort, very sparingly ([0134](decisions/0134-the-owners-claude-login-only-when-strictly-necessary.md)); running usage-ledger through premise with real agents waits for the owner's word ([0137](decisions/0137-first-software-is-usage-ledger.md)).
- **The real GitHub step.** Creating a repository on the owner's GitHub runs once, on the owner's word ([0141](decisions/0141-github-repositories-in-tests-and-behind-the-gate.md)).
- **Accounts.** Decided at milestone 5, when other people set premise up ([0045](decisions/0045-a-link-per-person-no-accounts.md)).

## Noted by the builders

- **Not yet tested for milestone 1 step 1** ([test record](record/subscription-sandbox-test-2026-11-21.md)):
  - the server, not an agent, creating a private GitHub repository and pushing to it (roadmap point 7), which is proved on a local remote and run on GitHub only on the owner's word ([0141](decisions/0141-github-repositories-in-tests-and-behind-the-gate.md));
  - a Claude Code configuration folder other than the default, which is now a setting ([0140](decisions/0140-the-owners-existing-claude-code-login.md)); the test used the default login;
  - a real usage-limit rejection and resuming after the reset; only a simulated event was run;
  - the Sonnet and Opus tiers: the test used Haiku only;
  - process-level escapes from the sandbox (symlinks, `/proc`, git hooks, programs the agent runs), and an allowed host on the network list;
  - the terms question is closed by [0124](decisions/0124-unattended-claude-code-on-the-subscription-is-allowed.md).

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
