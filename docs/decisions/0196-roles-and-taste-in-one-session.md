# 0196. How roles and taste claims are built in the one session

- Status: Accepted
- Partly supersedes: [0115](0115-taste-prototypes-on-a-throwaway-branch.md): who makes a proposal and what it shows, for now
- Scope: Milestone 3
- Date: 2026-11-21
- Decided by: The builders; the points marked "chosen for the owner" are the owner's to correct.
- Source: [0009](0009-everyone-needed-is-a-user.md), [0022](0022-people-can-put-in-their-taste.md), [0065](0065-one-open-session.md), [0084](0084-who-has-the-last-word.md), [0101](0101-the-gate-asks-in-the-session.md), [0102](0102-taste-proposals-before-building.md), [roles and use cases](../product/roles-and-use-cases.md), the [roadmap's milestone 3](../product/roadmap.md#milestone-3-every-role-in-one-session), and the task that built it.

## Context

- Asks already carried a role label, the gate already asked, and learning already kept the operator's taste. The plan says every ask is for a role, a person can claim an area for their taste and sees a proposal before it is built, and a real-world act is asked of the role that does it. It does not say how a role is named, when a proposal is made, what it shows when no screenshot can be taken, what is held while it waits, or what premise can check of a real-world act.
- A newcomer found "For the operator" on every ask to be jargon when nobody else was ever asked anything.

## Decision

1. **Roles are labels, written by whoever asks.** A person names the role when claiming an area ("designer"); an agent names it when it asks or requests a gated action ("account holder"). premise keeps a label as lower-case words joined by hyphens (`account-holder`), the form the record takes, and shows it as plain words. No list of roles is kept or checked: in one session one person answers for every role ([0065](0065-one-open-session.md)).
2. **No role label while only the operator is asked anything.** Once any ask, open or answered, or any open claim, is for another role, every ask shows its role, "Waiting on you" is grouped by role, and the page says once, in one note, that a role is a label and one person answers for all of them. The report's "Needed" section does the same.
3. **Claims.** An area is claimed on the Line tab, in plain words, under a role; with no role given it is the operator's. At most `taste.claims_max` (10) open claims per software, and one per area. A claim applies from the next milestone's build; work already being built goes on as it is, and premise says so when the claim is made ([issue 126](https://github.com/omkarbhale/premise/issues/126)).
4. **The proposal is one or two described options, made by the planner, before the milestone's tasks start** (chosen for the owner). When Build starts a milestone, each open claim not yet decided gets a `prototype` job run by the planner, which submits up to `taste.options_max` (2) options with `proposal_submit`, each a title and what the role would see, and names the plan's tasks that build the area. Only those tasks wait for the answer; the rest go on. If no proposal comes, the role is asked in plain words instead. This replaces, for now, the builder's prototype and the server's screenshot of [0115](0115-taste-prototypes-on-a-throwaway-branch.md): described options cost one short planner session and no running prototype. Screenshots of a quick prototype are left for later ([issue 125](https://github.com/omkarbhale/premise/issues/125)).
5. **The answer becomes a `T` item** under the claiming role, in `taste.md`: the option kept, or the role's own words. The held tasks then start with that decision in their brief. A decision stands for later milestones; to decide again, release and claim again.
6. **A correction feeds the taste lessons.** When the role says what to change rather than keeping an option, the correction is read like any other ([0194](0194-how-learning-from-corrections-is-built.md)); premise's fixed rule sends it to the operator's taste, with the area in the line.
7. **Releasing a claim** withdraws a proposal still waiting, and the tasks it held go on with premise deciding the area itself. A released claim stays listed, with what was decided if anything was.
8. **A real-world act is a `needed` ask of exact steps.** An agent asks with `ask` kind `needed`, naming the role, what is needed in one line, and the steps; when the act ends in a secret it names the key, and premise adds the step to write it into the software's secrets file ([0120](0120-secrets-stay-out-of-premise.md)). When the person marks it done, premise checks what it can: that the key is in the file, without reading the value out; if not, it says exactly what is missing and the ask stays open. The task that asked waits, then runs again with the answer. premise never does the act.
9. **The gate asks under the role an agent names** in `gate_request`; the operator otherwise (choosing it from the record is [issue 59](https://github.com/omkarbhale/premise/issues/59)). Approvals for a kind of action per software stay as built ([0182](0182-how-the-gate-is-built.md)).
10. **Counting per role:** the measures add "Questions asked, by role" (every ask not withdrawn), which every report carries under "How premise is doing"; attention by role is shown in plain words.

## Reason

- Builders' note: labels written by whoever asks keep roles cheap and need no setup, as [0065](0065-one-open-session.md) designs for one person; hiding the label when only the operator exists removes jargon a newcomer met on every ask; proposals made before any task starts mean nothing of a claimed area is built before the role has seen it, and naming the tasks that build it keeps the rest moving ([0102](0102-taste-proposals-before-building.md)); described options are the cheapest proposal that still gives the role something concrete to judge.

## Alternatives considered

| Alternative | Why rejected |
| --- | --- |
| A fixed list of roles from the Who stage, checked on every ask | Needs setup and a way to correct the list; nothing in one session depends on it. |
| Always show the role label | A newcomer found it jargon when only the operator exists. |
| A screenshot of a prototype for every claim, as in [0115](0115-taste-prototypes-on-a-throwaway-branch.md) | A builder session and a running prototype per claim; kept for later, when a picture is worth that. |
| Hold the whole milestone until every proposal is answered | Holds work that does not touch the area ([0102](0102-taste-proposals-before-building.md): other tasks go on). |
| Take the secret's value on the page | [0120](0120-secrets-stay-out-of-premise.md): secrets never pass through premise. |

## Consequences

- New table `claims` (schema 11, [storage](../specs/storage.md)); routes to claim and release ([page server](../specs/page-server.md)); the `proposal_submit` tool, and `what`, `secret` and `role` on `ask` and `gate_request` ([agent tools](../specs/agent-tools.md)); the proposal brief ([planner prompt](../prompts/planner.md)); `taste.*` settings ([configuration](../reference/configuration.md)).
- Carried in the [line engine](../specs/line-engine.md) 5.6, the [page](../specs/page.md) 5.3 and 5.4, the [reporter](../specs/reporter.md) and the [measures](../specs/measures.md).

## Related

[0007](0007-llm-does-not-decide-what-it-cannot.md), [0022](0022-people-can-put-in-their-taste.md), [0102](0102-taste-proposals-before-building.md), [0115](0115-taste-prototypes-on-a-throwaway-branch.md), [0120](0120-secrets-stay-out-of-premise.md), [0194](0194-how-learning-from-corrections-is-built.md).
