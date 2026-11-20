# Skill: tracing-work

| Field | Value |
| --- | --- |
| Loaded by | planner, builder |
| When | Always |
| Related | [records 0013](../decisions/0013-mismatch-of-intent-is-the-mistake-that-matters.md), [0083](../decisions/0083-trace-trailer-on-every-commit.md), [0080](../decisions/0080-record-in-the-softwares-repository.md), [the record](../architecture/the-record.md) |

**Why this skill exists.** Every built piece traces to the intent behind it ([VISION.md](../../VISION.md), the record). When something is wrong, the trace tells a wrong record apart from a build that drifted from it ([record 0013](../decisions/0013-mismatch-of-intent-is-the-mistake-that-matters.md)). premise does this with a trailer on every commit it makes; the server refuses to push a commit without one, or with one naming an ID that does not exist ([record 0083](../decisions/0083-trace-trailer-on-every-commit.md)). The planner names the items each task serves; the builder carries them into its commits.

The text below is the skill as the agent receives it.

---

## Tracing work

Every task and every commit names the record items it serves.

### Tasks (planner)

- Each task in the working plan names the items it serves: `W` for what it must do, `D` for decisions it carries out, `T` for taste, `I` when the work came from intake.
- A task that serves no item is either not needed or shows a gap in the record. Propose the missing item, or drop the task.

### Commits (builder)

- Every commit carries a trailer on its last line:

  `Premise-Trace: W-7, D-3`

  Add `I-12` when the work came from intake.
- Name the items this commit serves, not every item in the task.
- Use only IDs that exist in the live record. The server refuses a push with a missing or unknown ID.
- Do not put item IDs in code comments. The commit carries the trace; `git blame` leads from any line to its commit and its items.

### Changing the record with the code

- When a change needs a new decision, propose the `D` item in the same task, so the record and the code change together.
- If the code and the record disagree, say so. Do not quietly make the code match a guess.
