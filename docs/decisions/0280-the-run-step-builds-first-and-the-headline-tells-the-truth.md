# 0280. The Run step builds first, and the report's headline tells the truth

- Status: Accepted
- Partly supersedes: [0220](0220-approvals-and-verdicts-tell-the-truth.md) point 9 (when the report's first line may say "Works")
- Scope: Making premise
- Date: 2026-11-23
- Decided by: The builders. Point 3 (the build steps may use the network) is chosen for the owner by the assistant, open to the owner's correction, because it is a security default ([0092](0092-security-defaults.md)).
- Source: The audit of the first real run of premise (a small command-line software, built by real agents): its sections on the Run step and on honest reporting. [0017](0017-the-line-ends-at-running-software.md), [0097](0097-reports-from-recorded-facts.md), [0162](0162-how-the-runner-is-built.md), [0164](0164-how-the-reporter-is-built.md), [0186](0186-how-build-check-and-run-are-built.md), [0220](0220-approvals-and-verdicts-tell-the-truth.md), [0135](0135-the-experience-works-without-the-guide.md).

## Context

- In the first real run, the software needed a build before it could run (install its dependencies, then compile). `run.md` said so in a "Build" section, and the plan's "how to run" said so too. The runner took a clean copy and ran only the `premise-run` block's sample, never the build, so the sample ended with "not found" at both landings and again later.
- The line went on regardless: Run was done, both milestones were announced as reached, both reports were written, and the page asked the operator to try the software. The failure was said in chat and in the reports' "Failed or not checked", with "say in chat what to do, or send it back to Build", which nobody acted on.
- The builder's instructions said to make `run.md` say how to build and start the software "and that it works", without saying that premise runs only the block. The checker built the software by following all of `run.md`, got it running, and so could not see what the runner would see.
- The second report's first line said "Works: all 9 things you asked for were checked and are met" beside "Not running: the last start failed". The checker's own evidence for the most important item said it was checked only on its own made-up input, because the real data was not available; that caveat appeared nowhere in the reports or in chat ("9 met, 0 not met, 0 could not check").
- The first report counted three items the operator had put in a later milestone as "could not be checked", which reads as a failure, not as "not built yet, by your choice".
- Its "Decided" section printed the whole record, 54 lines, most of them premise's own choices from before.

## Decision

1. **Build lines in the run block.** The `premise-run` block may hold `build:` lines, one command each, for any kind of software. The runner runs them in order in the clean copy, confined the same way as the software, before the web start, the command's sample, or calling a desktop program built. The block is the only thing premise runs from `run.md`.
2. **Their own time limit and output.** All the build lines together have `runner.build_timeout_seconds` (default 600). Their output goes to the run's log and to the page while it builds ("Building it from a clean copy first ..."). A failing or overrunning line ends the start with its last lines of output, and an overrun names the setting.
3. **The build may use the network** (chosen for the owner), to install what the software depends on: `runner.build_network`, default true. Bubblewrap can give a process the whole network or none; it cannot limit it to the package registries the builder's sandbox allows, so this is the network a web software already gets. The software itself runs as before: a command's sample with no network.
4. **A failed start is not "run done".** When the landed commit does not build or start, the Run job notes it and the line holds at Run. It says plainly "Built and checked, but it would not start", with the last lines of output. The first time it goes back to Build by itself, as a fix round whose evidence is that output and exactly what premise ran (`line.start_send_backs`, default 1; 0 asks at once). After that, premise asks the operator: "Send it back to Build", "Try starting it again" (the same version, for a cause outside it), or "Leave it not running" (the line goes on; nothing claims it works). Written words go to the builder with the output. No milestone is announced and nobody is asked to try it until it starts or the operator chose to leave it.
5. **When the line goes on without a running version**, the milestone's report says the milestone is "built and checked, but it is not running", the milestone card says to read the report instead of "try the software", and the software's status line says the same.
6. **The instructions say exactly what premise runs.** The builder's instructions show the build lines and say: in a fresh clone, each `build:` line in order, then the start or sample; nothing installed beforehand; a command's sample has no network; run exactly those yourself from a fresh clone before finishing. The planner names every step before the start as a build step. The checker first does exactly what the runner will do, before changing anything in its copy; a block that does not work that way is a blocking finding even if it got the software running another way. The scripted checker does the same: the build lines, then a command's sample.
7. **The headline never says "Works" when the latest start failed** ("Built and checked, but it would not start, so there is nothing to try yet"), nor for an item met only on made-up data. If a check also failed, it says the software does not work yet and is not running either.
8. **Made-up data is named.** Every verdict says `judged_on`: `real` or `made-up`, and for `made-up` also `try_it_on`; the tool refuses a verdict without it, and nothing reads the evidence's words for this. A verdict recorded before the field existed still counts as met, and the counts say it was not stated whether real data was used. A made-up item is counted apart in the headline ("Partly verified: ... 1 only on made-up data", or "Not verified on real data") and goes under "Failed or not checked" as "Checked on made-up data only: ... Try it on X yourself". The chat's tally of a check says it too ("9 met (1 of them only on made-up data)").
9. **Items chosen for later are "not built yet".** An item planned only for a milestone after the one being built (from the plan's tasks, as the check reads them) reads "Not built yet (you chose later, for milestone M-n)", is left out of the headline's count ("... in this milestone"), and is said after it ("N more are for a later milestone you chose"). An item judged anyway counts like any other.
10. **"Decided" shows what this milestone changed.** The short report shows the milestone line and what changed since the last report in people's own words. premise's own assumptions and choices are one line, and what was decided before is one line saying it is unchanged. "Show more detail" lists both, and the page folds them ("Decided before this report, unchanged").
11. **No new run status.** "Building" is a phase of a starting run, held in memory, because the run statuses are fixed by a check in the database; the page says it in words.

## Reason

- Builders' note: the line ends at running software ([0017](0017-the-line-ends-at-running-software.md)). A start that fails is the line not ending there, so it cannot be "run done". The first real run shows that a builder told to fix it in chat does not get the chance unless premise sends it. One automatic send-back costs one fix round and usually ends the matter. Asking after that spends the operator's attention only when the builder could not fix it ([0027](0027-spend-least-of-peoples-attention.md)).
- Builders' note: build lines in the block, rather than reading the free-text "Build" section of `run.md` or the plan's "how to run", keep one machine-read place that the builder writes, the checker runs and the runner runs, so they cannot drift apart.
- Chosen for the owner: most software cannot be built without installing what it depends on, and without the network the build would fail exactly as the first real run's start did. Limiting it to the registries needs a filtering proxy premise does not have yet; the setting turns it off for anyone who prefers a failed build to a networked one.
- Builders' note: a report is built from recorded facts only ([0097](0097-reports-from-recorded-facts.md)). A verdict whose own evidence says the real data was missing is a recorded fact the headline must not contradict. Reading the evidence's words as well as the new field covers checkers that do not use the field.

## Alternatives considered

| Alternative | Why rejected |
| --- | --- |
| Run the whole of `run.md`'s "Build" section, or the plan's "how to run" | Free text; premise would have to guess which lines are commands, and the plan is not in the software's repository. |
| Run the build without any network | Most builds install what the software depends on; they would fail for that reason alone. |
| Keep "run done" on a failed start and only word the report better | The line would still announce a milestone, ask the person to try nothing, and leave the fix to nobody. |
| Ask the operator at the first failed start | Most failed starts are the builder's to fix from the output; asking first spends attention on what an agent can do ([0006](0006-llm-does-what-it-can.md)). |
| Send it back every time, with no limit | A builder that cannot fix it would loop, spending effort, with nobody told. |
| A new run status "building" | Needs a database change for a state only shown while it lasts. |
| Read the evidence's words for made-up data | Guessing from prose mislabels real verdicts that mention something unavailable; a required field cannot be left unsaid. |

## Consequences

- New settings `runner.build_timeout_seconds`, `runner.build_network` and `line.start_send_backs` ([configuration](../reference/configuration.md)).
- `verdict_submit` takes `not_available` per verdict ([agent tools](../specs/agent-tools.md)); a verdict event may carry `notAvailable`.
- The report line gains `earlier` (decided before this report), which the page folds ([reporter](../specs/reporter.md)).
- Carried in the [runner](../specs/runner.md), the [line engine](../specs/line-engine.md), [build, check and run](../architecture/build-check-run.md), and the [builder](../prompts/builder.md), [checker](../prompts/checker.md) and [planner](../prompts/planner.md) prompts.
- Kept tests: a tool whose sample needs a build step; a build that fails; a start that fails once and is fixed by the automatic send-back; each case of the headline.

## Related

[0017](0017-the-line-ends-at-running-software.md), [0092](0092-security-defaults.md), [0097](0097-reports-from-recorded-facts.md), [0162](0162-how-the-runner-is-built.md), [0163](0163-running-software-is-confined-with-bubblewrap.md), [0164](0164-how-the-reporter-is-built.md), [0186](0186-how-build-check-and-run-are-built.md), [0220](0220-approvals-and-verdicts-tell-the-truth.md).
