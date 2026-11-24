# 0270. premise's own cost and attention figures, and asks that cost attention honestly

- Status: Accepted; points 3, 4, 6 and 7 chosen for the owner, open to the owner's correction. Partly superseded by [0330](0330-real-sessions-read-the-real-usage-ledger.md): premise's own count now sits beside usage-ledger's real figures, not mocked ones
- Scope: Making premise
- Date: 2026-11-23
- Decided by: The builders. The owner's standing words that usage-ledger's output is mocked until it exists, and marked as mocked ([0133](0133-usage-ledger-is-mocked-until-it-exists.md)); the points marked chosen for the owner are the assistant's, open to correction.
- Source: An audit of the first real run of premise (a small command-line software, real agents): its cost figures, its attention figure and its asks. [0016](0016-coarse-cost-tracking.md), [0058](0058-cost-tracking-inside-premise.md), [0064](0064-cost-and-spending-limit-from-usage-ledger.md), [0172](0172-premise-measures-its-own-return.md), [0200](0200-how-cost-and-the-spending-limit-are-built.md), [0260](0260-the-real-github-step-is-built-and-each-use-is-asked.md).
- Numbered apart from the records being written at the same time by other tasks.

## Context

In the first real run:

- Most agent work was filed under "not part of a change", because the scenario, build, check and run jobs carried no work item, though the usage-ledger contract asks for one on every session.
- Every real session's result carried its turns, tokens and cost at list prices, and the stream's rate-limit events carried the share of the weekly window used. premise kept none of it, and showed only the mocked ledger's flat figures, which were wrong by a wide margin.
- premise counted about half an hour of "attention", of which most was a question that nothing was waiting on, because the work went on whatever the answer.
- An agent could ask the person to approve an action that premise has no way to carry out, and the person's answer then did nothing.
- The "what exists" findings were each hundreds of characters, all marked "assumed", could not be struck one by one, and choosing against the recommendation had no place for a reason.

## Decision

1. **Every job names its work item.** Jobs queued by Build, Check and Run carry the work item being worked on (and already carried the milestone), as those queued by the line engine already did. A job that names its own item keeps it. (Builders' choice.)
2. **premise's own count is recorded per session and shown as such.** Each real session's result gives its turns, tokens and cost at list prices; they are kept on the session's own row. The page and reports show them as "premise's own count": per software, per phase, per step and per change, always before the mocked usage-ledger figures, and never marked as mocked. (Builders' choice.)
3. **Missing is said, never zero** (chosen for the owner). A scripted agent, or a session that ended without a result, has no figures. Its row says "no figures for N sessions" and why; it is not added as a zero. A figure that is missing and a figure that is a real zero look different.
4. **The weekly window is shown as the stream last reported it** (chosen for the owner), with when premise read it. The stream's rate-limit events carry the share used as a fraction; premise keeps the latest reading of each window and shows the weekly one as a percentage with its age ("30 minutes ago"), apart from the mocked weekly figure. Before any real session has reported it, the page says so. The reading is only as fresh as the last real session; the page says so.
5. **Attention counts only asks the line was waiting on.** Each ask records whether anything waits on its answer: a question or a card a job is waiting on does; an approval no job waits on (everything else goes on without it, such as the question before copying a software to GitHub) does not. Attention is counted only for the first kind. The others are shown separately as "other open questions (nothing waited on them)", with the time they stood open, so nothing is hidden. The two sets do not share minutes. (Builders' choice.)
6. **Premise does not ask for an action it cannot perform** (chosen for the owner). Every place an ask can be raised for a step that is unavailable was looked at:
   - An agent's request to the gate (`gate_request`): agents never perform a floor action and premise has no performer for what an agent asks, so nobody is asked. The request is recorded as unavailable, said in the session ("premise cannot do that itself, so you are not asked to approve it and nothing was done. If you want it done, do it yourself."), and the agent is told so it can say in its report what needs a person. This was the one remaining place.
   - The record in the owner's repository, the later pushes to it, and posting a comment on an issue each have a performer and are asked.
   - Copying a software to GitHub is real and is asked. When GitHub cannot be reached, the card already says so and how to fix it before the answer, so the person can fix it and then approve; that stays an ask, because it is an action the person can make possible. With scripted agents (a demo) the question is kept on purpose, so that the first visit shows what the gate is like ([0260](0260-the-real-github-step-is-built-and-each-use-is-asked.md)); the card says plainly that nothing will be created. Open to the owner's correction: dropping the demo question is a small change.
7. **"What exists" findings are one short line each** (chosen for the owner). Each finding shows one line of at most 110 characters, its source, and whether the page was read, only a summary was read, or it was not read (what the researcher does not say is shown as "not read": premise never claims a source was read). None is marked "assumed". Each can be struck on its own, with an optional reason; the rest of what the researcher wrote is shown on request. Struck findings are left out of the record and named in its outcome line. When the person chooses something other than premise's best guess there is a one-line box for the reason, kept in the outcome line.

## Reason

- **Alternatives considered:**
  - Replacing the mocked figures with the real ones: rejected; the owner wants usage-ledger's output mocked and marked until it exists, and the real count covers only what premise's own agents ran, not the share of a week by session.
  - Counting a question's time against attention whether or not anything waited on it: rejected; it measured the page being open, not a person's attention.
  - Counting a session with no figures as zero: rejected; a zero looks like a cheap session.
  - Raising the unavailable request anyway and saying "nothing happens": rejected; it costs attention for no effect.
- **Consequences:** `agent_sessions.figures`, `usage_windows` and `asks.blocking` are new (migration 16); a new figure "Other open questions" on the page that measures premise; the researcher's prompt asks for the new fields; the gate's agent requests no longer open cards. Follow-ups are filed as issues.
- **Related:** [usage](../specs/usage.md), [measures](../specs/measures.md), [usage-ledger contract](../specs/usage-ledger.md), [gate](../specs/gate.md), [researcher prompt](../prompts/researcher.md).
