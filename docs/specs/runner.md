# Runner specification

Status: specification. Built so far: starting, keeping up, restarting and stopping software, the link or command on the page, ports, confinement, secrets and logs ([0162](../decisions/0162-how-the-runner-is-built.md), [0163](../decisions/0163-running-software-is-confined-with-bubblewrap.md)). Not built yet: repositories on GitHub, merge and push, release notes committed, log errors as intake. Being built ([0130](../decisions/0130-the-build-starts-and-covers-all-of-premise.md)). Related: [build, check and run](../architecture/build-check-run.md), [record keeper](record-keeper.md), [gate](gate.md), [intake](intake.md), [reporter](reporter.md), [storage](storage.md).

## 1. Purpose

The runner starts the built software from a clean copy and keeps it up while premise runs. The line ends at running software people can open, not at merged code ([0017](../decisions/0017-the-line-ends-at-running-software.md)).

This specification also covers the server's acts on GitHub that lead to running software: creating each software's repository, and merging and pushing a change after its check passes ([0093](../decisions/0093-server-merges-no-pull-requests.md)). Only the server creates repositories, pushes and reads issues ([0077](../decisions/0077-github-through-existing-cli-login.md)).

## 2. Responsibilities and non-responsibilities

Responsible for:

- creating each software's repository on the owner's GitHub ([0051](../decisions/0051-each-software-in-its-own-repository.md));
- merging a passed branch into the default branch and pushing, after the trailer check ([record keeper](record-keeper.md));
- starting the checked commit from a clean copy using `run.md`, confined like an agent;
- showing on the page how to open it: a link, a command, or a program;
- restarting a crashed software a few times, then reporting;
- keeping the software's logs, and sending errors in them to intake;
- writing release notes into the repository from the reporter's drafts;
- naming what a software needs that an LLM cannot provide, and running what it can meanwhile.

Not responsible for:

- checking the software ([line engine](line-engine.md), checker);
- keeping software live for its real users (milestone 7);
- deciding a repository's visibility ([0059](../decisions/0059-repository-visibility-per-software.md)).

## 3. Interfaces

| Operation | Caller | Inputs | Outputs | Errors |
|---|---|---|---|---|
| Create repository | Line engine (start software) | Software name; visibility chosen by the operator, default private | Repository; `premise/` folder committed with the first trailer | `NAME_TAKEN`; a public repository needs the gate (`make-public`) |
| Merge and push | Line engine (check passed) | Software, branch, commit checked | New default-branch commit, pushed | `TRAILER_MISSING`, `MERGE_CONFLICT`, `PUSH_REJECTED` |
| Start | Line engine (after merge), page server (a person restarts) | Software, commit | A run: link, command and sample output, or program and how to start it | `RUN_FAILED` with the log |
| Stop | Page server, line engine | Software | Run stopped | none |
| Release notes | Reporter | Software, commit, drafted notes | Notes committed to `RELEASE-NOTES.md` with the trailer | `TRAILER_MISSING` |

## 4. Data owned

`runs` ([storage](storage.md)); the running software's logs under `logs/<software>/`; its clean run copy under `work/`.

## 5. Behaviour

### 5.1 Repositories

- Each software premise builds gets its own repository on the owner's GitHub account ([0051](../decisions/0051-each-software-in-its-own-repository.md)).
- Visibility is chosen per software, or is whatever it is on GitHub; premise enforces nothing ([0059](../decisions/0059-repository-visibility-per-software.md)). A new repository is created private unless the operator chose public; making a repository public is acting publicly in the owner's name and goes through the gate ([0100](../decisions/0100-floor-actions.md)). A visibility changed on GitHub by a person is left as it is.
- Because visibility is not premise's to enforce, the repository must be safe to make public: nothing about real people goes into it ([0081](../decisions/0081-nothing-about-people-in-the-repository.md)).

### 5.2 Merge and push

- After a pass, the server merges the branch into the default branch and pushes. There are no GitHub pull requests ([0093](../decisions/0093-server-merges-no-pull-requests.md)): people follow the work on premise's page, and nobody has to use GitHub alongside premise ([0063](../decisions/0063-premise-may-depend-on-other-tools.md)).
- Before pushing, the record keeper checks every commit's trailer. A failing commit stops the push and returns the job to the builder.
- If the default branch moved since the branch was made and the merge conflicts, the change goes back to the builder as a new task, and the merged result is checked again.
- A push is never forced; force-pushing is on the floor ([0100](../decisions/0100-floor-actions.md)).

### 5.3 Starting the software

`run.md` holds one fenced block marked `premise-run` that the runner reads ([0162](../decisions/0162-how-the-runner-is-built.md)): `kind: web` with `start:` (and `open:`), `kind: command` with `command:` (and `sample:`), or `kind: program` with `program:`.

