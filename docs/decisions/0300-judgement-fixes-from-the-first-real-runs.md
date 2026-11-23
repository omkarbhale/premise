# 0300. Judgement fixes from the first real runs

- Status: Accepted; points 2, 3, 5 and 8 are chosen for the owner, open to the owner's correction
- Partly supersedes: [0280](0280-the-run-step-builds-first-and-the-headline-tells-the-truth.md) point 8 (a "met" on made-up data is no longer taken)
- Scope: Making premise
- Date: 2026-11-24
- Decided by: The builders. The points marked chosen for the owner are the assistant's, open to the owner's correction. The owner's words are quoted where the owner gave them.
- Source: The first real runs of premise, with real agents: an audit of their judgement calls, and the owner's own words after them. [0014](0014-guard-against-further-big-mistakes.md), [0023](0023-looking-at-what-exists.md), [0028](0028-say-back-as-assumptions-to-strike.md), [0056](0056-what-is-on-the-floor.md), [0087](0087-agents-run-confined.md), [0173](0173-premise-learns-from-corrections.md), [0196](0196-roles-and-taste-in-one-session.md), [0270](0270-premises-own-figures-and-asks-that-cost-attention-honestly.md), [0280](0280-the-run-step-builds-first-and-the-headline-tells-the-truth.md).

## Context

The first real runs showed where premise's agents judged badly, and where premise let them:

- At What exists premise recommended not building, because an existing tool did most of the job. The owner chose to build anyway and gave the reasons in chat. The record kept "Build on something that exists (from: operator)" with no reason, the say-back had no line for it, and the report never said premise had been overruled. It did not count as a correction either.
- The owner, about the choices at What exists: "What is the difference between build it and build something different? ... I couldn't understand what that different is from premise".
- The planner wrote a decision "assumed, not checked: headless sessions may not run the status line", on which a must item depended entirely, and finished with "nothing needed from a role", although the owner had to change a setting for that must to work at all. The person never saw it before building, and it was never judged by the checker.
- The checker called that must "met" twice, on its own made-up input, while the real data was out of its reach. "Could not check" was never used.
- The owner, after another run: "premise should ask for a way to provide to the agent what it normally doesn't. For example, not only the agent can't access godot, it can't download it either." The card the builder raised named allowing the download as an option, but its only buttons were "It is done" and "I cannot do this".
- A drafter turned the owner's "perhaps" into a plain statement. A lesson turned "I don't know if usage-ledger should care about that" into "session-level orchestration is out of usage-ledger's scope", which clashed with a must item and went into fourteen later briefs; the triager had not read the record.
- The plan's costly choices were sent to the contradiction review ("Do not judge whether the change is a good idea"), while the chat said a second agent was reviewing them. The planner chose a database module that builds native code; it failed to build in four sessions, which have no compiler. The researcher stopped early with the page that decided the outcome unread: web fetch gave the same cut-off summary twice, and it had no way to read the rest.

## Decision

