# 0182. How the gate asks, approves and acts; creating any GitHub repository is gated

- Status: Accepted; points 5 to 7 chosen for the owner, open to the owner's correction. Partly superseded by [0220](0220-approvals-and-verdicts-tell-the-truth.md): what an approved GitHub step says, and standing approvals scoped to one kind of action
- Scope: Making premise
- Date: 2026-11-21
- Decided by: The builders, while building the gate. Points 5 to 7 are chosen for the owner, on the owner's instruction "choose for me" ([0136](0136-open-questions-chosen-for-the-owner.md)).
- Source: [gate](../specs/gate.md), [the floor and the gate](../architecture/the-floor-and-the-gate.md), [0100](0100-floor-actions.md), [0101](0101-the-gate-asks-in-the-session.md), [0141](0141-github-repositories-in-tests-and-behind-the-gate.md), [0161](0161-github-repository-step-not-approved.md).

## Context

- The specification fixes the floor kinds, asking under a role, approvals for one action or a kind, and that the server performs. It leaves the card's details, what an approved action with no server act means, and which repository step is gated.

## Decision

1. **The card is fixed text** filled from the request: a title by floor, what will happen, why, which floor it is on, and what waits. Buttons: approve once; approve the kind for this software (not shown for deleting data or spending money, or a kind left out of `gate.kind_approvals_allowed`); decline, with an optional reason.
2. **Requests, decisions, approvals, withdrawals and outcomes are rows and events** (`gate_requests`, `approvals`). A request covered by a standing kind approval is approved at once and said in the session.
3. **Approved actions are carried out by named server acts** registered with the gate. An approved request with no server act (most agents' requests today) is recorded as approved and done with "premise has no way to carry out this kind of action itself yet". A failed act is recorded and said; it is not retried.
4. **An agent's `gate_request` does not hold its session:** the agent is told the request is asked and finishes what it can without it.
5. **Creating any repository on GitHub is gated,** not only a public one: a private repository is kind `publish` (acting in the owner's name on an outside service), a public one `make-public`. Until the step is approved ([0161](0161-github-repository-step-not-approved.md)), approving it ends in "not done: that step has not been approved yet", and the software stays on this machine.
6. **Declining the repository does not stop the line.** The software stays on this machine and building goes on.
7. **Approvals for a kind of action are available from milestone 1,** not only from milestone 3, because the instruction for this step asks for them; they are always for one software.

## Reason

- 1 to 4: the specification's flow, with the work that does not depend on an answer going on ([0101](0101-the-gate-asks-in-the-session.md)).
- 5: [0141](0141-github-repositories-in-tests-and-behind-the-gate.md) keeps creating a real GitHub repository behind the gate; a private repository is still made in the owner's name.
- 6: a second copy is not needed to build and try a software on this machine.

## Alternatives considered

| Alternative | Why rejected |
| --- | --- |
| Gate only a public repository | A repository made in the owner's account is outward-facing whatever its visibility. |
| Ask again after a refusal until approved | Spends the operator's attention on a copy the software does not need. |
| Hold the agent's session until the decision | Holds an agent slot on a person's time. |

## Consequences

- The record keeper's GitHub step and the `gate_request` tool both go through the gate.
- The page lists standing approvals per software, each with a withdraw button.

## Related

[0100](0100-floor-actions.md), [0101](0101-the-gate-asks-in-the-session.md), [0141](0141-github-repositories-in-tests-and-behind-the-gate.md), [0161](0161-github-repository-step-not-approved.md), [0183](0183-how-the-line-engine-is-built.md).
