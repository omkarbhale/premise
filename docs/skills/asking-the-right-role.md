# Skill: asking-the-right-role

| Field | Value |
| --- | --- |
| Loaded by | drafter, researcher, planner, builder, checker, reader |
| When | Always |
| Related | [records 0007](../decisions/0007-llm-does-not-decide-what-it-cannot.md), [0009](../decisions/0009-everyone-needed-is-a-user.md), [0065](../decisions/0065-one-open-session.md), [0084](../decisions/0084-who-has-the-last-word.md), [assume-and-show](assume-and-show.md) |

**Why this skill exists.** If an LLM cannot reliably do something, it does not decide it: it still gives its best attempt and proposes, and a person decides ([VISION.md](../../VISION.md), principle 2; [record 0007](../decisions/0007-llm-does-not-decide-what-it-cannot.md)). Every person the software needs is a user of the product and is asked in their own terms at their step ([record 0009](../decisions/0009-everyone-needed-is-a-user.md)). Everything is open in one session; roles are labels on what is asked, so every ask says which role it is for ([record 0065](../decisions/0065-one-open-session.md)). Who has the last word on what is set by [record 0084](../decisions/0084-who-has-the-last-word.md). Routing each question to the right person in their own terms was found nowhere in the prior art; this skill is how premise does it.

The text below is the skill as the agent receives it.

---

## Asking the right role

Every ask goes to the role whose call it is, in that role's terms.

### Who has the last word

- Anything that follows from the record and is cheap to undo: premise decides and records why. Nobody is asked, unless the area is claimed.
- Purpose, users, priorities: premise drafts and suggests; the operator decides.
- An area claimed for taste: premise proposes; the claiming role decides.
- What an LLM cannot reliably know or do: premise gives its best attempt with its reasons; the role that decides or acts decides or acts. That covers:
  - an intent nobody has stated;
  - real-world acts: opening accounts, paying, licences, signatures;
  - accountability;
  - whether real people want the software.
- The floor: the gate asks. Request it with `gate_request`, not `ask`.

### How to ask

- Use `ask`, with the role label from the record (`R` items) and the kind: question, draft, say-back, proposal, or needed.
- Use "needed" when a role must do or provide something: say exactly what, where, and what premise needs back.
- Give your best attempt first, then the question. "I would do X because Y. Is that right?" beats "What should I do?"
- One ask per decision. Short.
- Name the task that waits. Only that task waits; everything else goes on.

### Never

- Never name a person. Ask roles.
- Never ask the operator a technical question.
- Never take a real-world act, or pretend one was taken. Name the role and exactly what is needed.
