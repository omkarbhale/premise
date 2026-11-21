# 0188. An existing software's record goes into its repository only on approval, and hand edits stay later

- Status: Accepted
- Scope: The plan
- Date: 2026-11-21
- Decided by: The owner, on two points the assistant raised: "Those two are fine as they are."
- Source: The owner's conversation with the assistant of 2026-11-21, while the thin form of existing software was being specified (the assistant's notes, not kept in this repository).

## Context

- The owner asked: "How is existing software taken inside premise?"
- The assistant described the steps of the thin form ([0171](0171-existing-software-much-earlier-in-a-thin-form.md)): premise works on its own copy, a drafter recovers the record from the code, the operator strikes what is wrong, and changes come in as intake. It raised two points:
  - the record lives in a `premise/` folder added to the existing repository, and the first commit of it to that repository waits for the operator's approval, per software, through the gate;
  - tolerating commits made outside premise stays "later" ([0177](0177-tolerating-commits-made-outside-premise-later.md), [issue 63](https://github.com/omkarbhale/premise/issues/63)), so a software still edited by hand drifts from its record until that is built, and the page says so.

## Decision

- Both points stand as raised (Owner: "Those two are fine as they are."):
  - the record of an existing software lives in a `premise/` folder added to its repository; the first commit of it to the operator's repository waits for the operator's approval, per software, through the gate;
  - tolerating commits made outside premise stays later, and the page says plainly that a software still edited by hand will drift from its record until that is built.

## Reason

- Owner: "Those two are fine as they are." No further reason was recorded.

## Alternatives considered

| Alternative | Why rejected |
| --- | --- |
| Keep an existing software's record only in premise's data folder | Not raised; the record belongs with the code ([0080](0080-record-in-the-softwares-repository.md)). |
| Commit the record to the operator's repository without asking | Not raised; adding to someone's repository is acting in their name, on the floor ([0100](0100-floor-actions.md)). |
| Build tolerance of hand edits now | The owner kept it later ([0177](0177-tolerating-commits-made-outside-premise-later.md)). |

## Consequences

- How it is built, and which branch the record goes to, is the builders' record [0189](0189-how-taking-on-existing-software-is-built.md).
- The take-on panel on the page and the end of taking on say that hand edits make the record drift.

## Related

[0019](0019-existing-software-through-the-same-line.md), [0080](0080-record-in-the-softwares-repository.md), [0171](0171-existing-software-much-earlier-in-a-thin-form.md), [0177](0177-tolerating-commits-made-outside-premise-later.md), [0189](0189-how-taking-on-existing-software-is-built.md).
