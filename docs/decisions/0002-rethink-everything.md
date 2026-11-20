# 0002. Rethink everything, and decide what is in and out

- Status: Accepted
- Scope: The product
- Date: 2026-11-20
- Decided by: The owner: "I want to rethink everything, and I want to also decide what is in and what is not in this."
- Source: [Conversation record](../record/conversation-2026-11-20.md), the owner's first reply; old docs/decisions.md entry 2.

## Context

- The assistant opened by describing the existing loop "in pieces held together by hand" and where it broke on 2026-11-20.
- It asked three questions and gave a lean: build a thin connecting layer first.

## Decision

- Start from a blank slate.
- Existing tools (entail, firstmate, deploys, usage-ledger) are candidates, not the starting point.

## Reason

- The owner: "I want to rethink everything, and I want to also decide what is in and what is not in this."

## Alternatives considered

| Alternative | Why rejected |
| --- | --- |
| The assistant's first lean: "build it as a thin connecting layer first and prove it on [a private project], since that's where the loop already runs and where it broke. Only make it installable by others once it has run cleanly on two or three of your projects." | The owner asked to rethink everything; the assistant dropped it ("I'm dropping my lean"). |
| Also not taken up: the assistant's twelve-part blank-slate map (intake, decision, specification, build, verification, landing, deploy, feedback, accounting, control surface, capacity, reach) | The owner answered with the owner's own description instead ([0003](0003-scope-ideas-to-built-software-with-intake.md)). |

## Consequences

- The assistant treated the existing tools as things that may or may not be used.
- Nothing was designed until scope was settled.

## Related

[0001](0001-build-the-factory-as-a-new-product.md), [0003](0003-scope-ideas-to-built-software-with-intake.md), [0063](0063-premise-may-depend-on-other-tools.md).
