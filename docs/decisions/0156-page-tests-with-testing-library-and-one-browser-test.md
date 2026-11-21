# 0156. The page is tested with Testing Library, plus one headless browser test with screenshots

- Status: Accepted
- Scope: Making premise
- Date: 2026-11-21
- Decided by: The builders, while building the page and the page server. The owner did not make this choice.
- Source: [0109](0109-vitest-and-kept-demos.md); the task that built the page.

## Context

- premise's tests run in Vitest ([0109](0109-vitest-and-kept-demos.md)). The page's quality bar is its first-run path, which a reviewer needs to see as well as test.

## Decision

- Component tests render the page's views in jsdom with Testing Library, against a fake API, in the same Vitest run.
- One browser test (`test/browser/first-run.test.ts`) starts premise on a free port with the stand-in line and scripted agents, opens the printed link in Playwright's headless Chromium, and walks from the welcome page to the end of the line. It saves a screenshot of each main state into `test-artifacts/screenshots/` (or `PREMISE_SCREENSHOTS`).
- CI installs Playwright's headless Chromium before the tests; the tests themselves reach no network.

## Reason

- Testing Library tests the page the way a person uses it, by role and label. One real-browser test proves the whole path, including the event stream, which jsdom cannot.

## Alternatives considered

| Alternative | Why rejected |
| --- | --- |
| A separate Playwright test runner | Two runners and two configurations for one test. |
| No browser test | The event stream and the real layout would go untested. |
| The browser already on the machine | Not the same everywhere; Playwright's Chromium is pinned to its version. |

## Consequences

- `npm test` needs the page built (`npm run build`) and Playwright's Chromium installed (`npx playwright install chromium-headless-shell`); the browser test says so when either is missing.

## Related

[0109](0109-vitest-and-kept-demos.md), [0155](0155-the-page-is-readable-at-phone-width.md).
