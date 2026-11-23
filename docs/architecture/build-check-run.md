# Build, independent check and run

Carved from section 5 of the plan (the confinement and security-default choices are told in full in [the floor and the gate](the-floor-and-the-gate.md)). Part of the [architecture](overview.md). Specs: [agent runner](../specs/agent-runner.md), [runner](../specs/runner.md), [record keeper](../specs/record-keeper.md). Prompts: [builder](../prompts/builder.md), [checker](../prompts/checker.md).

## Build

- [0086](../decisions/0086-working-copy-and-branch-per-change.md) (P20): the builder works in its own working copy of the software's repository, on a branch per change.
  - Why: a change can be checked, and thrown away, without touching what runs.
  - Rejected: building on the default branch directly.
- [0087](../decisions/0087-agents-run-confined.md) (P21): every agent runs confined: Claude Code's sandbox for shell commands, plus permission rules for its file tools. Writes only in its working copy and a temporary folder; reads denied for premise's data folder, the checker's scenarios, and credential files; network only to the package registries the plan names. Full text in [the floor and the gate](the-floor-and-the-gate.md#confinement).
- The builder holds no credentials. It commits; the server pushes ([0077](../decisions/0077-github-through-existing-cli-login.md)).
- For each task the builder:
  - makes the change;
  - writes or updates its own tests and runs them;
  - updates what users read where the task touches it (help text, guides);
  - commits with the trace trailer ([0083](../decisions/0083-trace-trailer-on-every-commit.md)).
- The builder never writes the record. It proposes changes, such as a new `D` item, through its tool; the record keeper checks them.
- If a task needs a decision only a person can make, the builder asks through its tool. That task waits; other tasks go on.
- [0088](../decisions/0088-turn-and-time-limits.md) (P22): each session has a turn limit and a time limit. The same failure three times stops the task, and the task is reported.
  - Why: a stuck agent otherwise loops through the subscription's limits.
  - Rejected: letting a session run until it says it is done.

## Check ([0030](../decisions/0030-independent-check.md))

- [0089](../decisions/0089-checker-in-a-fresh-session.md) (P23): the checker is a fresh session with its own working copy of the commit under check. It never sees the builder's transcript, summary or claims.
  - Why: it judges the running result against the intent, not the builder's account ([0030](../decisions/0030-independent-check.md)).
  - Rejected: a review of the builder's diff and report.
- [0090](../decisions/0090-scenarios-out-of-the-builders-reach.md) (P24): the checker writes its scenarios from the record into premise's data folder, where builders cannot read them.
  - Why: agents game the checks they can touch ([0030](../decisions/0030-independent-check.md)).
  - Rejected: scenarios kept in the software's repository.
- It builds and starts the software from `run.md` in its own copy, and uses it as a user would:
  - a browser driven by Playwright for web pages;
  - HTTP calls for servers;
  - commands for command-line tools;
  - the built program for desktop apps, where it can run on the machine.
- Its verdict per item: met, not met, or could not check, each with evidence (a screenshot, output, a log).
- It also checks that `run.md` works from a clean copy, that the security defaults hold ([0092](../decisions/0092-security-defaults.md)), and that what users read matches what the software does.
- Outcomes:
  - every must item met and no floor finding: the change passes (only then is it "passed");
  - no failure, but some must items could not be checked: it lands marked not fully verified, or, when none could be checked, premise asks once before landing it unverified ([0220](../decisions/0220-approvals-and-verdicts-tell-the-truth.md));
  - a must item not met, or a floor finding: back to the builder as a new task, with the evidence;
  - should or could items not met, and small defects: accepted and reported when fixing costs more than it is worth ([0006](../decisions/0006-llm-does-what-it-can.md)); the operator can reopen them;
  - the same item failing three rounds: work on it stops, and the report names which role is needed and for what.
- [0091](../decisions/0091-checker-same-provider-strongest-tier.md) (P25): the checker uses the same provider, in a fresh session, with different instructions, at the strongest model tier.
  - Why: Claude through the owner's subscription is the only provider for now ([0046](../decisions/0046-claude-through-the-owners-subscription.md)).
  - Rejected: a second provider (another subscription or an API key, which spends money).
  - A checker that shares the builder's model is a known limit of every checker the prior art found. Reports say so.
