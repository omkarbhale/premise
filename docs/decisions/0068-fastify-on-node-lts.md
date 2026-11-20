# 0068. The server uses Fastify on the current Node.js LTS

- Status: Accepted
- Scope: The plan
- Date: 2026-11-21
- Decided by: The builders, in the plan of 2026-11-21. The owner did not make this choice.
- Source: Old docs/plan.md, P2 (section 1, "The parts and how they talk").

## Context
- premise is written in TypeScript ([0047](0047-typescript.md)) and is one Node.js process ([0067](0067-one-process-agents-as-children.md)).
- The page server serves the page and its API.

## Decision
The server uses Fastify on the current Node.js LTS.

## Reason
- Typed request validation is built in.
- Node.js is what Claude Code itself runs on.

## Alternatives considered
| Alternative | Why rejected |
| --- | --- |
| Express | No built-in validation. |
| Bun or Deno | Less common under the tools premise drives. |

## Consequences
- Node.js LTS is a prerequisite checked at every start ([where it runs](../architecture/where-it-runs.md)).
- Carried in [architecture overview](../architecture/overview.md); implemented by the [page server](../specs/page-server.md) spec.

## Related
[0067](0067-one-process-agents-as-children.md), [0070](0070-http-and-server-sent-events.md).
