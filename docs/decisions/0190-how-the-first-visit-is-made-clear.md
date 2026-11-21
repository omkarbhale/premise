# 0190. How the first visit is made clear

- Status: Accepted
- Scope: Making premise
- Date: 2026-11-21
- Decided by: The builders; the choices marked "chosen for the owner" are the owner's to correct.
- Source: the fresh-eyes walkthrough of the first visit (a person who had read only the README quick start), and [0135](0135-the-experience-works-without-the-guide.md).

## Context

A walkthrough from a clean copy found no blocker, but several first-visit problems: `--help` after a command started a real-mode server, the README's quick start hid the no-AI route, a declined build showed green ticks, a refresh opened the wrong software, and about thirty premise words arrived in the first three screens.

## Decision

1. **Help and flags.** `--help` or `-h` anywhere prints help and does nothing else. A flag premise does not know is an error that says nothing was started and exits with 2.
2. **The setup check does not create the data folder.** It says whether the folder exists and, if not, that premise creates it when it starts.
3. **Declining to build** takes one confirm ("Yes, do not build it"). Build, Check and Run then show as skipped, never done or passed; the software reads "Ended: not built"; no "Start it" shows for something that was never built; an earlier "Outcome:" record item is marked "Superseded by" the later one.
4. **One place for each ask.** On a software's own page the status says "Your turn: answer below"; the pointer "Waiting on you" stays on cards for other softwares and on other pages. The message box says in its label and button whether it adds a correction to the open list or asks for a change. A choice answers in one click.
5. **Words in place.** Each premise word is explained the first time it appears on the page (a short gloss after it), then the word alone with the meaning as a tooltip; Help lists them all. A first visit shows Softwares, Waiting on you (once there is something), and Help; Activity, Usage and Settings are under "More". A software shows Conversation and Report; Line, Record and Intake are under "More views" (chosen for the owner).
6. **The say-back** shows no sentence twice and keeps must/should/could the same as the What list; "Suggestion:" shows once, as the mark. After a strike the redone list shows "You struck: … because: …".
7. **Cards say what they are.** A milestone's "go on?" card is named by the milestone's title and has "Open it" and "See the report". An approval card says it is not real in scripted mode, shows where the work is now, and says why it asks now.
8. **Links.** The open software is kept in the link (`#token=…&software=…`) so a refresh returns to it; with none named, the software waiting on you opens. The page follows a changed token without a reload, says "This link is old" after a restart, and shows its real address in the example.
9. **The first-screen note** matches the mode: scripted agents say it is a demo and nothing real is built; real agents say the work is real. Existing software has a marked place on the first screen that says honestly it is not there yet; the task that adds it replaces that.
10. **The report** leads with one headline (built and checked, out of what was asked) and how to try it, including the folder; ids and versions sit behind "details".
11. **Narrow screens.** Nothing overflows at phone width, the open question comes before the list of softwares, and the conversation is part of the page, not a clipped inner box (the last twelve messages, the rest on request).
12. **Quieter, safer install.** `@fastify/static` is raised to 10 and the lockfile updated, which clears the four reported vulnerabilities, and the esbuild install script is allowed in `package.json`.
13. **Mocked usage** is not shown on a software's page, only on the Usage tab, labelled.

## Reason

Each follows from a finding in the walkthrough. Showing less at first, and explaining a word where it first shows, costs the newcomer least; everything is still reachable.

## Alternatives considered

| Alternative | Why rejected |
| --- | --- |
| Link every term to Help | Sends the reader away from what they were doing; a gloss in place does not. |
| Remove the rarely used tabs | They matter once work is under way; they are collapsed, not removed. |
| Leave install warnings and explain them | The advisories were real and the fix was a tested version bump. |

## Consequences

- API additions: ask `milestone`, `struckBefore`, approval `waiting`, report `headline` and `running.folder`, run `folder`.
- Not done here: how bugs are routed (separate task).

## Related

[0135](0135-the-experience-works-without-the-guide.md), [0165](0165-the-page-shows-three-phases.md), [0187](0187-kept-demos-and-one-real-run.md).
