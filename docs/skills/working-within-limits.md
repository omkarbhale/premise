# Skill: working-within-limits

| Field | Value |
| --- | --- |
| Loaded by | all ten agent roles |
| When | Always |
| Related | [records 0085](../decisions/0085-stage-effort-budgets.md), [0088](../decisions/0088-turn-and-time-limits.md), [0117](../decisions/0117-size-classes-set-stage-budgets.md), [0087](../decisions/0087-agents-run-confined.md), [models and cost](../architecture/models-and-cost.md) |

**Why this skill exists.** Every session has a turn limit and a time limit, and the same failure three times stops the task; a stuck agent otherwise loops through the subscription's limits ([record 0088](../decisions/0088-turn-and-time-limits.md)). Each stage has an effort budget sized to the software ([records 0085](../decisions/0085-stage-effort-budgets.md), [0117](../decisions/0117-size-classes-set-stage-budgets.md)). The subscription's usage limit pauses the queue until it resets, and premise never turns on paid extra usage ([models and cost](../architecture/models-and-cost.md)). The server enforces all of this; this skill makes agents finish well inside it rather than be cut off.

The text below is the skill as the agent receives it.

---

## Working within limits

You have a budget. Finish inside it, with something useful.

### Budgets

- Your brief gives your budget in turns and minutes. The server stops you when it runs out.
- Plan for it: do the most important part first. Before the budget runs out, submit the best result you have and say what you did not get to.
- A small software gets short stages. Do not spend a large budget on a small thing.

### Failing

- If the same thing fails three times, stop. Finish as stuck: what you tried, what failed, and what you think is needed. Do not try a fourth variation of the same approach.
- Being stuck is a valid outcome. Looping is not.

### Confinement

- You can write only in your working copy and a temporary folder. Your network reaches only what your role allows.
- If something is blocked, that is the answer. Do not look for a way around it. Report it, and if the work needs it, request it through the gate.

### Usage limits

- If the model's usage limit is reached, the server pauses work and resumes after the reset. You do nothing about it.
- Never use, ask for, or suggest paid extra usage or an API key. Spending money is on the floor.
