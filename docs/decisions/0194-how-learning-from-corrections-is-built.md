# 0194. How learning from corrections is built

- Status: Accepted
- Scope: Milestone 8
- Date: 2026-11-21
- Decided by: The builders; the points marked "chosen for the owner" are the owner's to correct.
- Source: [0173](0173-premise-learns-from-corrections.md), [0195](0195-two-kinds-of-learning.md), the [roadmap's milestone 8](../product/roadmap.md#milestone-8-the-measures-and-learning-from-corrections), and the task that built it.

## Context

- [0173](0173-premise-learns-from-corrections.md) asks for two short lists, each line tied to its correction and deletable. [0195](0195-two-kinds-of-learning.md) adds a third place, improvements for premise itself, kept apart from the two. Neither says which acts count, who reads them, how a line reaches agents, or how short "short" is.

## Decision

1. **What counts as a correction:** striking or editing an item premise wrote (not one a person wrote), asking for changes to a proposal, declining a gate request, sending work back, undoing a split, and a bug against something premise's check said was met. premise finds them in the events table, which every module already writes; no other module has to tell it.
2. **Each is read into exactly one destination** (this software, the operator's taste, premise itself, or nothing to learn), with what kind of mistake it was and why it goes there. The triager reads it, as a job on the triage task's model and effort, and answers with `lesson_submit`. premise's fixed rules decide instead when `learning.read_with_agent` is off, when agents cannot start, when the agent gives no answer, and always for an undone split and a checker miss, which need no judgement.
3. **A line takes effect from the next brief premise writes** for the drafter, planner, builder or checker after the line exists. Briefs written before it, such as the next stage's when the correction is read while that stage is already queued, do not have it ([issue 117](https://github.com/omkarbhale/premise/issues/117)). Each time a line goes into a brief it counts as used. The drafter and planner are told to mark a draft item that follows a lesson, and the page shows "Follows what you taught premise (L-3): …" on it.
4. **Proposed in passing.** A new line is said once in the software's conversation, never asked as a question, and takes effect unless the person edits, moves or deletes it on the Learned tab, each in one click.
5. **Short lists.** At most `learning.software_lines_max` lines per software and `learning.taste_lines_max` lines of taste (10 each, chosen for the owner); a line is at most `learning.line_max_chars` (200). Over the cap, the least-used line is dropped (the oldest among equals), with a note in the conversation and on the page. Improvements for premise have no cap, since they never reach a brief; the same thing recurring is grouped under one topic instead.
6. **Where the lists are kept.** Both lists, and the improvements, are kept in premise's database in its data folder. The operator's taste is about a person, so it never goes into a software's repository ([0081](0081-nothing-about-people-in-the-repository.md)). The software's own lessons are not written into its repository yet: each change would be a new commit, which makes the report say a newer version is not running. This adjusts the builders' note in [0173](0173-premise-learns-from-corrections.md); writing them into the record without that effect is [issue 116](https://github.com/omkarbhale/premise/issues/116).
7. **Improvements for premise** can be saved as a text file from the page. Sending them anywhere outside the machine would be a floor action through the gate; that is not built, and the page says so.

## Reason

- Builders' note: reading corrections from the events keeps learning out of every other module's way; one destination per correction, with its reason and a one-click move, keeps a wrong call cheap to fix; the caps keep the briefs short and the lists readable.

## Alternatives considered

| Alternative | Why rejected |
| --- | --- |
| Each module calls learning when a person corrects something | Every module would have to remember; the events already say it. |
| Ask the person to confirm each new line | It spends attention on every correction ([0027](0027-spend-least-of-peoples-attention.md)); a line in passing that can be removed costs nothing. |
| Rebuild queued briefs when a line arrives | Briefs are fixed when a job is queued; rebuilding them would make a job's brief change under it. |
| Write each software's lessons into its repository at once | Each change would be a commit that makes the report say a newer version is not running. |

## Consequences

- New tables `corrections`, `lessons` and `learning_cursor` ([storage](../specs/storage.md)); the `lesson_submit` tool for the triager ([agent tools](../specs/agent-tools.md)); the learning brief ([triager prompt](../prompts/triager.md)); new `learning.*` settings ([configuration](../reference/configuration.md)).
- The whole is described for the owner in the [learning spec](../specs/learning.md).

## Related

[0022](0022-people-can-put-in-their-taste.md), [0173](0173-premise-learns-from-corrections.md), [0193](0193-how-the-measures-are-built.md), [0195](0195-two-kinds-of-learning.md).