1. **An overrule keeps its why.** When the person picks an outcome other than premise's recommendation, premise takes one line of why: from the reason box on the card, from their own written answer, or else from their next chat message, which premise asks for in the chat. It is recorded as a Why item from the person ("Overruled: <why>. premise recommended ...; the operator chose ..."), it comes first in the say-back so it can be struck, the report always shows it, and it counts as a correction for learning (read like a rejected draft, with the why as what they said). If no reason has come by the say-back, the say-back's first line says the choice was made without a reason yet. (Builders' choice.)
2. **The choices at What exists say what they mean** (chosen for the owner). Only the choices that apply are shown, worded for what they do: "Do not build: use <name>", "Build it on top of <name>", "Build it anyway", or "Build it: nothing out there does this (<the gap>)". Each has one line on what choosing it changes. "Build something different" is gone; words of one's own are still taken, and count as an overrule with those words as the why. The researcher names what the choices need (`alternative`, `builds_on`, `gap`) and the question that decides the outcome, which the card shows. For software premise took on, the three choices stay as they were.
3. **A must that works only under a condition is shown before building** (chosen for the owner). A plan decision may carry `condition`, the must items it affects and `who` can meet it. A condition a role can meet is asked of that role as something only a person can do; nothing waits on it, and if they cannot, the check says the must could not be checked. Any other condition is shown on the milestones question beside the milestones, where the person keeps the must, strikes it, or has it checked first: the first build task then checks the condition before building on it, and says what it found. The condition stays with the decision in the record ("Holds only if: ...").
4. **"Could not check" when the real thing is out of reach.** `verdict_submit` refuses "met" on made-up data: when the real data, service or tool was out of reach, the verdict is "could not check", and every "could not check" names what a person should try (`try_it_on`), which the report shows. The checker also judges every decision the plan assumed without checking ("Assumed, not checked" or "Holds only if"): such a decision never holds up landing, but a false one is said in the chat at once and is in the report. (Builders' choice.)
5. **Asking for what agents lack** (chosen for the owner). An agent missing a program, a download or access raises one "needed" ask (`tool`, `why`, and `host` when one host would let it get the tool), at most one per tool and software. The card's buttons are real:
   - "Allow <host> for <software>": the click is the gate approval, recorded as a request of the new floor kind `network`, approved once, scoped to that one software. The agents' sandbox reads the allowed hosts from the gate's records for each new session, so it applies from the next session without restarting premise.
   - "I installed it": premise checks the program is on the PATH agents get, can be run, and is not in a folder their sandbox denies; it says plainly which failed, and the card stays open.
   - "Go on without it": the agents carry on without it, and the checker is told to mark anything that needs it "could not check".
6. **Hedges are kept.** At Why, Who and What, an item that quotes the person's hedged words ("or", "perhaps", "not sure") and drops the hedge is refused, with an example of keeping the choice open; the drafter is also told which of the person's sentences were unsure. A lesson for the software is taken only after the triager read the record, and a lesson that states as settled what the person said they were unsure of is refused. (Builders' choice.)
7. **The planner and the reviewer.** The plan's foundation decisions get the foundation review brief, with what was found at What exists, and the chat says what really ran: how many choices the reviewer judged and with what verdict. A decision naming a package that builds native code (`line.native_dependencies`) must say how it installs without a compiler, or premise refuses it; the planner may pick a built-in instead. (Builders' choice.)
8. **The researcher reads long pages in parts** (chosen for the owner). A new tool, `page_read`, has premise fetch a public page itself and hand it out as plain text in parts (`tools.page_part_chars`). premise reads only http and https pages, never this machine or a private network (checked again on every redirect), with a size cap and a time limit, and only for a live researcher session. The researcher names the question that decides the outcome first and spends its budget on it, and marks what web fetch gave as a summary unless it read the page itself.

## Reason

- Builders' note: an overrule is the clearest case of premise being wrong for this person. Keeping the why where the say-back and the report show it costs one line of the person's attention and saves the next agent from undoing what they decided ([0028](0028-say-back-as-assumptions-to-strike.md)).
- Chosen for the owner: the owner could not tell two of the four choices apart. A choice that names what it does, with one line on what it changes, needs no guide ([0135](0135-the-experience-works-without-the-guide.md)).
- Chosen for the owner: "when being wrong is not cheap, ask". A must that silently depends on a setting is the expensive kind of wrong; asking once before building is cheap. Putting it on the question already asked adds no new card, and a condition a person can meet goes to that person.
- Builders' note: a verdict on stand-ins for data the checker could not reach says nothing about the real thing. "Could not check, try this" is true, and premise already lands partly verified work without stopping ([0220](0220-approvals-and-verdicts-tell-the-truth.md)).
- Chosen for the owner: a card that offers an option without a button for it costs attention for nothing ([0270](0270-premises-own-figures-and-asks-that-cost-attention-honestly.md)). The gate records allowing a host like any approval, scoped to one software, because widening what agents can reach is a security default ([0092](0092-security-defaults.md)); the click on the card that names the host is the approval, so the person is not asked twice.
- Builders' note: a lesson reaches every later brief; a wrong one does more harm than none. Reading the record first and keeping doubt as doubt is the least that keeps it honest.
- Chosen for the owner: premise fetching a page for the researcher reaches the network from premise's own process; it is limited to public pages for a live researcher session, the same pages web fetch would reach.

## Alternatives considered

| Alternative | Why rejected |
| --- | --- |
| Require the reason box before an overrule can be sent | A card that refuses an answer costs more attention than one question in the chat. |
| Keep the four fixed choices and explain them in a help text | The owner read the card and could not tell them apart; a help text is the guide the experience must not need. |
| Show every conditional decision as its own card | One more card per condition; the milestones question is already asked at that moment. |
| Turn a "met" on made-up data into "could not check" silently | premise would be rewriting the checker's verdict; refusing it with the reason lets the checker say what to try. |
| Allow every download host for every software | Widens every sandbox for one software's need. |
| Restart premise to apply a new host | The owner asked that it work without restarting; the settings are written per session anyway. |
| Refuse any draft item whose source has "or" anywhere | "Or" is too common; only an item that quotes the hedged words is held to them, and the drafter is shown the unsure sentences. |
| Give the researcher a shell with network access to read pages | Its sandbox can only allow named hosts, and a shell is more than reading needs. |

## Consequences

- New tool `page_read` for the researcher; new fields on `draft_submit` (`builds_on`, `gap`, `deciding_question`, and on plan decisions `condition`, `must`, `who`) and on `ask` (`tool`, `host`, `why`); `verdict_submit` refuses "met" on made-up data and "could not check" without `try_it_on` ([agent tools](../specs/agent-tools.md)).
- New floor kind `network`; `Gate.approvedInSession` records an approval given on a card that named the action ([gate](../specs/gate.md)).
- New answers on the page: "check it first" for a condition on the milestones question; "allow", "installed" and "without" for a missing tool ([page](../specs/page.md)).
- New settings `tools.page_part_chars` and `line.native_dependencies` ([configuration](../reference/configuration.md)).
- Carried in the [line engine](../specs/line-engine.md), [learning](../specs/learning.md), and the [researcher](../prompts/researcher.md), [drafter](../prompts/drafter.md), [planner](../prompts/planner.md), [reviewer](../prompts/reviewer.md), [builder](../prompts/builder.md), [checker](../prompts/checker.md) and [triager](../prompts/triager.md) prompts.
- No database change: an overrule is a record item and an event, allowed hosts are gate requests, and what agents went without is an event.
- Kept tests for each point, with the scripted agent, and through real agent tool shapes.
- Left for later, filed as issues: asking why at other recommendations ([212](https://github.com/omkarbhale/premise/issues/212)), withdrawing an allowed host ([213](https://github.com/omkarbhale/premise/issues/213)), running an installed program inside the sandbox ([214](https://github.com/omkarbhale/premise/issues/214)), conditions in a change's plan ([215](https://github.com/omkarbhale/premise/issues/215)), recording what "check it first" found ([216](https://github.com/omkarbhale/premise/issues/216)), a card for a false assumption ([217](https://github.com/omkarbhale/premise/issues/217)), hedges settled without a quote ([218](https://github.com/omkarbhale/premise/issues/218)), a read-only sample of the owner's files for the checker ([219](https://github.com/omkarbhale/premise/issues/219)), and keeping fetched pages ([220](https://github.com/omkarbhale/premise/issues/220)).

## Related

[0023](0023-looking-at-what-exists.md), [0028](0028-say-back-as-assumptions-to-strike.md), [0092](0092-security-defaults.md), [0173](0173-premise-learns-from-corrections.md), [0220](0220-approvals-and-verdicts-tell-the-truth.md), [0270](0270-premises-own-figures-and-asks-that-cost-attention-honestly.md), [0280](0280-the-run-step-builds-first-and-the-headline-tells-the-truth.md).
