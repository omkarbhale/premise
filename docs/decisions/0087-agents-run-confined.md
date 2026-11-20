# 0087. Every agent runs confined

- Status: Accepted
- Scope: The plan
- Date: 2026-11-21
- Decided by: The builders, in the plan of 2026-11-21. The owner did not make this choice.
- Source: Old docs/plan.md, P21 (section 5, "Build").

## Context
- Agents run unattended on the owner's machine ([0043](0043-runs-on-the-owners-machine-first.md)).
- Losing data and security holes are on the floor ([0056](0056-what-is-on-the-floor.md)).
- On Linux and WSL2, Claude Code's sandbox needs bubblewrap and socat; installing them needs the owner's administrator password, so premise names them and the owner installs them.

## Decision
Every agent runs confined: Claude Code's sandbox for shell commands, plus permission rules for its file tools.
- Writes only in its working copy and a temporary folder.
- Reads denied for premise's data folder, the checker's scenarios, and credential files (SSH keys, the GitHub login, Claude Code's login).
- Network only to the package registries the plan names.

## Reason
- An unattended agent with the owner's files and logins within reach is how the prior art's worst incidents happened.
- Claude Code's sandbox covers shell commands only, so file tools are limited by permission rules as well.

## Alternatives considered
| Alternative | Why rejected |
| --- | --- |
| No confinement | The prior art's worst incidents happened with files and logins within an unattended agent's reach. |
| A container per agent | Stronger, but it makes Docker a prerequisite. It is the fallback if milestone 1 shows the sandbox leaks. |

## Consequences
- If milestone 1 step 1 shows confinement fails (point 3 or 4), agents run in a container per session instead; Docker becomes a prerequisite, which the report names. If Docker is not available, work stops for the owner, because running agents unconfined is security-sensitive ([roadmap](../product/roadmap.md)).
- The runner starts built software confined the same way.
- Agents cannot take a floor action: they hold no credentials and run confined ([0100](0100-floor-actions.md)).
- Carried in [the floor and the gate](../architecture/the-floor-and-the-gate.md); implemented by the [agent runner](../specs/agent-runner.md) and [runner](../specs/runner.md) specs.

## Related
[0077](0077-github-through-existing-cli-login.md), [0090](0090-scenarios-out-of-the-builders-reach.md), [0116](0116-outside-content-is-data.md).
