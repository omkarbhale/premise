# 0157. Browser notifications are offered on the page, not asked for on first open

- Status: Accepted
- Scope: The plan
- Date: 2026-11-21
- Decided by: The builders, while building the page and the page server. The owner did not make this choice.
- Source: [page spec](../specs/page.md) section 6; [0099](0099-notices-in-the-session.md).

## Context

- The page spec's `page.notifications` default was "asks permission on first open" ([0099](0099-notices-in-the-session.md)).
- Browsers show their own permission prompt; asked unprompted, before a person knows what premise is, it is usually refused, and a refusal cannot be undone from the page.

## Decision

- `page.notifications` is `"offer"` (default) or `"off"`.
- With `"offer"`, the "Waiting on you" view shows a button, "Notify me when something new is waiting". The browser's prompt appears only when the person presses it.
- Once allowed, the page notifies of each new ask while the page is hidden. The tab title always shows the count of open asks.

## Reason

- People accept a notification when they know what it is for; the count in the tab title covers everyone else.

## Alternatives considered

| Alternative | Why rejected |
| --- | --- |
| Ask on first open | Asked before the person knows premise; often refused for good. |
| No notifications | The spec wants them while the page is open ([0099](0099-notices-in-the-session.md)). |

## Consequences

- The [configuration reference](../reference/configuration.md) lists `page.notifications`.

## Related

[0099](0099-notices-in-the-session.md), [0027](0027-spend-least-of-peoples-attention.md).
