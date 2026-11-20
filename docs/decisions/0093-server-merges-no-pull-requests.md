# 0093. After a pass, the server merges and pushes; no GitHub pull requests

- Status: Accepted
- Scope: The plan
- Date: 2026-11-21
- Decided by: The builders, in the plan of 2026-11-21. The owner did not make this choice.
- Source: Old docs/plan.md, P27 (section 5, "Run").

## Context
- The line ends at running software ([0017](0017-the-line-ends-at-running-software.md)).
- Nobody has to use another tool alongside premise ([0063](0063-premise-may-depend-on-other-tools.md)).
- How premise's own changes ship ([0040](0040-fast-i-merge.md)) is a separate matter: it is about making premise, not the softwares premise builds.

## Decision
After a pass, the server merges the branch into the default branch and pushes. No GitHub pull requests.

## Reason
The line ends at running software ([0017](0017-the-line-ends-at-running-software.md)), and people follow the work on premise's page; nobody has to use GitHub alongside premise ([0063](0063-premise-may-depend-on-other-tools.md)).

## Alternatives considered
| Alternative | Why rejected |
| --- | --- |
| A GitHub pull request per change | A second place to look and approve. |

## Consequences
- The runner then starts the checked commit from a clean copy using `run.md`.
- The push is refused without a valid trace trailer ([0083](0083-trace-trailer-on-every-commit.md)).
- Carried in [build, check and run](../architecture/build-check-run.md); implemented by the [runner](../specs/runner.md) spec.

## Related
[0077](0077-github-through-existing-cli-login.md), [0086](0086-working-copy-and-branch-per-change.md).
