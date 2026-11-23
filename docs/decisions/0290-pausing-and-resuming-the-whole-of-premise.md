# 0290. Pausing and resuming the whole of premise, stopping cleanly, and coming back

- Status: Accepted
- Scope: Making premise
- Date: 2026-11-23
- Decided by: The assistant for the owner, from the owner's question: "How can I pause or resume entire premise? So I can pause it, close the server, then come back later open and resume. This is on laptop right now, not a running server." Every point below is chosen for the owner and open to the owner's correction; a correction is a new record that supersedes this one.
- Source: The owner's question above; [0074](0074-two-agent-sessions-at-once.md), [0078](0078-session-token-and-header-checks.md), [0132](0132-sensible-things-are-configurable.md), [0135](0135-the-experience-works-without-the-guide.md), [0197](0197-how-several-softwares-at-once-is-built.md), [0200](0200-how-cost-and-the-spending-limit-are-built.md); [work queue](../specs/work-queue.md), [page server](../specs/page-server.md).

## Context

- Before this, stopping premise was Ctrl+C: a running agent session was cut off, its job was restarted from its brief in a fresh session next time (wasting that session's work, and counting as an attempt), and nothing on the page said so. Pausing existed per software, and for the subscription's usage limit; there was no pause for everything, and no way to leave the page and come back to a paused premise.
- Each restart gave a new link, and nothing said how to get it.
- A built software that premise was running was stopped with premise, silently.
- A laptop that sleeps can leave agent sessions that look busy and are dead.

## Decision

1. **"Pause everything" and "Resume" are always in the top bar,** in plain words. Pausing starts nothing new in any software (agent jobs and the server's own, such as starting a software). It asks one thing: **let what is running finish** (the default) or **stop it now**. Stopping now stops the running sessions and puts their jobs back in the queue; the page says their unfinished work is redone later, and a stopped session that the runtime can carry on is carried on. Pausing again with "stop it now" stops what was left to finish. While a "let it finish" pause has jobs still finishing, the banner offers both "Stop it now" (saying that the running sessions are cut off and their work redone later) and Resume; once nothing is running it offers Resume only.
2. **While paused, a banner says what is paused, what is still finishing, and whether it is safe to close premise** (safe when nothing is running). Questions can still be answered; the answer is stored and nothing starts until Resume.
3. **Who paused is kept.** The pause has a cause: the person, the `queue.start_paused` setting, or the subscription's usage limit. Only the usage limit's pause ends by itself. A usage limit that arrives during the person's pause leaves it theirs. Resume works on any of them; resuming over the usage limit may pause again at once, and the banner says so.
4. **The pause is stored, so it survives a restart.** If everything was paused when premise stopped, premise starts paused and says so, in its terminal and in one line on the page, with Resume one click away. If not, it resumes as before. `queue.start_paused` (default false) makes it always start paused.
5. **Ctrl+C once is a clean stop:** nothing new starts, running work is left to finish, and premise stops when it has. It says what it is waiting for and that Ctrl+C again stops now; it says again if what it waits for changes. The pause for a clean stop is not stored: it is not the person's pause. **Ctrl+C twice, a termination signal, or the terminal closing stops now**, which is always safe: sessions are stopped and their jobs go back to the queue. The page says "premise is stopping" while it waits.
6. **`premise stop` (and `npm run stop`) does from another terminal what one Ctrl+C does, but never escalates:** it signals with `SIGUSR2` (a clean-stop request), so running it again while premise is stopping changes nothing; premise says "premise is already stopping: waiting for N sessions to finish. To stop now, run premise stop --now". Only `--now` (`SIGTERM`) or a second Ctrl+C in premise's own terminal stops at once. It finds the premise from the file (`premise.running` in the data folder), after checking that the address in the file answers as premise. A file left by a premise that is gone is ignored and removed, so it neither blocks a start nor signals an unrelated program. Starting a second premise on the same data folder is refused with a message. On Windows a signal ends a process at once, so `premise stop` there always stops now (said in its help).
7. **The start says in one line what it picked up:** the jobs that were cut off and put back, what is waiting on the person, whether everything is paused, and which built softwares stopped with premise; it says nothing on a first start. The page shows it as a notice that can be dismissed and offers "Start (software) again" for each software that stopped with premise.
8. **A built software that premise was running is stopped with premise.** The stop says so, names it, and the next start offers to start it again. Which were up is written at a clean stop, and read from runs left marked as up after a crash.
9. **Laptop sleep.** Every few seconds premise looks at the clock; when it has jumped by more than `queue.suspend_gap_seconds` (default 90) beyond that, the computer was suspended. If agent sessions were running, premise asks each whether it is still alive (the runtime says: for Claude Code, whether the child process is still there), ends the ones that are not, puts their jobs back and starts them again where the runtime can carry on, and says so in the terminal and in one line on the page. A session that cannot say is taken as alive. Nothing is said when no session was running.
10. **The link.** The default stays safe: a new link at each start, the older ones stop working. The stop and the start both say how to get the link (the start prints it; `npm run new-link` prints a new one any time). `server.keep_link` (default false) keeps the same link across restarts for a person working alone on their own machine. The risk is in the setting's own text: the link is a password to premise on that computer; keeping it means storing it in the data folder (in `kept-link`, readable only by its owner) and it stays valid until replaced, so a copy left in a browser history, a bookmark or a shared screen still works. Turning the setting off deletes the kept token at the next start; `new-link` replaces it.
11. **The attempt count is not undone.** A job cut off or stopped for a pause is not a failure (the same-failure rule does not count it), but the attempt number keeps counting sessions started, because each session's folder and transcript are named by it.
12. **README and the page's help** each have a short "Stopping and coming back".

## Reason

- Chosen for the owner: the owner wants to pause, close the laptop, and come back. "Let it finish" is the default because it loses nothing and costs only the wait, and the banner says when it is safe to close; "stop it now" is one click for when there is no time to wait, because stopping is always safe (a stop never loses work; it only redoes it).
- Chosen for the owner: Ctrl+C is the one thing everyone presses. A single press that waits and says so, and a second that does not, never leaves the owner with a hung terminal or a silent kill ([0135](0135-the-experience-works-without-the-guide.md): the terminal says what to do next).
- Chosen for the owner: the clean stop's wait is not stored as a pause, because the owner did not pause; coming back to premise paused after a plain Ctrl+C would be a surprise. A pause the owner chose is stored, because it was chosen.
- Chosen for the owner: a new link each start stays the default for safety ([0078](0078-session-token-and-header-checks.md)); keeping the link is the owner's to choose, with the risk stated where it is chosen.
- Builders' note: checking that the file's address answers as premise before signalling guards against a process number reused after a crash; the check costs one local request.
- Builders' note: signals, not a control file or a request over the page's own interface, because the page's token is stored only as a hash, so a second terminal could only use the page's interface by revoking the person's open link.

## Alternatives considered

| Alternative | Why rejected |
| --- | --- |
| A pause that persists for a clean Ctrl+C too | The person did not pause; premise would come back paused for no reason they gave |
| "Stop it now" as the default | It wastes the sessions' work when waiting would have cost nothing |
| Pause only the agent sessions, and still start the server's jobs | "Pause everything" would not be true; starting a software is work too |
| `premise stop` through the page's interface | Needs the session token, which is stored only as a hash |
| A control file polled by premise instead of signals | Works on Windows too, but polls forever for a rare event; signals are the plain way on the laptop systems this runs on. Raised as an issue |
| Restart every session after a sleep | Wastes the ones that are fine |

## Consequences

- The queue's stored state gains a cause, the choice for running sessions, and when it was paused; a state stored before this reads as the person's when it has no resume time, and as the usage limit's when it has one.
- New settings: `queue.start_paused`, `queue.suspend_gap_seconds`, `server.keep_link` ([configuration reference](../reference/configuration.md)).
- New API: `GET/POST /api/pause`, `POST /api/resume`; the overview carries the pause, the start's line and the sleep's line.
- An agent session may say whether it is alive (`alive()`); the scripted agent can die silently for tests.
- Carried in [work queue](../specs/work-queue.md) 5.2 and 5.7, [page server](../specs/page-server.md), [page](../specs/page.md), the README and the page's help.

## Related

[0074](0074-two-agent-sessions-at-once.md), [0078](0078-session-token-and-header-checks.md), [0132](0132-sensible-things-are-configurable.md), [0135](0135-the-experience-works-without-the-guide.md), [0197](0197-how-several-softwares-at-once-is-built.md), [0200](0200-how-cost-and-the-spending-limit-are-built.md), [0280](0280-the-run-step-builds-first-and-the-headline-tells-the-truth.md).
