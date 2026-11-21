# 0162. How the runner starts, keeps up and stops software

- Status: Accepted
- Scope: Making premise
- Date: 2026-11-22
- Decided by: The builders, while building the runner. The owner did not make these choices.
- Source: [runner](../specs/runner.md), [build, check and run](../architecture/build-check-run.md), [0017](0017-the-line-ends-at-running-software.md), [0092](0092-security-defaults.md), [0120](0120-secrets-stay-out-of-premise.md).

## Context

- The runner specification says what the runner does and leaves its mechanics to the builders: how `run.md` says how to start a software, how ports are chosen, what counts as a crash, and what happens when premise stops.

## Decision

Each is a builders' choice, open to correction:

1. **`run.md` keeps free text for people and one fenced block for the runner.** The block is marked `premise-run` and holds `key: value` lines: `kind` (`web`, `command` or `program`) and, by kind, `start` and `open` (a web software), `command` and `sample` (a command-line software), or `program` (a desktop app). `{port}` in `start` is replaced by the chosen port; `PORT` and `HOST` are also in the software's environment. When the block is missing or wrong, the failure says what to add.
2. **Every start is from a clean copy.** The runner clones the software's own repository into `work/<software>/run/` at the commit (the latest when none is given), removes the link back to the repository, and starts from there. The copy is thrown away and made again on the next start.
3. **A web software is up when it answers on its port.** The runner waits up to `runner.start_timeout_seconds`. A software that stops during that wait has failed to start, and the failure carries its latest output.
4. **Nothing is exposed beyond this machine.** The software is told to listen on `127.0.0.1`. After it answers, the runner also tries every other address of the machine; if the software answers on one, it is stopped and the start fails, with a message that says what to change. The page link is always `http://127.0.0.1:<port>/`.
5. **Ports come from `runner.port_range`**, the first free one, and no two running softwares share one.
6. **A command-line software is run once on its sample**, with no network, and its output is kept for the page. A desktop program is not started; the page shows what was built and how to start it.
7. **A crash is a stop nobody asked for.** The runner starts the software again after `runner.restart_delay_seconds`, up to `runner.restart_limit` times within `runner.restart_window_minutes`; then it stops trying, marks the run as crashed and keeps the output. Each step is an event: started, crashed, restarted, gave-up, stopped.
8. **Runs end with premise.** Stopping premise stops every running software. A run still marked as up when premise starts again is marked stopped, so the page never shows a link to nothing.
9. **Secrets:** a file `secrets/<software>.env` in the data folder, written by a person, is copied into the run copy as `.env` (readable by the owner only) and kept out of git. premise never reads its values.
10. **No setup step yet.** The runner starts the software as it is in the repository; installing dependencies is not part of it, and a software whose start needs them must carry them. A setup command with registry access is left for later.
11. **More than one software may run at once.** The specification's one-at-a-time limit for before milestone 7 is the line engine's to keep; the runner has no reason to refuse.

## Reason

- A fenced block lets `run.md` stay readable by people while giving the runner something exact, and the check can run the same block from a clean copy.
- Probing the machine's other addresses tests the one promise that matters (not reachable from elsewhere) without trusting the software to keep it.

## Alternatives considered

| Alternative | Why rejected |
| --- | --- |
| A separate `run.json` | A second file to keep in step with `run.md`, which the check already runs from. |
| Trusting the software to listen only locally | A mistake would expose it without anyone noticing. |
| Running a setup command with open network access | The agents' confinement limits the network to package registries by a proxy; the runner has none yet. Filed as an issue. |

## Consequences

- Carried in the [runner](../specs/runner.md) specification and the configuration reference.

## Related

[0017](0017-the-line-ends-at-running-software.md), [0087](0087-agents-run-confined.md), [0163](0163-running-software-is-confined-with-bubblewrap.md).
