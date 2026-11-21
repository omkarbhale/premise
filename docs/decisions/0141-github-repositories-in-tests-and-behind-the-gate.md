# 0141. Tests use local git remotes only; creating a real GitHub repository stays behind the gate

- Status: Accepted, chosen for the owner; open to the owner's correction
- Scope: The plan
- Date: 2026-11-21
- Decided by: The assistant, for the owner, on the owner's instruction "choose for me" ([0136](0136-open-questions-chosen-for-the-owner.md)). Open to the owner's correction.
- Source: [The owner's instruction of 2026-11-21 that started the build](../record/instruction-2026-11-21-build-starts.md); [open questions](../open-questions.md) as they stood before it.

## Context

- Point 7 of milestone 1 step 1, the server creating a private GitHub repository and pushing to it, was still untested ([roadmap](../product/roadmap.md)).
- Creating a repository is a floor action ([0100](0100-floor-actions.md)).

## Decision

- premise's automated tests and demos push to local git remotes only (a bare repository in a temporary folder). They never reach GitHub.
- The real step, creating a repository on GitHub, stays behind the gate. It is run only on the owner's word.

## Reason

- Tests that create repositories on the owner's account would be outward-facing and leave things behind on every run.
- A local remote proves the same procedure: the server, not an agent, pushes.

## Alternatives considered

| Alternative | Why rejected |
| --- | --- |
| A test account on GitHub | Needs another account and a network in every test run. |
| Run the real step in every demo | Outward-facing, and against [0134](0134-the-owners-claude-login-only-when-strictly-necessary.md)'s spirit of proving the procedure cheaply. |

## Consequences

- Point 7 is proved on a local remote; the GitHub step is proved once, when the owner says.

## Related

[0077](0077-github-through-existing-cli-login.md), [0093](0093-server-merges-no-pull-requests.md), [0100](0100-floor-actions.md).
