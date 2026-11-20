# Where premise runs and how people reach it

Carved from section 2 of the plan. Part of the [architecture](overview.md). Specs: [page server](../specs/page-server.md), [page](../specs/page.md), [agent runner](../specs/agent-runner.md).

## On the owner's machine

- premise runs on the owner's machine ([0043](../decisions/0043-runs-on-the-owners-machine-first.md)). One command starts it and prints the session's link.
- Installed once and checked at every start; premise names whatever is missing:
  - Node.js LTS and git;
  - Claude Code, logged in once with the owner's subscription in premise's own configuration folder ([0076](../decisions/0076-own-claude-code-configuration.md));
  - the GitHub CLI, logged in as the owner ([0077](../decisions/0077-github-through-existing-cli-login.md));
  - on Linux and WSL2, bubblewrap and socat, which Claude Code's sandbox needs ([0087](../decisions/0087-agents-run-confined.md)). Installing them needs the owner's administrator password, so premise names them and the owner installs them;
  - usage-ledger, once it is usable ([0064](../decisions/0064-cost-and-spending-limit-from-usage-ledger.md); milestone 2).

| Record | Choice | Why, in short |
| --- | --- | --- |
| [0076](../decisions/0076-own-claude-code-configuration.md) (P10) | premise runs Claude Code with its own configuration folder, logged in once by the owner. | The owner's personal hooks, skills, memory and settings would otherwise load into every agent and change what it does; premise's sessions also stay apart from the owner's own. |
| [0077](../decisions/0077-github-through-existing-cli-login.md) (P11) | premise reaches GitHub through the machine's existing GitHub CLI login, used only by the server. | No new secret to create or store, and agents never hold it. |

## One session ([0065](../decisions/0065-one-open-session.md))

- Everything is open in one session on the page: every stage, the record, reports, and what each role needs or is being asked. All of it is visible and answerable there, designed as if one person does everything.
- Roles are labels on what is asked. Every question, proposal and approval says which role it is for, in that role's terms; whoever is in the session answers it.
- [0078](../decisions/0078-session-token-and-header-checks.md) (P12): the session's link carries a long random token. Every request needs it. The server also checks the Host and Origin headers.
  - Why: without it, any other web page open in the same browser could drive premise on localhost.
  - Rejected: no token for requests from the owner's own machine; a link per person ([0065](../decisions/0065-one-open-session.md)).

## Reach

- [0079](../decisions/0079-localhost-only.md) (P13): premise listens on localhost only.
  - Why: anything reachable from outside the machine is security-sensitive ([0053](../decisions/0053-when-work-stops-for-the-owner.md), [0056](../decisions/0056-what-is-on-the-floor.md)).
  - Rejected: listening on every network interface by default.
- Being reached from other machines is a later decision for the owner, because it is security-sensitive ([0053](../decisions/0053-when-work-stops-for-the-owner.md), [0056](../decisions/0056-what-is-on-the-floor.md)). Until then, premise is used only at the owner's machine.
- Built software runs on the same machine ([build, check and run](build-check-run.md#run)).
- Hosting premise itself comes with milestone 5. Accounts are decided then ([0045](../decisions/0045-a-link-per-person-no-accounts.md); [roadmap](../product/roadmap.md)).
