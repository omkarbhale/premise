# 0076. premise runs Claude Code with its own configuration folder

- Status: Superseded by [0140](0140-the-owners-existing-claude-code-login.md)
- Scope: The plan
- Date: 2026-11-21
- Decided by: The builders, in the plan of 2026-11-21. The owner did not make this choice.
- Source: Old docs/plan.md, P10 (section 2, "Where it runs and how people reach it").

## Context
- premise runs on the owner's machine ([0043](0043-runs-on-the-owners-machine-first.md)) and uses Claude through the owner's subscription ([0046](0046-claude-through-the-owners-subscription.md)).
- Claude Code must be installed and logged in before premise starts; premise checks it at every start.

## Decision
premise runs Claude Code with its own configuration folder, logged in once by the owner with the owner's subscription.

## Reason
- The owner's personal hooks, skills, memory and settings would otherwise load into every agent and change what it does.
- premise's sessions also stay apart from the owner's own.

## Alternatives considered
| Alternative | Why rejected |
| --- | --- |
| The owner's default configuration | Personal hooks, skills, memory and settings would load into every agent. |
| Claude Code's bare mode | It does not use subscription login. |

## Consequences
- premise tells usage-ledger where its Claude Code sessions are recorded: this configuration folder ([models and cost](../architecture/models-and-cost.md)).
- Agents cannot read Claude Code's login ([0087](0087-agents-run-confined.md)).
- Carried in [where it runs](../architecture/where-it-runs.md); implemented by the [page server](../specs/page-server.md) (prerequisite check) and [agent runner](../specs/agent-runner.md) specs.

- **Superseded by** [0140](0140-the-owners-existing-claude-code-login.md): premise uses the owner's existing Claude Code login by default; the folder is a setting.

## Related
[0071](0071-headless-claude-code-agents.md), [0103](0103-subscription-only-for-the-owner.md), [0064](0064-cost-and-spending-limit-from-usage-ledger.md).
