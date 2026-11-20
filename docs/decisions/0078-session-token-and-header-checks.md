# 0078. The session link carries a long random token; Host and Origin checked

- Status: Accepted
- Scope: The plan
- Date: 2026-11-21
- Decided by: The builders, in the plan of 2026-11-21. The owner did not make this choice.
- Source: Old docs/plan.md, P12 (section 2, "One session").

## Context
- Everything is open and answerable in one session on the page, designed as if one person does everything; there are no per-person links ([0065](0065-one-open-session.md)).
- No accounts until other people set premise up ([0045](0045-a-link-per-person-no-accounts.md)).
- premise listens on the owner's machine ([0079](0079-localhost-only.md)).

## Decision
- The session's link carries a long random token.
- Every request needs it.
- The server also checks the Host and Origin headers.

## Reason
Without it, any other web page open in the same browser could drive premise on localhost.

## Alternatives considered
| Alternative | Why rejected |
| --- | --- |
| No token for requests from the owner's own machine | Any other web page in the same browser could drive premise. |
| A link per person | Replaced by one open session ([0065](0065-one-open-session.md)). |

## Consequences
- One command starts premise and prints the session's link.
- Carried in [where it runs](../architecture/where-it-runs.md); implemented by the [page server](../specs/page-server.md) spec.

## Related
[0070](0070-http-and-server-sent-events.md), [0079](0079-localhost-only.md).
