# 0142. The setup check names bubblewrap and socat and how to install them; real agents do not start without them

- Status: Accepted, chosen for the owner; open to the owner's correction
- Scope: The plan
- Date: 2026-11-21
- Decided by: The assistant, for the owner, on the owner's instruction "choose for me" ([0136](0136-open-questions-chosen-for-the-owner.md)). Open to the owner's correction.
- Source: [The owner's instruction of 2026-11-21 that started the build](../record/instruction-2026-11-21-build-starts.md); [open questions](../open-questions.md) as they stood before it.

## Context

- On Linux and WSL2, Claude Code's sandbox needs bubblewrap and socat; if either is missing, agents do not run and work stopped for the owner ([0125](0125-the-claude-code-sandbox-is-the-confinement.md)).

## Decision

- premise's setup check (`premise doctor`, and the check at every start) names bubblewrap or socat when missing, with the command that installs it.
- premise refuses to start real agents without them. Scripted agents need neither.

## Reason

- Installing them needs the owner's administrator password, so premise names them rather than installing them.
- Running agents unconfined is security-sensitive ([0053](0053-when-work-stops-for-the-owner.md)).

## Alternatives considered

| Alternative | Why rejected |
| --- | --- |
| Install them automatically | Needs the administrator password. |
| Run unconfined with a warning | Security-sensitive. |

## Consequences

- Carried by the setup check and the [agent runner](../specs/agent-runner.md).

## Related

[0087](0087-agents-run-confined.md), [0125](0125-the-claude-code-sandbox-is-the-confinement.md).
