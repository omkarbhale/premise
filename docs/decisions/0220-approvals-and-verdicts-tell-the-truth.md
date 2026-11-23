# 0220. Approvals and verdicts tell the truth

- Status: Partly superseded by [0280](0280-the-run-step-builds-first-and-the-headline-tells-the-truth.md) (point 9: the headline never says "Works" when the latest start failed or an item was met only on made-up data)
- Partly supersedes: [0182](0182-how-the-gate-is-built.md) point 5 (what an approved GitHub step says) and how standing approvals are scoped; [0186](0186-how-build-check-and-run-are-built.md) on when a check has passed ("could not check" no longer passes silently)
- Scope: Making premise
- Date: 2026-11-21
- Decided by: The builders; the check rule (points 6 to 9) is chosen for the owner by the assistant, open to the owner's correction, because it changes when work lands.
- Source: A second fresh-eyes walkthrough of the newer flows (its findings B1, B2 and B3), [0056](0056-what-is-on-the-floor.md), [0097](0097-reports-from-recorded-facts.md), [0101](0101-the-gate-asks-in-the-session.md), [0161](0161-github-repository-step-not-approved.md), [0189](0189-how-taking-on-existing-software-is-built.md), [0135](0135-the-experience-works-without-the-guide.md).

## Context

- The approval before premise wrote its record to a repository the person brought in said "This is a demo, so it is not real. Nothing will be created", and then a real branch with a real folder was written there. The card's title and its standing approval were about "acting in your name outside this machine", though the write was local. One fixed title and one scripted-mode banner served every kind of action.
- After the person approved creating the GitHub repository, the conversation said "Not done: ... that step has not been approved". The approval was not lost: the GitHub step is not built ([0161](0161-github-repository-step-not-approved.md)), and its error was worded as a refusal.
- A check with 0 met, 0 not met and 2 "could not check" was said to have "passed", and the report led with "0 of 2 things you asked for are met", which a newcomer cannot tell from a failure. The report also counted verdicts on the checked commit as "not checked at this version" once the change was merged, though the code was the same.

## Decision

