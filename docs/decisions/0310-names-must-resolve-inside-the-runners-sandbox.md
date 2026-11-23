# 0310. Names must resolve inside the runner's sandbox, and provided programs are visible

- Status: Accepted; points 4 and 7 are chosen for the owner, open to the owner's correction
- Scope: Making premise
- Date: 2026-11-24
- Decided by: The builders. Points 4 and 7 are the assistant's, open to the owner's correction.
- Source: The owner's real run of a command-line tool written for Node.js. [0163](0163-running-software-is-confined-with-bubblewrap.md), [0280](0280-the-run-step-builds-first-and-the-headline-tells-the-truth.md).

## Context

In the owner's real run the build step `npm ci` failed six times with "getaddrinfo EAI_AGAIN registry.npmjs.org", ran past the build time limit, the line went back to Build once, and the person was asked "Built and checked, but it would not start". Nothing was wrong with the software. On the owner's machine (Linux under WSL2) `/etc/resolv.conf` is a link to `/mnt/wsl/resolv.conf`. The runner's confinement binds `/etc` and the other system folders read only, but not `/mnt/wsl`, so inside the sandbox the link pointed nowhere and every host name failed. With the whole root bound the same lookup works. The agents' builders and checkers reached the registries in the same run.

## Decision

1. **Bind what the network's links point to.** After the system folders, the confinement follows every link at or under `/etc/resolv.conf`, `/etc/hosts`, `/etc/nsswitch.conf`, `/etc/ssl` and `/etc/ca-certificates` (folders a few levels deep), takes each link's final target, and binds that path read only when it is not already inside a bound folder. A target with fewer than two path parts (a filesystem root or a whole mount such as `/mnt`) is never bound. (Builders' choice: binding only the real file keeps the owner's other mounts out of the sandbox, which is why the whole root was not bound.)
2. **The agents' sandbox is unchanged.** Claude Code's sandbox starts from the whole filesystem readable and only denies the folders premise lists (`filesystem.denyRead` in the generated settings), so a link such as `/etc/resolv.conf` resolves there; that matches the run, where builders and checkers reached the registries. Nothing is changed for them. (Builders' choice.)
3. **An early check, and a machine fault is not the builder's.** Before the build steps, when the build has the network and runs in the sandbox, the runner looks up `runner.name_check_host` (default `registry.npmjs.org`; empty skips the check) once inside the sandbox with `getent hosts`. If it fails the start stops at once with "Names cannot be looked up inside premise's sandbox on this machine: /etc/resolv.conf points to <target>, which is not visible" (or, when resolv.conf is not a link, that the host did not resolve), and what to check. It does not wait for the time limit. The runner marks this failure as a machine fault, and the line does not send it back to Build: it says so and asks the person at once, who can try starting again once the machine can look up names. A sandbox without `getent` skips the check. (Builders' choice.)
4. **Chosen for the owner:** the check looks up one host rather than every host the build might use, and fails the start on that alone. It is cheap, and the failure it exists for (no working resolver in the sandbox) affects every name. The owner can empty `runner.name_check_host` to turn it off, or point it at the registry the software uses.
5. **Programs the person provided are visible to the build step.** The runner's sandbox hides the home folder, so a program the person installed for premise there (on the owner's game, Godot at `~/.local/bin/godot`, which builders and checkers could use) was invisible to the build step, which then tried to download it and failed on the name lookup. The list of provided programs lives in one place, `src/runner/provided-tools.ts`: the setting `runner.extra_tool_paths` (exact program files or folders, for every software), and the path premise recorded when the person answered a "needed" tool question with "I installed it" (for that software). The runner binds each read only at the same path and puts its folder on the sandbox's PATH, never the whole home folder; the agents put the same folders on their PATH. (Builders' choice.)
6. **A sample that runs out of time is a timing problem.** In the same run the start failed because the sample was the whole test suite, which ran past `runner.sample_timeout_seconds` (30 s) while every test passed. The builder's instructions now say the sample is a short demonstration that finishes in seconds, never the test suite (tests belong in a build line or the checker's work). When a sample is stopped by the time limit the message says it is a timing problem, names the setting, and the line does not send it back to Build as a fault in the software: it asks the person, as for a machine fault. (Builders' choice.)
7. **Chosen for the owner:** a recorded "I installed it" path is bound only for the software it was said for, not for every software, so one software's tool is not given to another. The owner can list a program in `runner.extra_tool_paths` to give it to all.

## Alternatives rejected

- Binding the whole root, or `/mnt`: it works, but it would put the owner's other mounts (their Windows drives under WSL2) inside the sandbox of running software.
- Copying `resolv.conf` into the sandbox as a plain file: it would drop what a link keeps current when the machine's network changes.
- Letting the build time out as before and explaining after: the owner waited the whole limit for a fault the software did not cause, and the builder was sent to fix it.

## Consequences

- New settings `runner.name_check_host` and `runner.extra_tool_paths` ([configuration](../reference/configuration.md)).
- [Runner spec](../specs/runner.md) says what the build step checks first and what a machine fault does.
