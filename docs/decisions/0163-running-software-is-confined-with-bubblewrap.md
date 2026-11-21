# 0163. Running software is confined with bubblewrap

- Status: Accepted
- Scope: Making premise
- Date: 2026-11-22
- Decided by: The builders, while building the runner. The owner did not make this choice.
- Source: [runner](../specs/runner.md) 5.3 and 9, [0087](0087-agents-run-confined.md), [0092](0092-security-defaults.md).

## Context

- The runner's software must be "confined like an agent" where that applies. Agents are confined by Claude Code's own sandbox, which belongs to a Claude Code session and cannot be used to start an ordinary program.

## Decision

- Running software is confined with **bubblewrap**, the program Claude Code's sandbox is itself made with, and which premise already requires for real agents.
- The software sees the system's programs and libraries (read only), its own copy of the code (writable), an empty temporary folder, and nothing else: not premise's data folder, not the owner's home folder, not any credential, not another software's copy.
- A command-line software also gets no network. A web software shares the machine's network, because it has to be opened from the owner's browser; it is not stopped from making outgoing connections, and the page does not claim it is.
- `runner.confinement` can be `none`, for a machine where bubblewrap cannot work. The environment is still built from nothing, and the page says plainly, on the run, that it ran without confinement.
- Programs installed under the owner's home folder (such as Node.js) are not visible by default; `runner.read_only_paths` names what to make readable.
- The runner never starts software outside the sandbox by itself: the default is confinement on, and a missing bubblewrap makes the start fail with a message about it.

## Reason

- It matches what agents get, uses what is already required, and can be tested without Claude.

## Alternatives considered

| Alternative | Why rejected |
| --- | --- |
| Claude Code's sandbox for the run | It only exists inside an agent session. |
| Containers | Another program to install, for no extra protection here. |
| No confinement | Built software is code an AI wrote; the plan runs it confined. |

## Consequences

- Outgoing network filtering for web software is not built; filed as an issue.

## Related

[0087](0087-agents-run-confined.md), [0162](0162-how-the-runner-is-built.md).
