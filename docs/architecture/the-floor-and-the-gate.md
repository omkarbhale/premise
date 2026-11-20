# The floor and the gate

What premise never trades for speed, and how it slows down for it. Carved from the plan's floor section (section 6), its confinement choice (section 5, P21) and its security defaults (section 5, P26). Part of the [architecture](overview.md). Specs: [gate](../specs/gate.md), [agent runner](../specs/agent-runner.md). Skills: [the-floor](../skills/the-floor.md), [security-defaults](../skills/security-defaults.md).

## What is on the floor ([0015](../decisions/0015-a-floor-never-traded-for-speed.md), [0056](../decisions/0056-what-is-on-the-floor.md))

The owner accepted a floor in principle and left how it works to the plan ([0015](../decisions/0015-a-floor-never-traded-for-speed.md)), then agreed what is on it: losing data, security holes, spending money, acting publicly in someone's name, and false reports ([0056](../decisions/0056-what-is-on-the-floor.md)).

- [0100](../decisions/0100-floor-actions.md) (P34): floor actions:
  - losing data: deleting or overwriting anything outside a working copy, force-pushing, deleting repositories or branches with unmerged work, dropping a running software's stored data;
  - security holes: handling credentials, exposing anything beyond localhost, changing who can get in;
  - spending money: paid services, API keys, cloud resources, paid extra usage on a subscription;
  - acting publicly in someone's name: making a repository public, publishing a package or release, posting comments or messages;
  - false reports: prevented by [0097](../decisions/0097-reports-from-recorded-facts.md) rather than asked about.
  - Why: these are the owner's floor ([0056](../decisions/0056-what-is-on-the-floor.md)), made concrete enough for the gate to recognise.
  - Rejected: leaving it to each agent to judge what is risky.

## Agents cannot take a floor action

- They hold no credentials and run confined ([0087](../decisions/0087-agents-run-confined.md)), and can only request one through their tool.
- Instructions are not access control; the prior art's destructive incidents all had credentials within reach.
- Content from outside the session cannot instruct an agent either ([0116](../decisions/0116-outside-content-is-data.md)).

## The gate

- [0101](../decisions/0101-the-gate-asks-in-the-session.md) (P35): the gate asks in the session, under the role whose call it is, saying exactly what will happen and why. Only the work that depends on the answer waits.
  - The session can approve one action, or a named kind of action for one software, such as status comments on its issues. Approvals are recorded and can be withdrawn.
  - Deleting data and spending money are always asked one at a time.
  - Why: the floor is slow on purpose; everything else proceeds and is reported. [0053](../decisions/0053-when-work-stops-for-the-owner.md) holds the same rule for building premise.
  - Rejected: asking for every action; approvals that cover every software.
- The wording of the gate's card is fixed, not written by a model ([fixed wording](../prompts/fixed-wording.md)).

## Confinement

- [0087](../decisions/0087-agents-run-confined.md) (P21): every agent runs confined: Claude Code's sandbox for shell commands, plus permission rules for its file tools.
  - Writes only in its working copy and a temporary folder.
  - Reads denied for premise's data folder, the checker's scenarios, and credential files (SSH keys, the GitHub login, Claude Code's login).
  - Network only to the package registries the plan names.
  - Why: an unattended agent with the owner's files and logins within reach is how the prior art's worst incidents happened. Claude Code's sandbox covers shell commands only, so file tools are limited by permission rules as well.
  - Rejected: no confinement. A container per agent (stronger, but it makes Docker a prerequisite); it is the fallback if milestone 1 shows the sandbox leaks.
- Built software runs confined like an agent ([build, check and run](build-check-run.md#run)).
- premise itself: the session token and header checks ([0078](../decisions/0078-session-token-and-header-checks.md)); localhost only ([0079](../decisions/0079-localhost-only.md)). See [where it runs](where-it-runs.md).

## Security defaults for every software

- [0092](../decisions/0092-security-defaults.md) (P26): security defaults for every software, applied in the plan and checked by the checker:
  - no secrets in the repository; secrets in a local file that git ignores;
  - anything that listens on a network binds to localhost unless the operator decided otherwise (a gated act);
  - anything other people can reach has a lock on it, decided in the plan;
  - dependencies from the main registries, pinned by a lock file, checked for known advisories;
  - input from people validated; database queries parameterized;
  - stored data backed up before any change that migrates it.
  - Why: when the operator cannot judge security, the defaults are the security (the prior art's insecure-defaults failure).
  - Rejected: leaving security to each software's plan.
