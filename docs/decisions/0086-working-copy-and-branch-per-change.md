# 0086. The builder works in its own working copy, on a branch per change

- Status: Accepted
- Scope: The plan
- Date: 2026-11-21
- Decided by: The builders, in the plan of 2026-11-21. The owner did not make this choice.
- Source: Old docs/plan.md, P20 (section 5, "Build").

## Context
- Build is unattended ([VISION.md](../../VISION.md), the line, step 7).
- The line ends at running software ([0017](0017-the-line-ends-at-running-software.md)); what runs must not be disturbed by work in progress.

## Decision
The builder works in its own working copy of the software's repository, on a branch per change.

## Reason
A change can be checked, and thrown away, without touching what runs.

## Alternatives considered
| Alternative | Why rejected |
| --- | --- |
| Building on the default branch directly | A change could not be checked or thrown away without touching what runs. |

## Consequences
- After a pass, the server merges the branch ([0093](0093-server-merges-no-pull-requests.md)).
- Carried in [build, check and run](../architecture/build-check-run.md); implemented by the [agent runner](../specs/agent-runner.md) and [runner](../specs/runner.md) specs.

## Related
[0087](0087-agents-run-confined.md), [0089](0089-checker-in-a-fresh-session.md).
