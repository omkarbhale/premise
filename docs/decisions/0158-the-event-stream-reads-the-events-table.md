# 0158. The event stream reads the events table, and the link can be renewed from the terminal

- Status: Accepted
- Scope: The plan
- Date: 2026-11-21
- Decided by: The builders, while building the page and the page server. The owner did not make this choice.
- Source: [page server spec](../specs/page-server.md) 3.1, 5.4; [0070](0070-http-and-server-sent-events.md), [0078](0078-session-token-and-header-checks.md).

## Context

- Every module already writes what happens to the `events` table. Each open page has one server-sent event stream ([0070](0070-http-and-server-sent-events.md)), and a reconnecting page must get what it missed.
- The spec names a "New link" operation but no command for it.

## Decision

- The stream sends new rows of `events` to every open page, each with its row id, and replays what a reconnecting page missed after its `Last-Event-ID` (up to 500 events). It sends only the id, time, software, module and kind; the page then fetches what changed through the API. A comment line every 15 seconds keeps idle connections open.
- A browser's EventSource cannot send headers, so the stream alone takes the session token in its URL; every other API request must use the header.
- `premise new-link` (`npm run new-link`) issues a new token and prints the link; older links stop working at once, including in pages already open, which then say how to get the new one.
- The page server's HTTP responses tell the browser not to frame the page, not to send a referrer, and to load nothing from other sites.

## Reason

- Reading the one table every module writes means no module has to remember to publish, and replay comes for free from the row ids. Sending only what changed keeps event details, which may hold paths or text, inside the authenticated API.

## Alternatives considered

| Alternative | Why rejected |
| --- | --- |
| An in-process publish call in every module | Each module would have to remember it; a forgotten call would leave pages stale. |
| Full event details in the stream | Duplicates the API, and widens what the URL-token stream exposes. |
| New link only by restarting premise | Stops running work to replace a link. |

## Consequences

- The page reloads its views shortly after each burst of events.

## Related

[0070](0070-http-and-server-sent-events.md), [0078](0078-session-token-and-header-checks.md), [0079](0079-localhost-only.md).
