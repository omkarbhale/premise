# Models and cost

Carved from section 7 of the plan. Part of the [architecture](overview.md). Specs: [agent runner](../specs/agent-runner.md), [work queue](../specs/work-queue.md), [reporter](../specs/reporter.md).

## Models

- All LLM work goes through the agent runner, which runs Claude Code on the owner's subscription ([0046](../decisions/0046-claude-through-the-owners-subscription.md); [0071](../decisions/0071-headless-claude-code-agents.md), [0076](../decisions/0076-own-claude-code-configuration.md)).
- [0103](../decisions/0103-subscription-only-for-the-owner.md) (P37): the owner's subscription is used only through Anthropic's own Claude Code, logged in as the owner, on the owner's machine, for the owner's own use. premise never offers that login to anyone else.
  - Why: the owner approved subscription use ([0046](../decisions/0046-claude-through-the-owners-subscription.md)). Anthropic's Agent SDK documentation says products may not offer claude.ai login unless approved.
  - Rejected: sharing the owner's login with other people's setups of premise.
  - So other people who set premise up bring their own model access, such as an API key. On the owner's account that spends money, so it waits for the owner ([0053](../decisions/0053-when-work-stops-for-the-owner.md)).
- [0104](../decisions/0104-model-tier-by-role.md) (P38): model tier by role: the strongest tier for conversation, plan, build, check and readings; a fast tier for triage and for drafting reports.
  - Why: a mistake in intent or in the build costs more rounds than the usage saved; triage and report drafting are easy work.
  - Rejected: one model for everything; a cheaper tier for building (more failed checks).
  - The tiers of the agent roles added later (researcher, reviewer, reader) are in [0113](../decisions/0113-agent-roles.md).
- [0105](../decisions/0105-tier-aliases.md) (P39): models are named by Claude Code's tier aliases, not pinned versions.
  - Why: a better model makes premise better without a change ([0031](../decisions/0031-the-product-is-general.md)).
  - Rejected: pinned model versions.
- [0106](../decisions/0106-per-software-and-with-premise.md) (P40): what is set per software, and what stays with premise:
  - per software: its record; its `run.md` and build setup, written by the builder in its repository and regenerated when needed; its people and claimed areas; its approvals; optionally, its effort (a share of weekly usage, or a priority) and its milestone waits ([0128](../decisions/0128-effort-per-software-and-milestone-waits.md), [0129](../decisions/0129-builders-reading-of-effort-and-milestone-waits.md));
  - with premise: the line, the agent instructions, the record format, the roles and their models, the floor and the gate.
  - Why: the line and the record are general; a software's build setup is specific to it ([0031](../decisions/0031-the-product-is-general.md)).
  - Rejected: per-software instructions, or changes to the line per software.
- Agent instructions ship as files in premise's repository. They are about the line and the records, not workarounds for one model ([0031](../decisions/0031-the-product-is-general.md)). Their text is specified in [prompts](../prompts/README.md) and [skills](../skills/README.md) ([0114](../decisions/0114-prompts-and-skills-as-files.md)).
- [0107](../decisions/0107-one-part-knows-the-runtime.md) (P41): the agent runner is the only part that knows which agent runtime and provider are used. Other parts ask for "an agent with these tools, in this working copy".
  - Why: other providers come later ([0046](../decisions/0046-claude-through-the-owners-subscription.md)); adding one then changes only the runner.
  - Rejected: Claude Code details spread through premise.
- When the subscription's usage limit is reached, Claude Code reports rate-limit retries. The agent runner pauses the queue until the limit resets, and the report says so. premise never turns on paid extra usage.

## Cost and the spending limit ([0016](../decisions/0016-coarse-cost-tracking.md), [0048](../decisions/0048-a-spending-limit.md), [0064](../decisions/0064-cost-and-spending-limit-from-usage-ledger.md))

- premise builds no cost tracking and no spending limit of its own. It uses usage-ledger, which is built as its own project, outside premise, and which premise runs as a command ([0330](../decisions/0330-real-sessions-read-the-real-usage-ledger.md)). Scripted agents use nothing, so for them a stand-in gives made-up demo figures, fixed or seeded-random, labelled on the page (it was the mock of [0133](../decisions/0133-usage-ledger-is-mocked-until-it-exists.md) before usage-ledger existed).
- By its own vision, usage-ledger reads what agents and accounts already record: the per-session cost and token totals Claude Code writes, the subscription's limits, and which task each session was doing. It never sits between an agent and its model.
- Built in milestone 2 ([0200](../decisions/0200-how-cost-and-the-spending-limit-are-built.md); the contract is [usage-ledger](../specs/usage-ledger.md), premise's side is [usage and budgets](../specs/usage.md)).
- premise's part:
  - it labels every real session with the task it did (software, stage, change, record items) in usage-ledger, and gives usage-ledger each reading of the week the stream reported, with its time;
  - it tells usage-ledger where its Claude Code sessions are recorded (the Claude Code configuration folder in use, [0140](../decisions/0140-the-owners-existing-claude-code-login.md));
  - it reads each session's tokens and cost from usage-ledger once the session ends, and shows them per software, phase, stage, change and record item, on the page and in reports; a figure not known is said to be;
  - it sets per-software budgets for the week in usage-ledger; when usage-ledger says one is used up, premise pauses that software's queue and tells the operator. A budget usage-ledger cannot fully count yet (incomplete) never pauses work.
- Effort per software (the owner's requirement, [0128](../decisions/0128-effort-per-software-and-milestone-waits.md)), as the builders read it ([0129](../decisions/0129-builders-reading-of-effort-and-milestone-waits.md), open to the owner's correction): a share of weekly usage relies on usage-ledger, and the weekly usage figure is visible in Claude Code's own stream ([test record](../record/subscription-sandbox-test-2026-11-21.md)); a priority orders the work queue between softwares. Shares come with cost in milestone 2; priority is a field on each software from milestone 1 ([0138](../decisions/0138-priority-is-a-field-from-milestone-1.md)).
- Because sessions carry their record items, rework shows up: an item that keeps failing its check shows its whole cost.
- Reports show usage-ledger's figures beside premise's own counts of sessions, time and what each session's result said it used. The turn and time limits of [0088](../decisions/0088-turn-and-time-limits.md) still stop runaway sessions; they are not cost tracking.
- Building usage-ledger is not premise work. Milestone 2 was built against the mock and now uses usage-ledger ([roadmap](../product/roadmap.md)).
