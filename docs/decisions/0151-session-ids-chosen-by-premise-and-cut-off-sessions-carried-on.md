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

- premise gives each new session an id of its own choosing (`--session-id`) and records the session at once, with no runtime id. The id is written to the record when the session's first event confirms it.
- A job whose last session was cut off rather than finished (the usage limit, a pause, or premise stopping) carries that session on with `--resume` only if its id was confirmed, in the same working copy, which is kept for that reason. Its first message says it was cut off and should carry on.
- A session cut off before its id was confirmed was never known to Claude Code, so it is not resumed: the job starts afresh.
- A job whose session failed starts a new session, in a fresh working copy, told what failed.

## Reason

- The session record exists from the start, but an id Claude Code has not confirmed is never resumed, which would fail with "no conversation found".
- Carrying a session on keeps the work done before the usage limit, instead of paying for it twice.

## Alternatives considered

| Alternative | Why rejected |
| --- | --- |
| Record the id at once and resume it whatever happens | A session cut off before its first event would be resumed under an id Claude Code never saw. |
| Always start afresh after a pause | Repeats work already paid for. |

## Consequences

- [Agent runner](../specs/agent-runner.md) 5.1 and 5.6 say so; the work queue passes the cut-off session's id to the runner.

## Related

[0071](0071-headless-claude-code-agents.md), [0086](0086-working-copy-and-branch-per-change.md), [0107](0107-one-part-knows-the-runtime.md).
