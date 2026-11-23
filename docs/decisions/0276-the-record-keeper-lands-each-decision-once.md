# 0276. The record keeper lands each decision once, and the agents' tools say how to use them

- Status: Accepted
- Scope: Making premise
- Date: 2026-11-23
- Decided by: The builders; point 3 chosen for the owner
- Source: The first real run, where builders' accepted decisions were dropped at landing, the plan's decisions were recorded twice, most record proposals failed on their format, and lines the drafter added were marked as the operator's; [0080](0080-record-in-the-softwares-repository.md), [0082](0082-record-as-markdown-with-ids.md), [0159](0159-how-the-record-keeper-is-built.md).

## Context

- A proposed record change is checked against the record as it stands, and written later. When it was written, the record keeper refused it if *any* record file had changed in between. Every build task edits `run.md`, so in the first real run every decision a builder proposed was accepted and then dropped at landing, with "run.md changed since this change was checked … propose it again". The message was posted once per change, in one chat message, to the operator, who could do nothing about it.
- The planner's prompt told it both to propose its decisions with `record_propose` and to submit them in its plan with `draft_submit`, and premise recorded both. Every plan decision appeared twice.
- Most of the agents' `record_propose` calls failed on their format: a `file` given instead of a `kind`, `line` instead of `text`, a missing `from`, an ID typed into the text. One refusal said "a builder may only add decisions" when the real fault was the missing `kind`.
- Lines the drafter added were marked `from: operator`, so the operator could not tell their own words from premise's.
- Record commits were titled "Record: add D item, add D item, …", which says nothing about what was added.

## Decision

1. **Only the files a change touches are checked.** A change remembers what each file it changes looked like when it was checked, and nothing else. A change to `decisions.md` is not refused because `run.md` moved.
2. **A real conflict is retried before it is reported.** When a file the change touches did move, the record keeper applies the same operations again to the record as it stands, once, giving new items the next free IDs. Only if they no longer fit (the item it replaces is gone, or the record already says the same thing) is the change refused, and the refusal says why.
3. **What did not go in is said once, in one line** (chosen for the owner). When a round's proposals land (with a milestone, or when the operator confirms the plan), every one is tried; those that still do not fit are gathered into one line in the landing message, naming each by its first words and why, and recorded as an event. It never asks anyone to propose again: premise has already tried.
4. **One path for the plan's decisions.** The planner puts its decisions only in the plan it submits; its prompt says not to also propose them. And when the plan is confirmed, a plan decision whose words an item in the record already carries is not added again. An agent's own proposal of an item the record already says, in the same words, is refused, naming the item.
5. **Every refusal says what is wrong and how to fix it.** The shape of each operation is checked first, so a missing or misnamed field (`kind`, `text`, `from`, `id`, `reason`, `op`) is named as such, with a complete example of that operation. A role's limit (a builder adds decisions only) is reported only for an operation that is otherwise well formed.
6. **Each role's instructions carry a working example of each of its tools.** The examples live with the tool definitions and are added to each role's instructions when they are assembled, so the prompt and the server cannot drift; a test calls each example as written and expects it to be accepted.
7. **"from: operator" only for the operator's own words.** What the operator writes or edits on the page, or answers, is theirs by that act. A drafted line may claim to be the operator's only with a `quote`: their exact words, at least three words long (or the whole of a source shorter than that), which premise checks word for word against the first description, the words of the piece of work, their chat messages, and their answers and edited items; the quote is shown under the item as "you said: “…”". premise checks that the words are the person's, not that they mean what the item says; the person seeing the quote next to the item is what catches a stretched reading. Without a true quote the line is marked `assumed`, so the operator sees it as premise's assumption and can strike it, and the reply tells the drafter what to supply. No word-overlap guess decides it. The drafter's prompt gives a working example.
8. **Record commits name their items.** The subject reads "Record: add D-4 Keep tasks in one file…, strike W-2", with the rest counted when it is long.

## Reason

- A check that refuses a change for a file it does not touch protects nothing and loses work; the conflict worth catching is in the file the change writes.
- Most "conflicts" between proposals of the same round are only two items wanting the next free ID; applying the change again settles them without anyone's attention ([0027](0027-spend-least-of-peoples-attention.md)).
- Two paths for the same decision will always, sooner or later, both be taken. Removing one, and refusing the same words twice, closes it at both ends.
- An agent fixes a call in one step when the refusal names the field and shows the shape; a refusal about something else costs a retry and often a guess.
- Provenance is what lets the operator strike premise's assumptions ([0028](0028-say-back-as-assumptions-to-strike.md)); a line marked as theirs that is not theirs hides an assumption.
- Point 3 for the owner: telling nothing would hide lost work, and telling it per change, or asking the operator to act, spends their attention on something only premise can do. One line keeps the truth visible at the least cost.

## Alternatives considered

| Alternative | Why rejected |
| --- | --- |
| Check no files at all, and always write the change as it was checked | A real conflict (the item replaced is gone) would be written over silently. |
| Merge record files line by line, like a version control merge | More machinery than re-applying a list of operations, which is already how a change is made. |
| Let the planner propose decisions and drop them from the plan draft | The operator confirms the plan as a whole; its decisions belong with it. |
| Accept any shape and guess what an agent meant (a `file` for a `kind`) | Guesses are wrong silently; a precise refusal with an example is fixed once and teaches the shape. |
| Ask the drafter to mark provenance more carefully, without a check | The first real run shows prompts alone do not hold this; the quote check is cheap and errs towards "assumed", which the operator can strike. |
| Decide by how many of an item's words the operator used | A share of words wrongly demotes the operator's own edited wording and lets a paraphrase through; a quote is checkable. |

## Consequences

- The quote rule of point 7 is checked on the drafts of the Why, Who and What stages. The plan stage's decisions and milestones, the say-back, the What-exists items and `record_propose` operations do not check it yet and show no quote: a known limit, tracked in issue #195.
- Builders' decisions reach the record with the code they belong to.
- Each plan decision is in the record once.
- Records written before this change still check every file they remembered; they are retried the same way.
- Carried in the [record keeper](../specs/record-keeper.md), the [agent tools](../specs/agent-tools.md), the [planner](../prompts/planner.md) and [drafter](../prompts/drafter.md) prompts, and `src/record/`, `src/line/record-writer.ts` and `src/line/draft-items.ts`.

## Related

[0027](0027-spend-least-of-peoples-attention.md), [0028](0028-say-back-as-assumptions-to-strike.md), [0082](0082-record-as-markdown-with-ids.md), [0159](0159-how-the-record-keeper-is-built.md), [0275](0275-the-commit-hook-puts-the-trace-line-last.md).
