# 0152. Until their module is built, agent tools record the call and say nothing more comes of it

- Status: Accepted
- Scope: Milestone 1
- Date: 2026-11-21
- Decided by: The builders, while building the agent runner. The owner did not make this choice.
- Source: Building the [agent tools](../specs/agent-tools.md) before the record keeper, the gate and the line engine exist.

## Context

- The agent runner is built before the modules that act on most tools: the [record keeper](../specs/record-keeper.md), the [gate](../specs/gate.md), the [line engine](../specs/line-engine.md), [intake](../specs/intake.md) and the [reporter](../specs/reporter.md).
- Agents are told by their prompts to use these tools.

## Decision

- Every tool is served to the roles that have it, and every call is checked (token, role, closed job, paused queue) and recorded as an event, exactly as specified.
- `progress` and `task_finish` work fully. `ask` checks its shape (a role, a kind, one to `tools.ask_max_items` items).
- A tool whose module is not built answers `ok` with status `recorded` and a plain note: premise recorded the call, the part that acts on it is not built yet, carry on without waiting and say in the final message what is still open. `record_read` and `facts_read` answer with nothing to read, and say why.
- When a module is built, it takes over its tools; the stubs go.

## Reason

- Agents keep working, and nothing they ask for is lost: the call and its input are in the events.
- The answer says plainly that nothing will happen, so no agent waits for an answer that will not come ([0097](0097-reports-from-recorded-facts.md)).

## Alternatives considered

| Alternative | Why rejected |
| --- | --- |
| Leave the tools out until their module exists | Prompts name them; agents would fail on a missing tool. |
| Answer with an error | An error tells the agent to retry or stop, which is wrong when only the follow-up is missing. |

## Consequences

- [Agent tools](../specs/agent-tools.md) says which tools are stubs for now.

## Related

[0073](0073-mcp-tools-with-session-tokens.md), [0116](0116-outside-content-is-data.md).
