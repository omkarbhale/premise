# 0153. A session's confinement names the other folders that exist when it starts

- Status: Accepted
- Scope: Milestone 1
- Date: 2026-11-21
- Decided by: The builders, while building the agent runner. The owner did not make this choice.
- Source: The [test record](../record/subscription-sandbox-test-2026-11-21.md), "What failed and why", points 2 and 3.

## Context

- Every session's working copy is under `work/` in premise's data folder ([0086](0086-working-copy-and-branch-per-change.md)).
- The test found that a denied folder also denies everything inside it, even a folder that is explicitly allowed, and that denying a parent while allowing a child made the child read-only. What worked was denying the other folders one by one.

## Decision

- Each session's generated settings deny, one by one: everything in premise's data folder but `work/`; inside `work/`, every folder but the path down to the session's own working copy; the usual credential files and folders in the home folder (SSH, GnuPG, cloud and container logins, `.netrc`, `.git-credentials`, `.npmrc`, the GitHub CLI's and Claude Code's logins); the Claude Code configuration folder when one is set; and any path in `agents.confinement.extra_denied_paths`.
- Reads of these are denied to the sandbox and to the file tools; writes are allowed in the session's own working copy only, and only for roles that write.
- Known limit: a folder created after a session started is not in that session's list. A session that is already running can read the working copy of a session started after it.

## Reason

- It is the form the test proved. A form that closes the known limit (denying `work/` and allowing the session's own folder for both reading and writing) could not be tested on this machine, because socat was missing.

## Alternatives considered

| Alternative | Why rejected |
| --- | --- |
| Deny `work/` and allow the session's own folder | The test showed the own folder becomes read-only or denied; a variant with write allowed is untested. |
| A container per session | Superseded by [0125](0125-the-claude-code-sandbox-is-the-confinement.md): Docker would become a prerequisite. |

## Consequences

- The known limit is listed in the [open questions](../open-questions.md) and filed as an issue to test the alternative once socat is installed.
- [Agent runner](../specs/agent-runner.md) 5.2 says so.

## Related

[0087](0087-agents-run-confined.md), [0125](0125-the-claude-code-sandbox-is-the-confinement.md).
