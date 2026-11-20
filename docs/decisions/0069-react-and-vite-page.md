# 0069. The page is React, built with Vite, served as static files

- Status: Accepted
- Scope: The plan
- Date: 2026-11-21
- Decided by: The builders, in the plan of 2026-11-21. The owner did not make this choice.
- Source: Old docs/plan.md, P3 (section 1, "The parts and how they talk").

## Context
- People use premise through one browser page: a chat, plus views of the record and of reports ([0044](0044-one-browser-page.md)).
- Everything is open in one session on that page ([0065](0065-one-open-session.md)).

## Decision
The page is React, built with Vite, served by the server as static files.

## Reason
The builders are LLM agents, and they are most reliable on the most common stack.

## Alternatives considered
| Alternative | Why rejected |
| --- | --- |
| Hand-written DOM code | More code to get right. |
| Less common frameworks | The plan gives no further reason beyond the one above: builders are most reliable on the most common stack. |

## Consequences
- Carried in [architecture overview](../architecture/overview.md).
- Implemented by the [page](../specs/page.md) and [page server](../specs/page-server.md) specs.

## Related
[0070](0070-http-and-server-sent-events.md), [0075](0075-one-package.md).
