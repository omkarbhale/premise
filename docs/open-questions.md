# Open questions

What is still open in premise's documents, and why. Everything else is decided; the choices are in the [decision records](decisions/README.md).

## Open with the owner

- **When building starts.** The owner says ([0061](decisions/0061-nothing-built-until-the-owner-says.md)). Nothing is built until then.
- **The owner's read of vision draft 3.** Open since 2026-11-20 ([VISION.md](../VISION.md)).
- **Whether finding out if real people want the software is "out" or "later".** The owner said both "out" and "So later it is". It is written as out, with an active version at most a later idea; the assistant asked to be told if the owner meant it the other way, and no answer is recorded ([0036](decisions/0036-finding-out-if-people-want-it-is-out.md)). Nothing in the plan depends on it.
- **The other Premise project** in an adjacent space, seen only through a search summary. keel is the assistant's fallback name if it has grown ([0037](decisions/0037-name-premise.md)). Nothing in the plan depends on it.

## The owner's calls that come later, named in the plan

These are not open now; the plan says they wait for the owner when they arrive.

- **The first software to prove the line on.** The owner picks it when they want; building premise does not wait for it ([0050](decisions/0050-first-software-is-the-owners-pick.md), [0060](decisions/0060-first-software-does-not-hold-up-premise.md)).
- **If milestone 1's first step fails.** If premise cannot drive Claude Code unattended on the owner's subscription, or the server cannot create and push a repository, work stops for the owner with the options, for example an API key, which spends money ([roadmap](product/roadmap.md#milestone-1-the-thinnest-line-end-to-end-for-any-small-software)). The first test passed points 1 to 5 and 7 of its own numbering, and the owner ruled the use allowed ([0124](decisions/0124-unattended-claude-code-on-the-subscription-is-allowed.md)); the repository step is still untested (below). If bubblewrap or socat is missing, work stops for the owner.
- **Being reached from other machines.** Security-sensitive; a later decision for the owner ([0065](decisions/0065-one-open-session.md), [0079](decisions/0079-localhost-only.md)). Milestone 5 prepares it and does not decide it.
- **Using an API key**, for milestone 5's clean-machine demo or for other people's setups on the owner's account. It spends money, so it waits for the owner ([0103](decisions/0103-subscription-only-for-the-owner.md), [0053](decisions/0053-when-work-stops-for-the-owner.md)).
- **Accounts.** Decided at milestone 5, when other people set premise up ([0045](decisions/0045-a-link-per-person-no-accounts.md)).

## Noted by the builders

- **Not yet tested for milestone 1 step 1** ([test record](record/subscription-sandbox-test-2026-11-21.md)):
  - the server, not an agent, creating a private GitHub repository and pushing to it (roadmap point 7);
  - premise's own Claude Code configuration folder and login ([0076](decisions/0076-own-claude-code-configuration.md)); the test used the default login;
  - a real usage-limit rejection and resuming after the reset; only a simulated event was run;
  - the Sonnet and Opus tiers: the test used Haiku only;
  - process-level escapes from the sandbox (symlinks, `/proc`, git hooks, programs the agent runs), and an allowed host on the network list;
  - the terms question is closed by [0124](decisions/0124-unattended-claude-code-on-the-subscription-is-allowed.md).

- **The feedback page while premise listens on localhost only.** The plan gives each software a feedback page for its users, but premise is reachable only on the owner's machine ([0079](decisions/0079-localhost-only.md)). Until the owner decides on being reached from other machines, users elsewhere reach a software through its GitHub issues ([0119](decisions/0119-feedback-page-has-its-own-link.md), [intake spec](specs/intake.md)).
- **Asking for more detail before triage exists.** Milestone 1 has no triager, so a request for more detail is made with a control on the page; asking for it in chat comes with triage in milestone 4 ([0118](decisions/0118-how-chat-messages-are-routed.md), [reporter spec](specs/reporter.md)).
- **VISION.md's "Not yet worked out" list.** The vision still lists four things as not yet worked out. The plan answers each as builders' choices ([scope](product/scope.md#not-yet-worked-out-in-the-vision)). The builders did not change the vision text: it is the owner's statement, and the owner's read of draft 3 is open.

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
- **The spending limit and cost tracking:** from usage-ledger ([0064](decisions/0064-cost-and-spending-limit-from-usage-ledger.md)).
- **Whether unattended use of the owner's subscription is within Anthropic's terms:** allowed, by the owner's ruling ([0124](decisions/0124-unattended-claude-code-on-the-subscription-is-allowed.md)).
- **Visibility of each software's repository:** per software, or whatever GitHub says ([0059](decisions/0059-repository-visibility-per-software.md)).
- **Where people converse:** one session on the web page where everything is open; no per-person links ([0065](decisions/0065-one-open-session.md)).
