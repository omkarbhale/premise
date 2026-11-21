# 0154. A stand-in line walks the page through the eleven stages until the line engine exists

- Status: Partly superseded by [0183](0183-how-the-line-engine-is-built.md): the line engine replaces the stand-in up to Plan; Build, Check, Run, Report and Intake stay a stand-in until their own task
- Scope: Milestone 1
- Date: 2026-11-21
- Decided by: The builders, while building the page and the page server. The owner did not make this choice.
- Source: [page server spec](../specs/page-server.md), [page spec](../specs/page.md), [0135](0135-the-experience-works-without-the-guide.md), [0134](0134-the-owners-claude-login-only-when-strictly-necessary.md).

## Context

- The page and the page server are built before the line engine, the record keeper and the reporter. Without them, a page has nothing to show: no asks, no record, no report.
- The first-run experience must work for someone who has not read any guide ([0135](0135-the-experience-works-without-the-guide.md)), and tests may not call an AI ([0134](0134-the-owners-claude-login-only-when-strictly-necessary.md)).

## Decision

- The page server talks to the rest of premise through small service interfaces (`src/server/services.ts`): softwares, conversation, asks, record view, report view and activity. The line engine, record keeper and reporter each replace one of them when they are built.
- Until then a stand-in line (`src/demo/`) answers them. It walks a software through the eleven stages with fixed drafts filled with the operator's own words, writes real asks and chat messages to the database (`asks`, `chat_messages`), and queues real jobs for the scripted agent, so the activity view shows real queue work.
- The stand-in calls no AI, creates no repository and starts nothing. The page labels it "Stand-in" wherever its output appears, and its texts say what a real stage would do.
- When no script file is set, the scripted agent takes `agents.scripted.step_seconds` (default 2) per job and says what it is doing, so a person can watch work move.

## Reason

- The page's quality bar is the first-run path, which needs the whole line to be walkable. Narrow interfaces let the real modules plug in one at a time without changing the page or its API.

## Alternatives considered

| Alternative | Why rejected |
| --- | --- |
| Wait for the line engine | The page could not be built or tested end to end until then. |
| Fake data held only in the page | Nothing would be stored or streamed; the server's API and event stream would go untested. |
| Scripted jobs that finish at once | The activity view would never show work in progress. |

## Consequences

- `asks` and `chat_messages` arrive with the page server, in schema 2, rather than with the line engine; the line engine uses them as they are.
- When the line engine lands, it replaces `src/demo/stand-in-line.ts` behind the same interfaces, and the page's "Stand-in" labels go.

## Related

[0148](0148-scripted-agent-driven-by-a-script-file.md), [0133](0133-usage-ledger-is-mocked-until-it-exists.md), [line engine spec](../specs/line-engine.md).
