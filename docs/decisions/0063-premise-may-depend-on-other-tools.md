# 0063. Nobody has to use another tool alongside premise; premise may depend on other tools

- Status: Accepted
- Supersedes: [0038](0038-premise-stands-alone.md)
- Scope: The product
- Date: 2026-11-21
- Decided by: The owner, correcting [0038](0038-premise-stands-alone.md): "On other tools, I said we shouldn't need to use both at the same time. Not our product needn't depend on anything. Same for entail and for usage-ledger".
- Source: Old docs/decisions.md entry 63, which quotes the owner from the assistant's notes of the 2026-11-21 conversations; those notes are not kept in this repository.

## Context

- [0038](0038-premise-stands-alone.md) and the vision said premise "stands alone. It does everything it needs itself".

## Decision

- A person must not need to use premise and another tool side by side.
- premise itself may be built on other tools underneath, entail and usage-ledger included.

## Reason

- Owner, correcting entry 38: "On other tools, I said we shouldn't need to use both at the same time. Not our product needn't depend on anything. Same for entail and for usage-ledger".

## Alternatives considered

| Alternative | Why rejected |
| --- | --- |
| premise does everything it needs itself ([0038](0038-premise-stands-alone.md)) | The owner corrected it: only using two tools side by side is ruled out. |

## Consequences

- **Vision changed:** the bullet "It stands alone. It does everything it needs itself, and nobody has to use another tool alongside it." now reads "Nobody has to use another tool alongside it. It may be built on other tools underneath."
- **Reopened:** [0058](0058-cost-tracking-inside-premise.md), cost tracking inside premise. Settled in [0064](0064-cost-and-spending-limit-from-usage-ledger.md).
- The tools underneath are listed in the [architecture overview](../architecture/overview.md).

## Related

[0038](0038-premise-stands-alone.md), [0064](0064-cost-and-spending-limit-from-usage-ledger.md), [0024](0024-no-other-tools-unless-they-match-the-vision.md).
