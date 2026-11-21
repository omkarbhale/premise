# 0242. Readings name the items behind each line, and the operator decides each line

- Status: Accepted
- Scope: Milestone 4, the rest
- Date: 2026-11-21
- Decided by: The builders; the points marked "chosen for the owner" are the owner's to correct.
- Source: [0041](0041-intake-can-be-held.md), [0095](0095-what-is-held.md), [0096](0096-when-held-items-are-read.md), [0036](0036-finding-out-if-people-want-it-is-out.md), [0185](0185-how-intake-in-a-thin-form-is-built.md), and the task that finished intake.

## Context

- A reading ends in a short list for the operator. The thin form kept lines as plain text. The plan wants each line to say what people ask for, how many, and which items are behind it; the operator turns a line into work, keeps holding, or closes it; senders see the outcome; and when the items say people do not want the software, premise says so plainly with the evidence and offers going back to Why.

## Decision

1. **Every line carries its items.** The reader submits each line as a sentence and the item IDs behind it; premise counts them and rejects a line with no items, or items that were not read. The Intake tab shows each line with its count and the items one click away; the question under Waiting on you lists the same.
2. **The operator decides each line on the Intake tab:** turn it into work, keep its items held, or close them (with a reason if they wish). Turning a line into work makes one wish on the line, led by the line's first item, with the others merged behind it; the brief gives the line and every item as data. Each line is decided once.
3. **Kept items are not read again at once.** They return to held with a new "held since" time. Only items not yet read count toward the held count that starts a reading (`intake.reading_held_count`); kept items wait for the time limit (`intake.reading_max_days`, counted from when they were kept) or for the operator, who can always ask for a reading.
4. **Answering the question under Waiting on you with "Noted" keeps every undecided line's items held** (chosen for the owner), so nothing is lost and nothing is decided for the operator. When every line is decided on the tab, that question is withdrawn.
5. **The way back to Why.** To suggest it, the reader must name `not_wanted`, the items that say people do not want what the software does; without them the submission is refused. premise then says so plainly, in the conversation and in the question's title and text: how many items say it, each quoted, and what going back means (ask again who it is for and which problem is worth solving; the wrong problem may have been solved, or there are other problems). Nothing changes until the operator chooses it, from the question or from a button on the tab. Going back leaves the items as read evidence.
6. **Senders see the outcome:** each decision is said in the conversation for each item, and shows on the item's standing, on the feedback page, and (through the gate) on GitHub.

## Reason

- Builders' note: a line with no items cannot be checked, so the reader may not submit one; deciding per line lets the operator act on a pattern without acting on every voice; keeping what is undecided held means "Noted" never loses an item.

## Alternatives considered

| Alternative | Why rejected |
| --- | --- |
| Turn every item behind a line into its own work item | Several pieces of work for one request; the operator asked about the line. |
| Read kept items again as soon as the count is reached | The same items would be read again at once, producing the same list. |
| Going back to Why whenever the reader suggests it | Only the operator decides a change of purpose ([0036](0036-finding-out-if-people-want-it-is-out.md)). |

## Consequences

- `reading_submit` changes shape (lines are `{line, items}`, plus `not_wanted`); the reader's prompt says so.
- Storage: `intake_items.held_at`; a reading's short list keeps each line's items and the operator's decision.

## Related

[Intake](../specs/intake.md), [reader prompt](../prompts/reader.md), [0113](0113-agent-roles.md).
