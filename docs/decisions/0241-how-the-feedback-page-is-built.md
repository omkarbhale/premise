# 0241. How the feedback page is built

- Status: Accepted
- Scope: Milestone 4, the rest
- Date: 2026-11-21
- Decided by: The builders; the points marked "chosen for the owner" are the owner's to correct.
- Source: [0119](0119-feedback-page-has-its-own-link.md), the [intake specification](../specs/intake.md), and the task that finished intake.

## Context

- [0119](0119-feedback-page-has-its-own-link.md) gives each software a feedback link that can only submit feedback and show the sender where their item stands. It leaves open what the page is made of, how a sender gets back to their item, whether the link can be shown again, and how a flood is stopped.

## Decision

1. **A plain server-made page at `/feedback/{token}`,** a form with no scripts, so it opens in any browser. It says who can reach it: only people on the machine premise runs on, because premise listens on this machine only ([0079](0079-localhost-only.md)); anyone elsewhere uses GitHub issues once there is a repository. It takes plain text only, up to `intake.max_text_chars`.
2. **A receipt.** Sending feedback redirects to `/feedback/{token}/received/{receipt}`, which shows where that item stands, in words fit for the sender (received, being considered, kept for now, accepted, being worked on, done, answered, closed). It shows no item number, no triage reason and no other item. A merged item shows the standing of the item it joined. The receipt is a long random string, kept with the item; it is the only way back.
3. **The link's token is kept, not only its hash** (chosen for the owner), so the Intake tab can show the link again. The token can do one thing, submit feedback for one software, so keeping it is not like keeping the session token ([0078](0078-session-token-and-header-checks.md)), whose hash alone is kept. "Make a new link" replaces it and the old one stops working at once.
4. **A flood is limited:** `intake.feedback_per_hour` (30, chosen for the owner) items per software per hour; beyond it the page says so in plain words and takes nothing until the hour has passed. `intake.feedback_page` (on) turns every feedback page off.
5. **The page opens without the session token,** so the session's own check does not apply; the host and origin checks ([0078](0078-session-token-and-header-checks.md)) still do, and the same security headers are sent. Nothing under `/api` accepts a feedback link.
6. **premise never sends the link anywhere.** The Intake tab shows it with a copy button; giving it to users is the operator's act.

## Reason

- Builders' note: a form that works without scripts has the smallest reach and the fewest ways to go wrong; a receipt gives the sender their own item and nobody else's; showing the link again matters more to the operator than hiding a token that can do one harmless thing.

## Alternatives considered

| Alternative | Why rejected |
| --- | --- |
| A page that needs scripts | More that can break in someone else's browser; nothing it does needs them. |
| Keeping only the token's hash | The operator could not see the link again, and would have to replace it each time. |
| No limit on feedback | One link in the wrong hands could bury every other item. |

## Consequences

- Storage: `feedback_links` (software, token, created, revoked) and `intake_items.receipt`.
- Item text typed on the page stays in premise's database, as for every source ([0081](0081-nothing-about-people-in-the-repository.md)).

## Related

[Intake](../specs/intake.md), [page server](../specs/page-server.md), [0116](0116-outside-content-is-data.md), [0119](0119-feedback-page-has-its-own-link.md).
