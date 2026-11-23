# 0285. Each agent tool declares its whole shape, reads what real agents send, and says plainly when an answer could not be handed in

- Status: Accepted
- Scope: Making premise
- Date: 2026-11-23
- Decided by: The builders; point 7 chosen for the owner
- Source: The owner: "I think there's a bug in premise somewhere that the agents can't submit their final answer. I think this happened in intake or somewhere else". The transcripts of every agent session of the owner's first two real softwares; [0073](0073-mcp-tools-with-session-tokens.md), [0150](0150-agent-tools-over-plain-http-mcp-tokens-in-memory.md), [0276](0276-the-record-keeper-lands-each-decision-once.md).

## Context

- In the first real runs, real Claude Code agents often could not hand in their answers:
  - `triage_submit`: 7 calls, 7 refused. Each time the triager sent `touches` as quoted JSON text (a string holding the list), premise answered `Give "touches" as a list of {...}`, and the agent tried again the same way, up to four times, then gave up. Both real intake items went in untriaged, by premise's default.
  - `record_propose`: 28 calls, 18 refused, mostly with "a builder may only add decisions" where the real fault was a missing or misplaced field.
  - `draft_submit`: 24 calls, 8 refused: "Item N has no text" for every item (the drafter put each record line under `line`), or the decision format.
- The cause: most tools were declared to agents as open objects (`triage_submit` and `reading_submit` with no shape at all; operations, items, milestones, tasks, verdicts and options as lists of open objects), so the model had nothing saying `touches` is a list or that an item's words go in `text`. The server, meanwhile, accepted only one exact shape.
- The scripted agent never showed it: its scripts pass exactly the shape the server expects, so the tests passed while real agents failed.
- When such a job ended, the page said only "the triager finished without an answer".

## Decision

1. **One shape per tool, declared and checked.** Every premise tool's input is written once, field by field, in `src/agents/tool-inputs.ts`: each field's type, the required ones, enumerations, and the shape of lists and their entries, each with a one-line description. From that one definition premise makes both the JSON Schema it declares in `tools/list` and the check it runs on every call (`src/agents/tool-shapes.ts`), so the two cannot drift. Where a module already read a plain line in place of an object (a drafted item, a touched item ID, a task title), the shape says so too. What a shape cannot say (whether an ID is live, how many items a stage may hold) stays with the module serving the tool.
2. **Lenient where it is safe, and only there.** Before the check, premise reads: a list, an object or a number that arrives as text holding JSON of that kind; "yes" and "no" (and "true" and "false") for true and false; null for a field that may be left out; and, for the fields whose module already ignored them, case and spacing in a fixed word ("Not met" for "not-met"). When it read a list or an object from text, the answer says so, so the agent sends it properly next time. It guesses nothing else: a field under another name (`line` for `text`), a record item's kind from its file, a milestone's number from "M-1" are refused, with a pointer.
3. **A refusal names the field.** Each wrong field gets one line: where it is (`operations[0].from`), what arrived (its kind and a short excerpt), what to send, and a correct example of that field, from the tool's own example. A missing field also names fields the object has that premise does not read, and when one is plainly the one meant, says to put it there. The same call refused twice the same way in a session gets a first line saying so, with the tool's whole example call to copy.
4. **Fields premise does not know are left alone.** An object may carry fields premise does not read; they are ignored, not refused, so an agent's harmless extra never costs a retry. They are named only when a required field is missing, where they are the likely mistake.
5. **An answer that could not be handed in is said, with its refusal.** When a job ends without its answer and the reason is that premise refused it (an answer tool was called, its last call refused, none accepted), the page says so with the refusal's first line: in the item's reason at Intake, the stage's "did not finish" question, the sizer's note, a reading's message, a taste proposal's note and an unjudged item's evidence. It is recorded once as an event and, read by premise's fixed rule, kept under Improvements for premise on the Learned tab, grouped by tool. The database learns this kind of correction (schema 17).
6. **The examples and the shapes agree.** Each role's instructions carry one complete example call of each of its tools ([0276](0276-the-record-keeper-lands-each-decision-once.md)); the examples use the declared types (true and false, not "yes" and "no"), and a test reads each against its shape strictly.
7. **Items that went in untriaged can be triaged again** (chosen for the owner). On a software's Intake tab, one line names the items that went in untriaged because the triager's answer could not be used, and offers to triage them again. Only items whose work is still waiting its turn are taken back off the line and triaged again; items whose work has started stay as they are, and the line says so.
8. **A plan task's milestone is a number.** "M-1" is refused, naming the field, where it used to be dropped without a word.

## Reason

- A model fills in a tool call from the declared schema. An open object tells it nothing, so it guesses, and a guess that is plausible JSON (a list as quoted text) fails every time the same way.
- One definition for the declaration and the check is the only way they stay in step; two copies drift, as the open declarations next to exact server checks showed.
- Reading a list sent as quoted JSON, or "no" for false, is unambiguous: there is one meaning and premise takes it. Reading `line` as `text`, or "M-1" as 1, is a guess about intent; refusing with a pointer costs one retry and is never wrong.
- An agent fixes a call in one step when the refusal names the field and shows the value to send; it repeats a call when the refusal only restates the rule. Saying "this is the same refusal again" breaks the loop seen in the first runs.
- The operator cannot act on "finished without an answer"; they can read "premise refused its last triage_submit call (…)", and premise's own improvement list is where a recurring shape problem belongs ([0195](0195-learning-is-two-kinds.md)).
- Point 7 for the owner: re-triaging work that has started would undo work in progress; work still waiting loses nothing by being read again, and one line costs the least attention ([0027](0027-spend-least-of-peoples-attention.md)).

## Alternatives considered

| Alternative | Why rejected |
| --- | --- |
| Keep the server checks as they were and only improve the descriptions | The model still has no declared types to follow; the declaration and the checks would drift again. |
| Validate with a JSON Schema library and declare a hand-written schema | Two definitions again, and a library's errors ("must be array") do not say what to send or show an example. |
| Refuse fields premise does not know (`additionalProperties: false`) | A harmless extra would cost a retry; the first runs show extras (`file`, `date`) next to the right fields. |
| Accept `line` for `text`, and a record item's kind from its file | A guess about intent; when wrong it is silent. A refusal that says where to put it is fixed in one step. |
| Retry the agent automatically when its answer is refused | The agent already has the refusal; retrying a session spends usage for the same mistake. |
| Re-triage every untriaged item, started or not | Would take back work in progress. |

## Consequences

- Real agents see each tool's full shape; the transcripts' shapes are replayed in `test/tool-shapes.test.ts`, which also checks that the declared JSON Schema accepts and refuses exactly what premise's check does, and the fake `claude` in `test/fixtures/fake-claude.mjs` drives a sizer, a drafter and a triager end to end with those shapes.
- A tool added later must have a shape: the tool server refuses to serve one without.
- Carried in `src/agents/tool-inputs.ts`, `src/agents/tool-shapes.ts`, `src/agents/tool-server.ts`, the [agent tools](../specs/agent-tools.md), [intake](../specs/intake.md) and [learning](../specs/learning.md) specifications, and [storage](../specs/storage.md) (schema 17).

## Related

[0027](0027-spend-least-of-peoples-attention.md), [0073](0073-mcp-tools-with-session-tokens.md), [0150](0150-agent-tools-over-plain-http-mcp-tokens-in-memory.md), [0195](0195-learning-is-two-kinds.md), [0276](0276-the-record-keeper-lands-each-decision-once.md).
