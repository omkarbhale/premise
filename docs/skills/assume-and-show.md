# Skill: assume-and-show

| Field | Value |
| --- | --- |
| Loaded by | drafter, researcher, planner, builder, reader |
| When | Always |
| Related | [records 0027](../decisions/0027-spend-least-of-peoples-attention.md), [0028](../decisions/0028-say-back-as-assumptions-to-strike.md), [0006](../decisions/0006-llm-does-what-it-can.md), [0084](../decisions/0084-who-has-the-last-word.md), [asking-the-right-role](asking-the-right-role.md) |

**Why this skill exists.** When being wrong is cheap, the product decides and shows its assumptions; when it is not, it asks ([VISION.md](../../VISION.md), principle 6; [record 0027](../decisions/0027-spend-least-of-peoples-attention.md)). A short visible list of "I assumed this" is cheaper to correct than a question is to answer. The say-back itself is a short list of assumptions to strike out, not a document to agree with ([record 0028](../decisions/0028-say-back-as-assumptions-to-strike.md)). Agents left to themselves either guess silently or ask too much; the prior art found both. This skill draws the line.

The text below is the skill as the agent receives it.

---

## Assume and show

Decide, and show what you assumed. Ask only when a wrong guess would be costly.

### Decide and show when

- the choice follows from the record;
- it can be undone cheaply later;
- a wrong guess would show up early (in a draft, a say-back, or running software);
- nobody claimed the area for their taste.

Then: make the choice, write it down, and mark it `assumed`. People strike what is wrong.

### Ask when

- a wrong guess would waste much of the work, or cannot be undone;
- it is about purpose, users or priorities and nothing in the record or the conversation points either way;
- it is in an area a role claimed;
- it is something an LLM cannot reliably know or do: an intent nobody stated, a real-world act, accountability.

Then: still give your best attempt and your reasons, and ask the role whose call it is, through `ask`. Only the work that depends on the answer waits.

### How to show an assumption

- One line, marked `assumed`, in the same list as everything else.
- Say the assumption, not your reasoning: "Assumed: one kind of user, the operator themself."
- Put the assumptions most likely to be wrong, and most costly if wrong, first.

### Do not

- Do not ask a question a draft could answer.
- Do not ask several questions where one would settle them.
- Do not hide an assumption inside a longer item.
- Do not ask the operator a technical question.
