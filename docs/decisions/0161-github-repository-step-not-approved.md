# 0161. Creating a GitHub repository is an interface with a step that is not approved yet

- Status: Accepted
- Scope: Making premise
- Date: 2026-11-22
- Decided by: The builders, following [0141](0141-github-repositories-in-tests-and-behind-the-gate.md) and the build instruction that tests never touch GitHub.
- Source: [0141](0141-github-repositories-in-tests-and-behind-the-gate.md), [gate](../specs/gate.md).

## Context

- A software's repository is first made on the owner's machine. Creating one on GitHub acts in the owner's name and, if public, shows the software to everyone, so it goes through the gate.

## Decision

- Creating a remote repository is an interface (`RepositoryHost`). Two implementations exist: a local bare repository, used by the tests and for working without GitHub, and a GitHub one that asks the gate before making anything public and then stops with "this step has not been approved yet", never calling GitHub.
- The gate seam is a small interface the GitHub host takes; the gate module is built elsewhere and will supply it.
- The message says plainly that the software stays on this machine and nothing is lost.

## Reason

- The approved step is the owner's to give. Until then, the product proves its flows with local remotes.

## Alternatives considered

| Alternative | Why rejected |
| --- | --- |
| Call GitHub when the gate approves | No approval exists yet, and tests must never reach GitHub. |
| Leave remotes out | Pushing, and the trailer check before it, need a remote to be proven. |

## Consequences

- When the owner approves the step, the GitHub host's body is filled in behind the same interface and the gate.

## Related

[0141](0141-github-repositories-in-tests-and-behind-the-gate.md), [0159](0159-how-the-record-keeper-is-built.md).
