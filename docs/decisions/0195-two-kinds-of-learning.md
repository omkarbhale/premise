# 0195. Two kinds of learning: premise adapting, and premise itself improving

- Status: Accepted
- Scope: The plan
- Date: 2026-11-21
- Decided by: The owner (quoted); the reading below is the builders'.
- Source: The owner's message of 2026-11-21, passed on while learning from corrections was being built.

## Context

- [0173](0173-premise-learns-from-corrections.md) set two lists: what a software's corrections taught, and the operator's taste. The owner then said learning is two things.

## Decision

- The owner: "Learning is two things, right? Premise adapting to the software, and things that premise itself should improve. Handled both cleanly and in this case I don't know how we are handling learning in the first place so I might have to go through its spec."
- Builders' reading (not the owner's words):
  - **Premise adapting** is the two lists of [0173](0173-premise-learns-from-corrections.md): lessons for one software, and the operator's taste across softwares. They take effect at once, through agents' briefs.
  - **Premise itself improving** is a separate list, "Improvements for premise": what a correction or a measure says about premise's own procedure, prompts or defaults rather than about the software or the person (a stage asked what it could have assumed, the plan split one change into two, a builder forgot the trace line, a check missed something). Each keeps its evidence: which software, which correction, how often seen. These never change how premise works on their own; the operator can save them as a text file.
  - The two are kept apart in code, storage and on the page. Each correction goes to exactly one place (this software, the operator's taste, premise itself, or nothing to learn), with its reason shown, and the person can move it in one click.
  - The owner wants to read how learning works, so it is written down in a few minutes' read: the [learning spec](../specs/learning.md).

## Reason

- Owner: "Learning is two things, right? Premise adapting to the software, and things that premise itself should improve."
- Builders' note: keeping improvements to premise out of the briefs means a correction can never quietly change how premise works for every software; a person decides that.

## Alternatives considered

| Alternative | Why rejected |
| --- | --- |
| Let improvements for premise change its prompts at runtime | premise would change itself with no person deciding; the owner asked for the two to be handled apart. |
| One list with a tag for each kind | The owner asked for both to be handled cleanly; a tag is easy to miss. |

## Consequences

- Built with [0194](0194-how-learning-from-corrections-is-built.md); described in the [learning spec](../specs/learning.md).

## Related

[0173](0173-premise-learns-from-corrections.md), [0172](0172-premise-measures-its-own-return.md), [0194](0194-how-learning-from-corrections-is-built.md).
