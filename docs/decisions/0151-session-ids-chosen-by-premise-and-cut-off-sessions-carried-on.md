# 0151. premise chooses each session's id, and carries a cut-off session on in the same working copy

- Status: Accepted
- Scope: Milestone 1
- Date: 2026-11-21
- Decided by: The builders, while building the agent runner. The owner did not make this choice.
- Source: Building the [agent runner](../specs/agent-runner.md); the [test record](../record/subscription-sandbox-test-2026-11-21.md), point 7.

## Context

- Each session's id is recorded against its task, so usage can be attributed ([agent runner](../specs/agent-runner.md) 5.5). The test took the id from the session's first event.
- The work queue records a session the moment it starts, before Claude Code has said anything.
- The test showed `--resume` keeps the session's id and its memory of the work, when run in the same folder.

## Decision

- premise gives each new session an id of its own choosing (`--session-id`) and records it at once. The id in the session's first event is still the one that counts: if it differs, the record is corrected when the session ends.
- A job whose last session was cut off rather than finished (the usage limit, a pause, or premise stopping) carries that session on with `--resume`, in the same working copy, which is kept for that reason. Its first message says it was cut off and should carry on.
- A job whose session failed starts a new session, in a fresh working copy, told what failed.

## Reason

- The id is known before the first event, so the session record never lacks one.
- Carrying a session on keeps the work done before the usage limit, instead of paying for it twice.

## Alternatives considered

| Alternative | Why rejected |
| --- | --- |
| Record the session only after its first event | The record would be missing for sessions that fail before speaking. |
| Always start afresh after a pause | Repeats work already paid for. |

## Consequences

- [Agent runner](../specs/agent-runner.md) 5.1 and 5.6 say so; the work queue passes the cut-off session's id to the runner.

## Related

[0071](0071-headless-claude-code-agents.md), [0086](0086-working-copy-and-branch-per-change.md), [0107](0107-one-part-knows-the-runtime.md).
