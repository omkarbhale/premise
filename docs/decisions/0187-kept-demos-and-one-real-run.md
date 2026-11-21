# 0187. The kept demos, and one real run with real agents

- Status: Accepted
- Scope: Making premise
- Date: 2026-11-21
- Decided by: The builders, within the owner's rule on the Claude login ([0134](0134-the-owners-claude-login-only-when-strictly-necessary.md)).
- Source: [0108](0108-scripted-operator-for-demos.md), [0109](0109-vitest-and-kept-demos.md), [0110](0110-two-sample-softwares.md), [0134](0134-the-owners-claude-login-only-when-strictly-necessary.md), [0141](0141-github-repositories-in-tests-and-behind-the-gate.md).

## Context

- Milestone 1 shows two small softwares of different kinds taken from an idea to running software, each with one struck assumption and one defect the check catches ([0110](0110-two-sample-softwares.md)). The demos are kept and run again ([0109](0109-vitest-and-kept-demos.md)).
- The real path, with real agents, has to be proved once, using the owner's login only as much as strictly necessary.

## Decision

1. **Two kept demos**, a command-line utility (counting a file's lines, words and characters) and a small web app (a reading list), in `src/demo`. Each runs the real line engine, record keeper, build and check orchestration, runner and reporter with the scripted agent and a scripted operator, no AI. Each strikes one assumption at the say-back (the record strikes it too), and each builder plants a defect the checker was not told about: the check catches it by using the software, the fix round mends it, and the change lands and runs.
2. **They run in the test suite** (`test/demos.test.ts`) and by hand: `premise demo cli`, `premise demo web`, each in a fresh data folder of its own.
3. **One real run, on purpose only:** `premise real-run --confirm` takes a tiny command-line tool (the lines of a file in reverse order) through the whole line with real Claude Code agents, every type of task on model haiku at low effort, one session at a time, a scripted operator answering, a second copy on this machine instead of GitHub, and the sandbox on. Without `--confirm` it only says what it would do. It writes its evidence (stages reached, verdicts, commits, sessions, time, what failed) to the data folder.
4. **The real run is not part of the tests or of continuous integration.** It proves the procedure, not the agents' intelligence; a builder of premise runs it once per change to the real path, and stops after two attempts.

## Reason

- 1, 2: [0108](0108-scripted-operator-for-demos.md)–[0110](0110-two-sample-softwares.md).
- 3, 4: [0134](0134-the-owners-claude-login-only-when-strictly-necessary.md): the login only when strictly necessary, on Haiku at low effort, very sparingly.

## Alternatives considered

| Alternative | Why rejected |
| --- | --- |
| Demos that only replay recorded events | They would not show the line catching a defect in software that really runs. |
| A real run in continuous integration | Spends the owner's subscription on every change. |

## Consequences

- The [roadmap](../product/roadmap.md) and the [README](../../README.md) say how to run them.

## Related

[0186](0186-how-build-check-and-run-are-built.md).
