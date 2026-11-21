# 0150. Agent tools are served over MCP's plain HTTP form by premise itself; session tokens live in memory

- Status: Accepted
- Scope: Milestone 1
- Date: 2026-11-21
- Decided by: The builders, while building the agent runner. The owner did not make this choice.
- Source: Building the [agent tools](../specs/agent-tools.md) for the real agent runner.

## Context

- Agents reach premise only through tools served over MCP, each session with its own token ([0073](0073-mcp-tools-with-session-tokens.md)).
- The [agent tools](../specs/agent-tools.md) specification said the token's hash is stored in `agent_sessions`.
- A Claude Code session cannot outlive the premise process that started it: when premise stops, its sessions end, and a resumed job gets a new session and a new token ([agent tools](../specs/agent-tools.md) 8).

## Decision

- premise answers MCP itself, inside the page server, at `POST /mcp` on this machine's address: one JSON-RPC message (or a batch) per request, answered with JSON. No stream is held open, because no tool calls the agent back.
- Each session's token is random, sent as `Authorization: Bearer <token>`, and only its hash is kept, in memory. It is revoked when the session ends; a revoked token answers `TASK_CLOSED`.
- The token is never stored in the database, and the session's MCP configuration file holding it is removed when the session ends.

## Reason

- MCP's plain HTTP form needs a few dozen lines; a client library would add a dependency for no gain ([0024](0024-no-other-tools-unless-they-match-the-vision.md)).
- A token that cannot outlive its session has no reason to be written to disk, where it would only add something to protect.

## Alternatives considered

| Alternative | Why rejected |
| --- | --- |
| The official MCP server library | A dependency for what a few dozen lines do. |
| Token hashes in `agent_sessions` | Sessions end with the process; a stored hash would outlive the only thing it could open. |
| A separate port for the tools | One more port to keep to this machine; the page server already checks Host and Origin ([0078](0078-session-token-and-header-checks.md)). |

## Consequences

- [Agent tools](../specs/agent-tools.md) 3.1 and [storage](../specs/storage.md) say so.
- `/mcp` is outside `/api`: the page's link token does not open it, and a session token opens nothing else.

## Related

[0073](0073-mcp-tools-with-session-tokens.md), [0078](0078-session-token-and-header-checks.md), [0079](0079-localhost-only.md).
