# 0077. GitHub through the machine's existing GitHub CLI login, server only

- Status: Accepted
- Scope: The plan
- Date: 2026-11-21
- Decided by: The builders, in the plan of 2026-11-21. The owner did not make this choice.
- Source: Old docs/plan.md, P11 (section 2, "Where it runs and how people reach it").

## Context
- Each software gets its own repository on the owner's GitHub account ([0051](0051-each-software-in-its-own-repository.md)).
- Only the server creates repositories, pushes and reads issues.
- The GitHub CLI, logged in as the owner, is a prerequisite checked at every start.

## Decision
premise reaches GitHub through the machine's existing GitHub CLI login, used only by the server.

## Reason
No new secret to create or store, and agents never hold it.

## Alternatives considered
| Alternative | Why rejected |
| --- | --- |
| A personal access token stored by premise | The plan gives no further reason beyond the one above: a new secret to create and store. |

## Consequences
- The builder holds no credentials: it commits, and the server pushes ([build, check and run](../architecture/build-check-run.md)).
- Agents cannot read the GitHub login ([0087](0087-agents-run-confined.md)).
- Carried in [where it runs](../architecture/where-it-runs.md); implemented by the [page server](../specs/page-server.md) and [runner](../specs/runner.md) specs.

## Related
[0093](0093-server-merges-no-pull-requests.md), [0100](0100-floor-actions.md).
