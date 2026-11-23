# Skill: the-record

| Field | Value |
| --- | --- |
| Loaded by | every agent role except the sizer |
| When | Always |
| Related | [records 0025](../decisions/0025-two-kinds-of-record.md), [0026](../decisions/0026-no-maintained-description-of-what-exists.md), [0080](../decisions/0080-record-in-the-softwares-repository.md), [0081](../decisions/0081-nothing-about-people-in-the-repository.md), [0082](../decisions/0082-record-as-markdown-with-ids.md), [the record](../architecture/the-record.md), [record keeper](../specs/record-keeper.md) |

**Why this skill exists.** Lasting records are kept current by the product as part of every change: purpose, users, what the software must do, decisions with their reasons, rejected alternatives; every built piece traces to the intent behind it ([VISION.md](../../VISION.md), the record; [record 0025](../decisions/0025-two-kinds-of-record.md)). The record lives in each software's repository, one item per line with a stable ID ([records 0080](../decisions/0080-record-in-the-softwares-repository.md), [0082](../decisions/0082-record-as-markdown-with-ids.md)). Only the record keeper writes it. Every agent reads it and some propose changes, so every agent must know its shape and its rules.

The text below is the skill as the agent receives it.

---

## The record

Each software premise builds has a lasting record in its repository, in a `premise/` folder. It is what everything traces to.

### Files and IDs

- `why.md`: the problem, and why to build. `Y-n`.
- `who.md`: who the software is for (`U-n`) and the roles it needs (`R-n`).
- `exists.md`: what already exists, with sources, and the outcome: do not build, build it on top of something, build it anyway, or build it because nothing out there does it. `E-n`.
- `what.md`: what the software must do, each with priority must, should or could. `W-n`.
- `taste.md`: what roles said about areas they claimed. `T-n`.
- `decisions.md`: decisions, with reasons and rejected alternatives. `D-n`. Write each as the decision, then `Reason: ...`, then `Rejected: ...`.
- `milestones.md`: the software's milestones, in order. `M-n`. A `wait` mark means premise stops there for the operator.
- `run.md`: how to build, start and open the software.
- Intake items are `I-n`. They live in premise's database, not in the repository.

### One item per line

`- [W-7] People can export their list as a CSV file. (must; from: operator; 2026-11-21)`

- `from:` is a role, or `assumed` for an assumption of premise's that nobody struck.
- Recovered items from existing software are marked `recovered`.
- A changed item gets a new ID and `replaces: W-3`. Never edit an item's meaning in place.
- A dropped item is struck through with its reason, not deleted. Rejected alternatives stay.
- A `D` item states the decision, its reason, and the alternative rejected.

### Rules

- You never write the record. You propose adds, replaces and strikes with `record_propose`, each with its reason. The record keeper checks the format and every ID; a reviewer compares the change with the whole record.
- Two live items never disagree. If your change conflicts with a live item, name the item it replaces.
- A change that replaces a `Y` or `U` item, a must `W` item, or a foundation decision goes to the say-back.
- Name roles, never people. Nothing about real people goes into the record; the repository may be public.
- The record holds why, not a description of the code. Do not add items that describe how the code is laid out; that is written from the code when someone needs it.
- Working records (plans, transcripts, logs) are not the record. They can be as detailed as the work needs and are not maintained.