1. **One card per kind of action.** A gate request names its kind of action (`act`: `add-record`, `push-record`, `create-repository`; none for an agent's request) and may give the card's own title, standing-approval wording, rule sentence and why it asks now. Otherwise the floor kind's words are used.
2. **Every card says what really happens, in every mode,** as a line the server writes for that kind of action: "This is real ..." or "Nothing happens yet ...". The page no longer shows a scripted-mode banner on approval cards. A request whose action premise cannot carry out (no performer) always says nothing happens, whatever words it gave.
3. **Writing to a repository the person brought in is its own floor kind, `write-repository`** ("changing a repository of yours"): adding the record says the branch it creates, the folder it adds, that other branches and the working folder are left alone, and that it is real even when the agents are scripted; a clone address says it is pushed with the person's own git login. Updating that branch after a change is a separate kind of action with its own card.
4. **A standing approval covers only its own kind of action** (same floor kind and same `act`), for one software. Approving "adding premise's record to your repository" never covers creating a GitHub repository, and a server act's approval never covers an agent's request.
5. **Outcomes say what happened:** waiting for your answer; approved and done; approved, but this step is not available yet, and why (status `unavailable`); declined; approved, but it failed. Creating a GitHub repository after approval says the step is not built because the owner has not yet allowed premise to create repositories on GitHub, that nothing was created, and that nothing is lost; never "not approved".
6. **A check has passed only when every must item is met and nothing blocks.** (With no must items among those checked, every item checked counts.)
7. **No failure, some must items unverified:** the change lands and runs, marked "not fully verified"; the conversation and the report say which items and what is needed to check them.
8. **Nothing verified at all:** premise does not land silently. It asks once, in plain words: what it could not check and why, how to try the software, and the choices: land it unverified, write what the checker needs (it checks the same version again with that), or stop. The setting `line.when_nothing_verified` (`ask` or `land`, default `ask`) lets unattended use land it unverified, saying so.
9. **The report's first line is a plain verdict:** "Works: all N things you asked for were checked and are met", "Partly verified: ...", "Not verified: premise could not check this ...; try it yourself", or "Does not work yet: ...", then how to try it, then the counts. A verdict on a commit with the same code as the latest (only merges or record changes after it) holds for the latest version.
10. **Scripted agents are said to judge nothing:** a check made by a scripted agent, its question, and the report say that scripted agents cannot judge software. The stand-in check of a split piece as a whole says the parts were each checked and how they work together is not verified, never "passed".
11. **The rest of the walkthrough, in the same spirit** (builders' choices): when a reported problem's change runs, premise says "its fix is running in version ...", how to try it, and to say so if it is still there, never "fixed", since the check may not have verified it; the milestone card has no free-text answer, so nothing typed is taken as "go on", and "Go on" is echoed with what happens next; when the code did not say how to start a brought-in software, premise asks "How do you start it?" under Waiting on you after the recovered list, so that list stays the first thing asked; roles are named on the Waiting page only when something waiting is for a role other than the operator; two scope choices with the same estimate say why ("fits in the same builds", or "nothing more to add here"); no setting's name appears in text a person reads outside the Settings page.

## Reason

- Builders' note: the floor is about trust ([0056](0056-what-is-on-the-floor.md)); a card that says nothing real happens when something does breaks it at the moment that matters most. Saying what really happens per kind of action, from the server that will do it, is the only way the words stay true in every mode. Scoping a standing approval to one kind of action keeps "yes to this" from becoming "yes to everything of that floor kind".
- Chosen for the owner: "passed" with nothing verified teaches people to ignore the word. Landing a partly verified change keeps work moving ([0006](0006-llm-does-what-it-can.md)) while saying exactly what is not known; asking once when nothing at all is verified is the least attention that still stops a silent unverified landing ([0027](0027-spend-least-of-peoples-attention.md)), and the setting keeps unattended use possible.

## Alternatives considered

| Alternative | Why rejected |
| --- | --- |
| Keep one card and fix only the banner's wording | The title, the rule and the standing approval would still describe a different kind of action. |
| Make writing the record do nothing in scripted mode | Bringing in software works the same with scripted agents; a write that silently does not happen would be a second lie. |
| Keep standing approvals per floor kind | Approving one local write would cover creating repositories and agents' publishing. |
| Never land a change with anything unverified | Real checkers often cannot check something (an outside account, a device); work would stop on every such item. |
| Land everything with no failure, as before | "Passed" with nothing verified is the false report the floor forbids ([0097](0097-reports-from-recorded-facts.md)). |

## Consequences

- Schema 13: `gate_requests` gains `act`, `card` and `unavailable`; `approvals` gains `act`; older requests to add the record are moved to `write-repository` ([storage](../specs/storage.md)).
- New floor kind `write-repository`, in `gate.kind_approvals_allowed` by default; new setting `line.when_nothing_verified` ([configuration](../reference/configuration.md)).
- Check statuses `not-fully-verified` and `not-verified`; the report's `counts` and `scripted` lines ([page](../specs/page.md), [reporter](../specs/reporter.md)).
- Carried in the [gate](../specs/gate.md), the [line engine](../specs/line-engine.md) 5.7, [build, check and run](../architecture/build-check-run.md) and the [fixed wording](../prompts/fixed-wording.md).

## Related

[0056](0056-what-is-on-the-floor.md), [0097](0097-reports-from-recorded-facts.md), [0101](0101-the-gate-asks-in-the-session.md), [0161](0161-github-repository-step-not-approved.md), [0182](0182-how-the-gate-is-built.md), [0186](0186-how-build-check-and-run-are-built.md), [0189](0189-how-taking-on-existing-software-is-built.md).
