# 0147. SQLite through Node.js's built-in module

- Status: Accepted
- Scope: The plan
- Date: 2026-11-21
- Decided by: The builders, while building the foundation. The owner did not make this choice.
- Source: [0072](0072-sqlite-state.md), [storage](../specs/storage.md).

## Context

- premise keeps its own state in SQLite ([0072](0072-sqlite-state.md)), on the current Node.js LTS ([0068](0068-fastify-on-node-lts.md)).

## Decision

- premise opens its database with Node.js's built-in `node:sqlite` module. No native database package is installed.
- Numbered migrations run at start; tables arrive with the module that owns them, so the foundation creates only the tables it uses (softwares, page tokens, jobs, agent sessions, events, settings).

## Reason

- No native build step, so a clean install works on any machine with Node.js.

## Alternatives considered

| Alternative | Why rejected |
| --- | --- |
| better-sqlite3 | A native package that must be built or downloaded per platform. |
| Every table of the storage specification at once | Tables no code uses yet would be guesses until their module is built. |

## Consequences

- Node.js 22.13 or later is required; the setup check says so.

## Related

[0072](0072-sqlite-state.md), [0075](0075-one-package.md).
