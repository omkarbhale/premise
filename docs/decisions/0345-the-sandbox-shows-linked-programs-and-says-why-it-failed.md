# 0345. The runner's sandbox shows linked programs, and the name check says the real cause

- Status: Accepted
- Scope: Making premise
- Date: 2026-11-24
- Decided by: The builders
- Source: The owner's real run of a web app on Linux under WSL2: built and checked, but the start stopped with "Names cannot be looked up inside premise's sandbox on this machine: /etc/resolv.conf points to /mnt/wsl/resolv.conf, which is not visible", while the machine, and a sandbox like premise's, looked names up fine. Follows [0311](0311-names-must-resolve-inside-the-runners-sandbox.md).
- Numbered apart from the records being written at the same time by other tasks.

## Context

The person had answered a "needed" tool question with "I installed it", and premise recorded the program at `/usr/local/bin/chrome-headless-shell`, a link to `/opt/chrome-headless-shell/chrome-headless-shell`. The runner bound that path read only over itself. Inside the sandbox `/usr` is already there, so the path is a link pointing into `/opt`, which is not; bubblewrap could not create the place to bind onto, said so, and ran nothing. The name check ran its lookup in that sandbox, saw a failure, and blamed the `/etc/resolv.conf` link without looking: `/mnt/wsl/resolv.conf` was bound and readable all along.

## Decision

1. **A read-only path inside a folder the sandbox already shows is not bound again.** It is already visible.
2. **For a link, its real target is bound.** When the target is a program file, the folder that holds it is bound, because a program such as a browser needs the files beside it; never the home folder or a whole mount (a path with fewer than two parts), where only the file is bound. When the link itself is not inside a shown folder, the sandbox gets the same link. A link that points nowhere is left out. (Builders' choice: the program's own folder is the least that makes it run.)
3. **The name check tells apart the three causes.** `getent` ends with 2 when a name is not found. Any other failure means the sandbox itself did not start: the start stops as a machine fault with what bubblewrap said, and points at `runner.read_only_paths`, `runner.extra_tool_paths` and the programs the person said they installed. Only when the name was not found does the message speak of names, and it blames a `/etc/resolv.conf` link only after checking, in the same sandbox, that the file cannot be read there; otherwise it says the host name was not found. (Builders' choice.)

## Alternatives rejected

- Binding every provided path as it is, and leaving out the ones that fail: the person's program would silently be missing, and the build would fail later for a reason no one sees.
- Removing the name check: it exists so a machine without working names in the sandbox fails at once, not after the build time limit ([0311](0311-names-must-resolve-inside-the-runners-sandbox.md)).

## Consequences

- [Runner spec](../specs/runner.md): what the build step's sandbox shows, and the new failure "premise's sandbox could not start".