- [0092](../decisions/0092-security-defaults.md) (P26): security defaults for every software, applied in the plan and checked by the checker. Full list in [the floor and the gate](the-floor-and-the-gate.md#security-defaults-for-every-software).

## Run

- [0093](../decisions/0093-server-merges-no-pull-requests.md) (P27): after a pass, the server merges the branch into the default branch and pushes. No GitHub pull requests.
  - Why: the line ends at running software ([0017](../decisions/0017-the-line-ends-at-running-software.md)), and people follow the work on premise's page; nobody has to use GitHub alongside premise ([0063](../decisions/0063-premise-may-depend-on-other-tools.md)).
  - Rejected: a GitHub pull request per change (a second place to look and approve).
- The runner starts the checked commit from a clean copy using `run.md`, confined like an agent ([0087](../decisions/0087-agents-run-confined.md)):
  - web apps and servers: on a local port, opened from a link on the page;
  - command-line tools and libraries: the page shows the command and a sample run's output;
  - desktop apps: the page shows the built program and how to start it on the owner's machine.
- It restarts a crashed software a few times, then reports. It keeps the software's logs; errors in them become intake.
- Release notes for each change that reaches running are drafted from the record items it served.
- When a software needs what an LLM cannot provide (an account with an outside service, a licensed system to run against, a payment), premise names the role and exactly what is needed, and runs what it can meanwhile.
- Keeping software live for its real users is milestone 7 ([roadmap](../product/roadmap.md)).

## As built

[0186](../decisions/0186-how-build-check-and-run-are-built.md), in `src/build`, one milestone at a time:

- Build opens with a checker job that writes the scenarios from the record into `scenarios/` in premise's data folder. Then each task of the milestone is one builder job, on its own branch, starting from the commit the task before it made. premise checks what each job left (a commit whose trace trailer names record items) and takes the branch into the software's repository; the same problem three times stops the task and premise asks the operator. A task whose builder asked a person waits; the next task goes on.
- Check is one fresh checker job on its own clone of the exact commit, with the scenarios in its brief and nothing of the builder's. It judges the items the milestone serves and the must items of milestones already landed. A must item not met, or a blocking finding, starts a fix round: one builder task with the checker's evidence, naming the items that were not met in its title, its items and its trace line, also when the operator gives more rounds. At `line.check_rounds_before_stop` rounds premise stops and asks the operator: more rounds, or land it as it is. A round the checker could not run for a reason outside the software (a program the agents lack, asked for and still open) does not count: the check waits on that ask and checks the same commit again once it is answered. The checker may start its own virtual screen inside its sandbox to see a game or desktop program; when nobody saw it on screen, the report says so ([0310](../decisions/0310-answers-are-never-lost-and-the-work-is-visible.md)).
- A change from intake goes the same way with its own tasks only, never the software's whole plan; its check judges the items it touches plus every must already met, and its report says what changed, what was checked again and what was not ([0273](../decisions/0273-a-change-is-planned-and-built-as-a-change.md)).
- A checker that ends without any verdict is asked once more, with the exact shape of the answer, before its items count as not checked ([0277](../decisions/0277-an-agent-without-its-answer-is-asked-once-more.md)).
- Run is the server's: it merges the checked branch, lands the record changes builders proposed, pushes to the second copy when there is one, and the runner starts the merged commit: first `run.md`'s build lines, then its start or sample. The reporter then writes the milestone's report.
- A start that fails (a build line or the start itself) is not "run done": the line holds at Run, says "built and checked, but it would not start" with the last lines of output, goes back to Build by itself once with that output as the evidence, and only then asks the operator: send it back, try starting again, or leave it not running. No milestone is announced and nobody is asked to try it before then [0280](../decisions/0280-the-run-step-builds-first-and-the-headline-tells-the-truth.md).
- Per software, the planner says what kind of software it is and how to build, start and check it; the builder writes that into `premise/run.md`, with every step before the start on its own `build:` line; the checker first runs that block exactly as the runner will, and a block that does not work that way is a blocking finding.
