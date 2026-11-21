# 0155. The page is readable at phone width, in light and dark

- Status: Accepted
- Scope: The plan
- Date: 2026-11-21
- Decided by: The builders, while building the page and the page server. The owner did not make this choice.
- Source: [page spec](../specs/page.md) section 7; the task that built the page.

## Context

- The page spec said a phone-width layout is not a goal before premise can be reached from other machines.
- The page must work for someone who has read no guide ([0135](0135-the-experience-works-without-the-guide.md)); people keep browser windows narrow beside a terminal, and use light or dark settings.

## Decision

- The page's layout works from a phone-width window (about 390 pixels) to a wide desktop window: columns stack, nothing scrolls sideways, and controls stay large enough to touch.
- It follows the browser's light or dark setting.
- It is usable by keyboard alone: a skip link, visible focus, tabs moved with the arrow keys, Enter to send in chat and Ctrl+Enter to start a software.

## Reason

- A narrow window beside a terminal is the common case on the owner's machine; the cost is a few style rules.

## Alternatives considered

| Alternative | Why rejected |
| --- | --- |
| Desktop width only, as the spec said | A narrow window would scroll sideways and hide controls. |

## Consequences

- The browser test checks that nothing scrolls sideways at phone width in dark mode.
- Reach from other machines stays off ([0144](0144-reach-from-other-machines-stays-off.md)); this is about window size only.

## Related

[0069](0069-react-and-vite-page.md), [page spec](../specs/page.md).
