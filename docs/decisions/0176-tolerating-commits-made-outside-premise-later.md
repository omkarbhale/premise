# 0176. Tolerating commits made outside premise: later

- Status: Accepted
- Scope: The plan
- Date: 2026-11-21
- Decided by: The owner, on the assistant's seven suggestions: "I agree on 1, 2, 3. Put 4, 5, on later. I agree on 6, 7, and I agree on what you said to push later." (suggestion 5)
- Source: [The owner on scale, direction and order](../record/scale-and-direction-2026-11-21.md)

## Context

- premise expects changes through its own line, with a trace trailer on every commit ([0083](0083-trace-trailer-on-every-commit.md)); the assistant suggested tolerating commits made by hand or by other tools.

## Decision

- Put on later, not built now.
- One GitHub issue is filed: [issue 63](https://github.com/omkarbhale/premise/issues/63).

## Reason

- Owner: "Put 4, 5, on later." No further reason was recorded.

## Alternatives considered

| Alternative | Why rejected |
| --- | --- |
| Build it now | The owner put it on later. |

## Consequences

- Nothing changes for now. Existing software in its thin form ([0170](0170-existing-software-much-earlier-in-a-thin-form.md)) takes a software as it is; living alongside hand work in it is the later part.

## Related

[0083](0083-trace-trailer-on-every-commit.md), [0121](0121-recovered-trace-file.md), [0149](0149-left-out-suggestions-become-github-issues.md).
