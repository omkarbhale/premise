# 0067. One Node.js process holds every module; agents are its child processes

- Status: Accepted
- Scope: The plan
- Date: 2026-11-21
- Decided by: The builders, in the plan of 2026-11-21. The owner did not make this choice.
- Source: Old docs/plan.md, P1 (section 1, "The parts and how they talk").

## Context
- The plan splits premise into parts: the server with its modules (page server, line engine, record keeper, work queue, agent runner, gate, runner, intake, reporter), agents, the page, storage, and tools underneath.
- premise runs on the owner's machine first ([0043](0043-runs-on-the-owners-machine-first.md)) and is written in TypeScript ([0047](0047-typescript.md)).
- Implementation is free ([0005](0005-implementation-is-free.md)).

## Decision
- One Node.js process on the owner's machine holds every module of the server.
- Agents are child processes of that server.
- Inside the server, modules talk by plain function calls; anything that must survive a crash goes through the work queue's table.

## Reason
One command starts premise on the owner's machine; nothing to wire together or keep in step.

## Alternatives considered
| Alternative | Why rejected |
| --- | --- |
| Separate services for the page, the line and the agents | The plan gives no further reason beyond the one above: more to wire together and keep in step. |

## Consequences
- Carried in [architecture overview](../architecture/overview.md).
- Implemented by the [page server](../specs/page-server.md), [work queue](../specs/work-queue.md) and [agent runner](../specs/agent-runner.md) specs.

## Related
[0068](0068-fastify-on-node-lts.md), [0071](0071-headless-claude-code-agents.md), [0075](0075-one-package.md).