The runner starts the checked commit from a clean copy using `run.md`, confined like an agent ([0087](../decisions/0087-agents-run-confined.md)):

| Kind of software | How it runs | What the page shows |
|---|---|---|
| Web apps and servers | On a local port | A link to open it |
| Command-line tools and libraries | The command, run once on a sample | The command and the sample run's output |
| Desktop apps | Built | The built program and how to start it on the owner's machine |

- `run.md` is the same file the checker runs from a clean copy every time, so it cannot go stale without the check failing.
- The software listens on localhost unless the operator decided otherwise; exposing it beyond localhost is a gated act ([0092](../decisions/0092-security-defaults.md)).
- Secrets: the runner places the software's secrets file from premise's data folder into the run copy, ignored by git. A person writes that file; premise never holds the values in its database, and agents never see it ([0120](../decisions/0120-secrets-stay-out-of-premise.md)).

### 5.4 Keeping it up

- It restarts a crashed software a few times, then reports.
- It keeps the software's logs. Errors in them become intake items, from the source "premise itself" ([intake](intake.md)).
- It runs only while premise runs. Keeping software live for its real users is milestone 7.

### 5.5 Release notes

- Release notes for each change that reaches running are drafted by the reporter from the record items it served whose check verdict was met ([0123](../decisions/0123-reporter-drafts-release-notes.md), [reporter](reporter.md)).
- The server commits them to `RELEASE-NOTES.md` in the software's repository, with a trailer naming the served items. Publishing them anywhere public, such as a GitHub release, is a gated act ([0100](../decisions/0100-floor-actions.md)).

### 5.6 What an LLM cannot provide

- When a software needs what an LLM cannot provide (an account with an outside service, a licensed system to run against, a payment), premise names the role and exactly what is needed, and runs what it can meanwhile ([0007](../decisions/0007-llm-does-not-decide-what-it-cannot.md)). The need goes on the "needed" list as an ask of kind `needed`.
- premise does not act in the real world: open accounts, pay, sign ([0033](../decisions/0033-answers-to-the-ten-assumptions.md)).

## 6. Configuration

The settings are listed in the [configuration reference](../reference/configuration.md) (`runner.*`). The two below are the specification's; the reference also holds `runner.port_range`, the start and sample time limits, the restart delay, the stop grace, the output kept for the page, `runner.confinement` and `runner.read_only_paths`.

| Key | Default | Meaning |
|---|---|---|
| `runner.restart_limit` | 3 | Restarts within the window before the runner stops trying and reports |
| `runner.restart_window_minutes` | 10 | The window for the restart limit |
| `runner.port_range` | 4700–4799 | Local ports for running softwares |
| `runner.default_visibility` | private | Visibility of a new repository when the operator chose none |

## 7. Limits

- Built software runs on the same machine as premise ([where it runs](../architecture/where-it-runs.md)).
- A desktop app that cannot run on the owner's machine is shown as built, not run; its check items that need it running are `could-not-check`.
- Before milestone 7, one software runs at a time.

## 8. Failure modes and recovery

| Failure | Detection | Effect | Recovery |
|---|---|---|---|
| `run.md` does not start the software | Start fails | No run | Back to the builder as a task, with the log (the checker should have caught it first) |
| The software keeps crashing | Restart limit | Stopped | Reported; the errors are intake items |
| Another program takes the chosen port | Software says the port is in use | Not counted as a crash | The next free port is tried; if the range runs out the run fails and names `runner.port_range` |
| Merge conflict | Merge fails | Change not merged | Back to the builder; checked again |
| Push rejected | GitHub error | Not pushed | Reported under "Needed" for the operator with the error; never forced |
| Missing secret | Start fails on a named key | No run | A `needed` ask names the role, the file and the key |

## 9. Security considerations

- The run is confined like an agent: it cannot read premise's data folder beyond its own run copy, and cannot reach other softwares' copies ([0087](../decisions/0087-agents-run-confined.md)).
- Localhost by default; anything beyond is gated.
- Only the server holds the GitHub login, through the GitHub CLI ([0077](../decisions/0077-github-through-existing-cli-login.md)).

## 10. Observability

- Every run is a `runs` row and events: started, crashed, restarted, stopped, with the commit.
- The report view's "Running" section shows what runs, which commit, and where to open it ([reporter](reporter.md)).

## 11. Milestones

- Milestone 1 step 1: the server creates a private repository on the owner's GitHub and pushes to it (point 7).
- Milestone 1 step 2: the server's merge and push; the runner, with a link or a command on the page.
- Milestone 4: log errors as intake.
- Milestone 7: running software for its real users on hosts the operator approves; keeping it up; incidents back as intake; several softwares at once. Every first deployment to a public host is public-facing and may spend money, so it is asked ([gate](gate.md)).
