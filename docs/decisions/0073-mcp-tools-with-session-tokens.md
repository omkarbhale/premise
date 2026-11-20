# 0073. Agent tools over MCP, with a token per session

- Status: Accepted
- Scope: The plan
- Date: 2026-11-21
- Decided by: The builders, in the plan of 2026-11-21. The owner did not make this choice.
- Source: Old docs/plan.md, P7 (section 1, "The parts and how they talk").

## Context
- Agents reach premise only through tools the server serves to that one session: read the record, propose a record change, ask a person, request a gated action, report progress.
- Agents cannot write the record, push, or reach another session's tools.
- The check must be out of the builder's reach ([0030](0030-independent-check.md)).

## Decision
- The server serves each agent's tools over MCP.
- Each session gets its own token, which binds every call to one session and one role.

## Reason
- Claude Code connects to MCP servers natively.
- The token binds every call to one session and one role, so a builder cannot call the checker's tools.

## Alternatives considered
| Alternative | Why rejected |
| --- | --- |
| Agents calling premise through shell commands | No per-role limits. |

## Consequences
- Carried in [architecture overview](../architecture/overview.md).
- Implemented by the [agent tools](../specs/agent-tools.md) catalog and the [agent runner](../specs/agent-runner.md) spec.

## Related
[0071](0071-headless-claude-code-agents.md), [0087](0087-agents-run-confined.md), [0113](0113-agent-roles.md).
