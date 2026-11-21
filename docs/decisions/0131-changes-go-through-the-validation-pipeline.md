# 0131. Changes to premise go through the no-mistakes validation pipeline; the assistant still merges

- Status: Accepted
- Partly supersedes: [0040](0040-fast-i-merge.md) and [0052](0052-fast-i-merge-reconfirmed.md) (that a change goes to a pull request with no automated review-and-test run)
- Scope: Making premise
- Date: 2026-11-21
- Decided by: The owner: "Use no-mistakes pipeline".
- Source: [The owner's instruction of 2026-11-21 that started the build](../record/instruction-2026-11-21-build-starts.md).

## Context

- [0040](0040-fast-i-merge.md), reconfirmed in [0052](0052-fast-i-merge-reconfirmed.md): every change goes straight to a pull request with no automated review-and-test run, and the assistant merges it.

## Decision

- Every change to premise goes through the no-mistakes validation pipeline before it reaches a pull request: automated review, the tests, lint, the type check, the build, the push and the pull request, then continuous integration.
- The assistant still merges, as in [0040](0040-fast-i-merge.md).
- The repository carries the pipeline's commands in `.no-mistakes.yaml` and a continuous-integration workflow that runs the same commands.

## Reason

- No reason was recorded. The owner: "Use no-mistakes pipeline".

## Alternatives considered

| Alternative | Why rejected |
| --- | --- |
| Pull requests with no automated run ([0040](0040-fast-i-merge.md)) | Changed by the owner. |

## Consequences

- **Partly supersedes** [0040](0040-fast-i-merge.md) and [0052](0052-fast-i-merge-reconfirmed.md): the "no automated review-and-test run" part. Who merges stands.
- Described in [how we work](../how-we-work.md#how-changes-ship).
- The tests and continuous integration never call an LLM and never touch the network or GitHub ([0134](0134-the-owners-claude-login-only-when-strictly-necessary.md)).

## Related

[0053](0053-when-work-stops-for-the-owner.md), [0130](0130-the-build-starts-and-covers-all-of-premise.md).
