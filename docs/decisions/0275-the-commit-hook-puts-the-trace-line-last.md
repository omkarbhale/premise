# 0275. The commit hook puts the trace line last, and a refusal says what is wrong

- Status: Accepted
- Partly supersedes: [0192](0192-effort-in-proportion-to-what-was-asked.md) point 3 (what the commit hook does to a message that already names a trace)
- Scope: Making premise
- Date: 2026-11-23
- Decided by: The builders
- Source: The first real run, where a builder's commit was refused for having no trace line although it had one; [0083](0083-trace-trailer-on-every-commit.md), [0192](0192-effort-in-proportion-to-what-was-asked.md).

## Context

- Every commit in a software's repository carries a trace line naming the record items it serves, for example `Premise-Trace: W-1, D-2`, in the last paragraph of its message ([0083](0083-trace-trailer-on-every-commit.md)).
- In the first real run a builder wrote the line, but its tooling then added a co-author line after it. The trace line was no longer in the last paragraph, and premise refused the commit as having no trace line. The hook of [0192](0192-effort-in-proportion-to-what-was-asked.md) left the message alone because it did name a trace.
- The refusal said the line was missing, which was not true, so neither the builder nor the person reading it could tell what to change.

## Decision

1. **The hook puts the line last.** In a builder's working copy the commit hook now leaves the message with its trace line as the last line of its last paragraph. A trace line the message already has, wherever it is, is moved there and kept as written. When the message names none, the hook adds the task's own line, as before.
2. **Co-author lines are dropped.** The hook removes lines starting `Co-authored-by:` (in any capitalisation) from the message. The record names the items the work serves, not the tools that helped, and such a line is what pushed the trace line out of the last paragraph.
3. **The check on push stays, and its reasons are told apart.** Each refusal says in plain words what is wrong and what to do: the commit message has no trace line; the line is there but is not in the last paragraph, so move it to the end; the line names no item; the line has something that is not an item ID; the line names an item that is not in the record.
4. **The hook is still a short portable shell script** that uses only git and standard tools, as before.

## Reason

- Normalising the message removes the failure at its source, where a retry of the whole task would cost far more than a rewritten line ([0192](0192-effort-in-proportion-to-what-was-asked.md)).
- A refusal that names the real problem lets the builder fix it in one step, and a person reading it needs no knowledge of how commit messages are laid out ([0027](0027-spend-least-of-peoples-attention.md)).

## Alternatives considered

| Alternative | Why rejected |
| --- | --- |
| Accept the trace line anywhere in the message | The line's place at the end is what makes it easy to read reliably by tools; a loose rule would make that unreliable. |
| Only improve the refusal message | The builder would still lose a task attempt to something a hook can put right. |
| Fix the commits in the server after the build | The commit would then differ from what the builder made and tested ([0192](0192-effort-in-proportion-to-what-was-asked.md)). |

## Consequences

- Commits made in a builder's working copy end with exactly one trace line and carry no co-author lines.
- Commits made elsewhere, outside the hook, are still checked on push and refused with the specific reason.
- Carried in the [record keeper](../specs/record-keeper.md) and the [builder prompt](../prompts/builder.md).

## Related

[0027](0027-spend-least-of-peoples-attention.md), [0083](0083-trace-trailer-on-every-commit.md), [0192](0192-effort-in-proportion-to-what-was-asked.md).
