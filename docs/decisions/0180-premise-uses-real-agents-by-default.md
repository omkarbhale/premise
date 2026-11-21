# 0180. premise works with real agents by default; the login limit is for making premise

- Status: Accepted
- Scope: The product
- Date: 2026-11-21
- Decided by: The owner: "Ohh sorry I just realised a confusion. I want premise to call AI, but not us in the development process too much."
- Source: The owner's correction of 2026-11-21, relayed during the line engine's build.
- Clarifies: [0134](0134-the-owners-claude-login-only-when-strictly-necessary.md). Partly supersedes: [0137](0137-first-software-is-usage-ledger.md), where it says the first software waits for the owner to allow real agent work.

## Context

- [0134](0134-the-owners-claude-login-only-when-strictly-necessary.md) limits the owner's Claude login to Haiku, low effort, very sparingly. It was read as limiting premise itself, so premise's default was the scripted agent, and [0137](0137-first-software-is-usage-ledger.md) said the first software waits for the owner to allow real agent work.

## Decision

- premise, the product, uses real Claude Code agents as its normal way of working. `agents.mode` defaults to `"claude"`. The per-task model and effort defaults stay real working values.
- [0134](0134-the-owners-claude-login-only-when-strictly-necessary.md) stays, and is about making premise: tests, demos run while building, and CI. They set `agents.mode` to `"scripted"` explicitly, so no test ever calls AI.
- When real agents cannot start (Claude Code, bubblewrap or socat missing), premise still starts. Agent work waits, the page says plainly what is missing and how to fix it, and offers a look around with scripted agents until premise restarts, labelled as not real.
- The first real run of a software through premise does not wait for a separate permission: it is simply the owner's to start.

## Reason

- The owner's words: premise should call AI; the development process should not, much.

## Alternatives considered

| Alternative | Why rejected |
| --- | --- |
| Keep "scripted" as the default | The product would do nothing real unless reconfigured. |
| Refuse to start when real agents cannot run | Someone new could not even look; the page is the place to say what is missing. |
| Fall back to scripted agents silently | Scripted output could be taken for real work. |

## Consequences

- The configuration reference, the README, the setup check's message and the tests change to match.

## Related

[0125](0125-the-claude-code-sandbox-is-the-confinement.md), [0134](0134-the-owners-claude-login-only-when-strictly-necessary.md), [0137](0137-first-software-is-usage-ledger.md), [0142](0142-setup-check-names-bubblewrap-and-socat.md), [0148](0148-scripted-agent-driven-by-a-script-file.md).
