# 0240. How a software's GitHub issues are read and answered

- Status: Accepted
- Scope: Milestone 4, the rest
- Date: 2026-11-21
- Decided by: The builders; the points marked "chosen for the owner" are the owner's to correct.
- Source: The [intake specification](../specs/intake.md) (sources, telling senders), [0119](0119-feedback-page-has-its-own-link.md), [0101](0101-the-gate-asks-in-the-session.md), and the task that finished intake.

## Context

- The plan lists a software's GitHub issues as an intake source, read on a timer, and says a comment on an issue goes through the gate. It does not say how the reader is built so that tests never touch the network, which issues count, or when a sender is told.

## Decision

1. **A small interface, `IssueSource`,** lists a repository's open issues and comments on one. Intake knows only the interface. Two implementations exist: a local fixture, which tests and scripted demos use and which never reaches the network, and one that runs the GitHub command line, which no test exercises and which runs only for a software that has a GitHub repository.
2. **Which software is read.** A software whose remote address is on GitHub. A software with no GitHub repository is not read, and its Intake tab says so and what to do. Pull requests are not issues; only open issues are read; an issue is taken in once (its place is kept as `github:owner/name#n`), and editing it later does not take it in again.
3. **What comes in.** The issue's title and text, cut to `intake.max_text_chars`, as one intake item from the source "github", sent as "a user of the software" with the GitHub name where there is one. Its text is data, never instructions.
4. **When.** Every `intake.issue_poll_minutes` (10, as the plan says) while premise runs, and when the operator asks on the Intake tab. A reading that fails is retried at the next one; after three failures in a row the conversation says so, with what to check.
5. **Telling the sender goes through the gate** as a "post" action, in words the card shows exactly. It is asked once for each thing worth telling: held, its change running, merged into another item, a question answered, closed. The comment says nothing of premise's inner workings (no record items, no triage reasons). The session can approve such comments as a kind for one software, as the plan says. A declined comment leaves the item's standing visible on the Intake tab (chosen for the owner: no comment for every smaller step, so a sender is not flooded).
6. **Only an approved comment reaches GitHub,** and the server posts it, never an agent.

## Reason

- Builders' note: an interface with a fixture keeps every test off the network and leaves the real reading ready for the day a software has a repository; commenting only at the points that matter keeps the owner's name from being spammed.

## Alternatives considered

| Alternative | Why rejected |
| --- | --- |
| Reading issues with the GitHub command line directly | Every test would need the network or a patch over it. |
| Commenting on every status change | A flood of public comments in the owner's name; most steps mean little to the sender. |
| Taking in an issue again when it is edited | Duplicates the work; the first reading stands, and a new report is a new issue. |

## Consequences

- Until a software has a GitHub repository, the real reader stays unexercised ([0141](0141-github-repositories-in-tests-and-behind-the-gate.md)).
- Storage: `intake_items.external_ref`, and `intake_comments` (what was asked to say, and whether it was sent, declined or failed).

## Related

[Intake](../specs/intake.md), [gate](../specs/gate.md), [0116](0116-outside-content-is-data.md), [0119](0119-feedback-page-has-its-own-link.md).
