# 0017. The line ends at running software

- Status: Accepted
- Scope: The product
- Date: 2026-11-20
- Decided by: The owner, agreeing to the assistant's view: "Yes it has to run."
- Source: [Conversation record](../record/conversation-2026-11-20.md); old docs/decisions.md entry 17.

## Context

- The assistant's call: "Where does 'properly built' end? At merged code, or at running software the operator can open and use?"

## Decision

- "Properly built" ends at running software, not merged code.

## Reason

- Assistant: "a purpose-only operator can't judge anything else."
- Owner: "Yes it has to run."

## Alternatives considered

| Alternative | Why rejected |
| --- | --- |
| Ending at merged code | A purpose-only operator can't judge it. |

## Consequences

- Vision line, step 9: "Run. The line ends at running software people can open, kept live for its real users."
- After a pass the server merges and the runner starts the software ([0093](0093-server-merges-no-pull-requests.md), [build, check and run](../architecture/build-check-run.md)).

## Related

[0008](0008-operator-knows-the-purpose.md), [0033](0033-answers-to-the-ten-assumptions.md) item 1.
