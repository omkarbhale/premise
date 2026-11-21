# 0148. A scripted agent, driven by a script file, stands in for Claude in every test

- Status: Accepted
- Scope: The plan
- Date: 2026-11-21
- Decided by: The builders, while building the foundation. The owner did not make this choice.
- Source: [0134](0134-the-owners-claude-login-only-when-strictly-necessary.md), [0108](0108-scripted-operator-for-demos.md), [0107](0107-one-part-knows-the-runtime.md).

## Context

- Tests and demos must not use the owner's Claude login ([0134](0134-the-owners-claude-login-only-when-strictly-necessary.md)). The agent runner is the only part that knows the runtime ([0107](0107-one-part-knows-the-runtime.md)).

## Decision

- The agent runner is an interface. Two implementations sit behind it: the scripted agent, and later the Claude Code runner.
- The scripted agent reads a JSON script file that says, per type of task, what it emits and how it ends (done, failed, stuck, or a usage-limit event), so a test or demo can drive every path of the line the same way each time.
- The scripted agent is the default agent mode.

## Reason

- Proves premise's procedure without an LLM, the same way every run.

## Alternatives considered

| Alternative | Why rejected |
| --- | --- |
| Recorded Claude Code transcripts replayed | Ties tests to one runtime's output format; the interface is what the rest of premise sees. |

## Consequences

- The page says when agents are scripted ([0135](0135-the-experience-works-without-the-guide.md)).

## Related

[0108](0108-scripted-operator-for-demos.md), [0109](0109-vitest-and-kept-demos.md).
