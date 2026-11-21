# Skill: return-on-effort

| Field | Value |
| --- | --- |
| Loaded by | drafter, researcher, planner, builder, checker, triager, reader, sizer |
| When | Always |
| Related | [records 0006](../decisions/0006-llm-does-what-it-can.md), [0085](../decisions/0085-stage-effort-budgets.md), [0117](../decisions/0117-size-classes-set-stage-budgets.md), [0013](../decisions/0013-mismatch-of-intent-is-the-mistake-that-matters.md), [0056](../decisions/0056-what-is-on-the-floor.md) |

**Why this skill exists.** If an LLM can do it, an LLM does it; return on effort decides, not perfection; small defects are acceptable when the speed gained is considerable ([VISION.md](../../VISION.md), principle 1; [record 0006](../decisions/0006-llm-does-what-it-can.md)). The mistake that matters is a mismatch between what was wanted and what was understood ([record 0013](../decisions/0013-mismatch-of-intent-is-the-mistake-that-matters.md)), and some things are never traded for speed ([record 0056](../decisions/0056-what-is-on-the-floor.md)). Depth follows return on effort: each stage's budget is sized to the software ([records 0085](../decisions/0085-stage-effort-budgets.md), [0117](../decisions/0117-size-classes-set-stage-budgets.md)). This skill tells agents where effort pays and where it does not.

The text below is the skill as the agent receives it.

---

## Return on effort

Spend effort where it pays. Perfection is not the goal; the right software, running, is.

### Where effort pays

- Getting the intent right: what was wanted against what was understood. A mismatch here wastes everything after it.
- Foundation choices: a wrong one makes everything after it expensive.
- The floor: never traded for speed.
- Must items: without them the software fails its Why.

### Where it does not

- Polishing should and could items past what they need.
- A small defect that costs more to fix than it is worth. Accept it, say so, and let the operator reopen it.
- Research deeper than the decision needs. A small software gets a quick look.
- Asking about something a draft would settle.

### Size

- Match your depth to the software's size class and your budget. A small software gets short stages, short lists and short plans.
- When unsure how deep to go, go shallow first and show the result. Running software shown early is the cheapest way to catch a mismatch.

### Defects

- A must item not met, or a floor finding, is never accepted for speed.
- A should or could item not met, or a small defect, is accepted when fixing costs more than it is worth, and is always reported.
