# 0275. An agent that ends without its structured answer is asked once more, and lists sent as text are read

- Status: Accepted; point 4 chosen for the owner, open to the owner's correction
- Scope: The product
- Date: 2026-11-23
- Decided by: The builders, fixing what the owner found in his first real run; the point marked chosen for the owner is the assistant's.
- Source: The owner's first real run: the triager "finished without an answer", so his item went in by premise's default with the note "Not triaged". Its session record shows why: it called `triage_submit` four times with `"touches"` as a text holding a JSON list (`"[{\"id\": \"W-2\", ...}]"`); premise refused each with "Give touches as a list", the agent said it could not submit, and ended. `triage_submit` and `reading_submit` published a schema with no fields, so the agent's client had nothing telling it `touches` is a list. The scripted agent, which passes real lists, never does this.

## Context

- Every agent job that expects a structured answer (triage, sizing, drafts, plans, reviews, checks, readings) had the same weakness: an agent that ends without the answer either fell back silently (sizer, triager, reviewer: a missing review counted as agreement) or stopped the stage.

## Decision

1. **Every tool publishes its fields.** `triage_submit` and `reading_submit` now name each field and its type, with lists as lists.
2. **A list or object sent as text is read as what it holds.** Where a tool's schema says a field is a list or an object and the agent sent text that parses as one, premise takes the parsed value, for every tool. Anything else is left to the tool's own checks, whose diagnostics now say plainly when a list came as text.
3. **A job that ends done without its answer is asked once more,** with the exact shape the answer must have put in front of its brief: the triager, the sizer, the drafter and planner at every early stage, the reviewer, and the checker when it gave no verdict at all. Only when that second session also ends without an answer does premise fall back as before.
4. **The fall back is said plainly.** An untriaged item's reason says the triager gave no usable answer even when asked twice and that premise took it in by its default; the Intake tab says "not triaged" (chosen for the owner: the default route itself is unchanged, a wish going in normally). A reviewer that never answers no longer counts as agreement: premise says the costly choices go on without a second look.

## Reason

- The owner's run showed the agent was willing and right; only the form was wrong. Reading the form it used, and asking once more with the exact form, keeps a real agent's answer instead of a default nobody chose.
- One more try bounds the cost: a session that cannot answer twice is not asked a third time.

## Alternatives considered

| Alternative | Why rejected |
| --- | --- |
| Only fix the triager's schema | The same weakness sits in every job that expects a structured answer. |
| Retry until an answer comes | Unbounded cost; the second session already gets the exact shape. |
| Ask the operator at once when an answer is missing | Spends the person's attention on premise's own plumbing; one automatic retry first. |

## Consequences

- `src/agents/ask-again.ts` holds the exact shapes and makes the second job; `src/agents/tool-server.ts` decodes lists and objects sent as text.
- Tests cover a triager that answers nothing the first time and correctly the second, and one that never answers and falls back, saying so.

## Related

[0062](0062-intake-goes-in-normally.md), [0094](0094-triager-reads-every-item.md), [0150](0150-agent-tools-over-plain-http-mcp-tokens-in-memory.md), [0185](0185-how-intake-in-a-thin-form-is-built.md), [0273](0273-a-change-is-planned-and-built-as-a-change.md).
