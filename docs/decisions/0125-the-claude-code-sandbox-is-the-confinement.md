# 0125. The Claude Code sandbox is the confinement; no container fallback on the owner's machine

- Status: Accepted
- Partly supersedes: [0087](0087-agents-run-confined.md), the container fallback
- Scope: The plan
- Date: 2026-11-21
- Decided by: The builders, after the subscription and sandbox test of 2026-11-21. The owner did not make this choice.
- Source: The [test report](../record/subscription-sandbox-test-2026-11-21.md).

## Context

- [0087](0087-agents-run-confined.md) confines every agent with Claude Code's sandbox (bubblewrap and socat) plus permission rules, and says that if milestone 1 shows the sandbox leaks, agents run in a container per session, which makes Docker a prerequisite.
- The test of 2026-11-21 checked, with the sandbox on and the container not used: writes outside the working copy, a planted dummy secret, a host that is not allowed, and two sessions at once. All held.

## Decision

- Claude Code's sandbox (bubblewrap and socat), together with permission rules for the file tools, is the confinement on the owner's machine.
- The container fallback of [0087](0087-agents-run-confined.md) is not needed there, and Docker is not a prerequisite.
- The prerequisites are checked at setup. If bubblewrap or socat is missing, premise refuses to run agents and names what is missing. It never runs them unconfined. Runs ask Claude Code to fail if the sandbox cannot start, and not to run commands outside it.

## Reason

- The test: the sandbox held for every case it checked, and with the sandbox required but a part missing, Claude Code refused to start, so it fails closed ([report](../record/subscription-sandbox-test-2026-11-21.md)).

## Alternatives considered

| Alternative | Why rejected |
| --- | --- |
| A container per agent, as [0087](0087-agents-run-confined.md) holds in reserve | The test showed the sandbox is enough on the owner's machine; a container would add Docker as a prerequisite for no gain. |
| Run without confinement if the prerequisites are missing | Security-sensitive; premise refuses to run instead ([0056](0056-what-is-on-the-floor.md)). |

## Consequences

- Only the container fallback of [0087](0087-agents-run-confined.md) is superseded. Its rule that every agent runs confined, and its list of what is denied, still stand.
- The test also showed what the agent runner has to do; see the [report](../record/subscription-sandbox-test-2026-11-21.md#what-this-means-for-the-plan).
- Not proven by the test, and still open: process-level escapes, and behaviour on the models the plan uses for real work ([open questions](../open-questions.md)).

## Related

[0087](0087-agents-run-confined.md), [0100](0100-floor-actions.md), [0124](0124-unattended-claude-code-on-the-subscription-is-allowed.md).
