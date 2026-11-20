# 0065. One session where everything is open, as if one person does everything

- Status: Accepted
- Partly supersedes: [0045](0045-a-link-per-person-no-accounts.md): the link per person
- Scope: The plan
- Date: 2026-11-21
- Decided by: The owner: "Have it be all open and accessible on a single session in web UI. See what each role needs and all that stuff in there, similar to assuming one single person will be doing everything"
- Source: Old docs/decisions.md entry 65, which quotes the owner from the assistant's notes of the 2026-11-21 conversations; those notes are not kept in this repository.

## Context

- **How it got here:** the owner asked where people converse on premise, was told the web page with a link per person ([0045](0045-a-link-per-person-no-accounts.md)), and answered with the words below.

## Decision

- There are no per-person links.
- Everything is open and answerable in one session on the web page: every stage, the record, reports, and what each role needs or is being asked.
- It is designed as if one person does everything.
- Roles stay as labels on what is asked, so every ask still says which role it is for.
- No accounts until other people set premise up ([0045](0045-a-link-per-person-no-accounts.md), which stands for this part).

## Reason

- No reason was recorded. Owner: "Have it be all open and accessible on a single session in web UI. See what each role needs and all that stuff in there, similar to assuming one single person will be doing everything"

## Alternatives considered

| Alternative | Why rejected |
| --- | --- |
| A link per person ([0045](0045-a-link-per-person-no-accounts.md)) | The owner asked for everything to be open in one session instead. |

## Consequences

- **Changes** the "a link per person" part of [0045](0045-a-link-per-person-no-accounts.md). No accounts still stands.
- [0009](0009-everyone-needed-is-a-user.md) still holds: every role is still a user of the product; each role's asks are still in its own terms.
- **In the plan:** premise still listens on the owner's machine only, and the session still needs a token, so other web pages in the same browser cannot drive it. Being reached from other machines stays a later, security-sensitive decision for the owner ([where it runs](../architecture/where-it-runs.md), [0078](0078-session-token-and-header-checks.md), [0079](0079-localhost-only.md)).

## Related

[0044](0044-one-browser-page.md), [0045](0045-a-link-per-person-no-accounts.md), [0009](0009-everyone-needed-is-a-user.md), [the page](../specs/page.md).
