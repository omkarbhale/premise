# The record

Carved from section 3 of the plan. Part of the [architecture](overview.md). Spec: [record keeper](../specs/record-keeper.md). Agent guidance: [the-record skill](../skills/the-record.md), [tracing-work skill](../skills/tracing-work.md).

The record is what the vision calls the lasting record: purpose, users, what the software must do, decisions with their reasons, rejected alternatives. It is kept current by the product as part of every change, and every built piece traces to the intent behind it ([0025](../decisions/0025-two-kinds-of-record.md), [0013](../decisions/0013-mismatch-of-intent-is-the-mistake-that-matters.md)).

## Where it lives

- [0080](../decisions/0080-record-in-the-softwares-repository.md) (P14): each software's lasting record lives in its own repository, in a `premise/` folder at the root.
  - Why: it is versioned with the code; a change and its record land in one commit, so the record cannot fall behind ([0025](../decisions/0025-two-kinds-of-record.md)). It outlives premise; the prior art found records lost when the tool holding them shut down.
  - Rejected: keeping the record in premise's database.
- [0081](../decisions/0081-nothing-about-people-in-the-repository.md) (P15): nothing about real people goes into a software's repository. Conversations, and anything said in them about people, stay in premise's data folder. The record names roles, not people.
  - Why: visibility is not premise's to enforce ([0059](../decisions/0059-repository-visibility-per-software.md)), so the repository must be safe to make public.
  - Rejected: conversation transcripts in the repository.
- Working records (transcripts, plans, job logs, check evidence) stay in premise's data folder. They are kept, not maintained ([0025](../decisions/0025-two-kinds-of-record.md)). Deleting them is losing data, so only a person does it.

## Format

- [0082](../decisions/0082-record-as-markdown-with-ids.md) (P16): the record is Markdown: one item per list line, each with a stable ID.
  - Why: people read it on GitHub and on the page; LLMs read and write it well; it is lists ([0029](../decisions/0029-lists-over-long-paragraphs.md)).
  - Rejected: JSON or YAML (harder for people to read and correct).
- Files in `premise/`:
  - `why.md`: the problem, and why to build (`Y-1`, `Y-2`, …);
  - `who.md`: who the software is for (`U-n`) and the roles it needs (`R-n`);
  - `exists.md`: what already exists, with sources, and the outcome: do not build, build on something, or build something different (`E-n`);
  - `what.md`: what it must do, each with priority must, should or could (`W-n`);
  - `taste.md`: what people said about areas they claimed (`T-n`);
  - `decisions.md`: decisions, with reasons and rejected alternatives (`D-n`);
  - `run.md`: how to build, start and open the software. The checker runs it from a clean copy every time, so it cannot go stale without the check failing.
- One item per line, for example: `- [W-7] People can export their list as a CSV file. (must; from: operator; 2026-11-21)`.
  - `from:` is a role, or `assumed` for an assumption of premise's that nobody struck.
  - A changed item gets a new ID and `replaces: W-3`.
  - A dropped item is struck through with its reason, not deleted, so rejected alternatives stay ([0025](../decisions/0025-two-kinds-of-record.md)).
- The record keeper parses every file on every change. A malformed line, a duplicate ID, or a reference to a missing ID fails the change.

## How built pieces trace to it

- [0083](../decisions/0083-trace-trailer-on-every-commit.md) (P17): every commit premise makes carries a trailer naming what it serves: `Premise-Trace: W-7, D-3`, plus `I-12` when the work came from intake.
  - Why: from any line of code, `git blame` leads to a commit and its items; from any item, to every commit that names it. That tells a wrong record apart from a drifted build ([0013](../decisions/0013-mismatch-of-intent-is-the-mistake-that-matters.md)).
  - Rejected: IDs in code comments (noise that goes stale).
- Every builder task names the items it serves.
- The server refuses to push a commit without the trailer, or with one naming an ID that does not exist.

## Keeping it true

- Silent contradiction ([0014](../decisions/0014-guard-against-further-big-mistakes.md)): an agent compares every proposed record change with the whole record. That agent is the reviewer ([0113](../decisions/0113-agent-roles.md)).
  - A conflicting change must name the item it replaces; two live items never disagree.
  - Replacing an item about purpose (`Y`, `U`, a must `W`) or a foundation decision goes to the say-back.
- [0084](../decisions/0084-who-has-the-last-word.md) (P18): who has the last word, taken from the [scope page draft](../record/scope-page-draft-0.1.html):
  - anything that follows from the record and is cheap to undo: premise decides and records why; nothing is asked unless the area is claimed;
  - purpose, users, priorities: premise drafts and suggests; the operator decides;
  - an area claimed for taste: premise proposes; it is decided under the role that claimed it;
  - what an LLM cannot reliably know or do (an intent nobody stated, real-world acts, accountability): premise gives its best attempt with its reasons; it is asked under the role that decides or acts;
  - the floor: the gate asks ([the floor and the gate](the-floor-and-the-gate.md)).
  - Why: it spends people's attention only where being wrong is costly ([0027](../decisions/0027-spend-least-of-peoples-attention.md)).
  - Rejected: asking people about every record change.

## What is not in the record

- A description of what exists (technical architecture, code documentation) is not maintained. It is written from the code when someone needs it ([0026](../decisions/0026-no-maintained-description-of-what-exists.md)).
- People's words and anything about real people ([0081](../decisions/0081-nothing-about-people-in-the-repository.md)). Intake items (`I-n`) live in premise's database for the same reason; the record and commits refer to them only by ID.
