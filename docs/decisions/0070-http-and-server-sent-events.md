# 0070. Page and server talk by HTTP requests plus server-sent events

- Status: Accepted
- Scope: The plan
- Date: 2026-11-21
- Decided by: The builders, in the plan of 2026-11-21. The owner did not make this choice.
- Source: Old docs/plan.md, P4 (section 1, "The parts and how they talk").

## Context
- The page shows live progress of every stage, the record, reports and what is needed ([0065](0065-one-open-session.md)).
- People act on the page: answer, strike, approve.

## Decision
- An HTTP request for every action from the page.
- One server-sent event stream per open page for live updates.

## Reason
Actions are plain requests; only updates flow the other way, which is exactly what server-sent events do.

## Alternatives considered
| Alternative | Why rejected |
| --- | --- |
| WebSockets | Two-way machinery the page does not need. |
| Polling | Slow to show progress. |

## Consequences
- Every request carries the session token ([0078](0078-session-token-and-header-checks.md)).
- Carried in [architecture overview](../architecture/overview.md); implemented by the [page server](../specs/page-server.md) and [page](../specs/page.md) specs.

## Related
[0068](0068-fastify-on-node-lts.md), [0069](0069-react-and-vite-page.md).
