# 0310. Answers are never lost, and the person can see what is being worked on

- Status: Accepted; points 2, 6 and 7 are chosen for the owner, open to the owner's correction
- Scope: The product
- Date: 2026-11-24
- Decided by: The builders. The points marked chosen for the owner are the assistant's, open to the owner's correction. The owner's words are quoted where the owner gave them.
- Source: The owner's second real software, a game, built with real agents, and the owner's own words after it. [0196](0196-roles-and-taste-in-one-session.md), [0270](0270-premises-own-figures-and-asks-that-cost-attention-honestly.md), [0277](0277-an-agent-without-its-answer-is-asked-once-more.md), [0300](0300-judgement-fixes-from-the-first-real-runs.md).

## Context

The owner, after the run: "I answered two open questions for flickline: first I sent back for more rounds, second I gave my feedback on gameplay because it asked me to. And a builder is working but I don't know what on, and I also don't know if both my answers will be worked on. I mean that's kind of a UX flaw in premise, we should atleast note that, and u can tell me what it is doing."

The run's records showed five faults:

- An answer was lost. The checker asked the person a question through its tool, then its job finished. Later the person answered with substantial gameplay feedback (no crosshair, no sounds, no bullet tracers, no HUD, no way back to the main menu, overall no polish). premise replied "Noted. The agent's next step gets your answer.", but the job had already ended. The answer reached no agent and no brief: it went to a list only early-stage drafts read.
- The person could not see what was being worked on. The page showed "Building" with no task, no items and no word on which answers the work carried.
- A fix round was labelled with the wrong item. It carried the checker's evidence for one item (the arsenal's headshot reward), but its task and its commit's trace line named another (mouse sensitivity). When the person gives more rounds, the fix round was made with no items, and then took the items of the tasks before it.
- Rounds were burned on the environment. Two of three check rounds failed only because the game engine could not be obtained, and they counted toward the stop after three failed rounds.
- The checker could not take screenshots. Its sandbox forbids local (unix) sockets, so a virtual screen could not be reached, and nobody saw the game on screen.

## Decision

1. **An answer goes where a job will read it, or it becomes work.** When the person answers an agent's question, premise places the answer and says where in one line. Each answered card also says what happens with the answer and when ("What happens with it: ..."). Every answer goes one of these ways:
   - **A task waiting on it:** the task starts again with the answer in its brief.
   - **A builder still working:** a session cannot read an answer part way through, so the answer is held. When that attempt ends, the task is built again with the answer. If the task stopped instead, the answer is taken in as intake.
   - **A check waiting on a missing program:** the check runs again (point 4).
   - **An early stage that stopped to wait on the answer:** its job runs again, with the question and the answer in its brief.
   - **No job will read it:** the job ended, or it is a checker still working, which no later step of the same job follows. The answer is taken in as intake for that software, triaged and routed like any item, so feedback on the software becomes work. premise says so truthfully: "The checker had already finished, so your answer is taken in as I-4. ..."

   premise never says the agent gets an answer unless a live or queued job really will. (Builders' choice.)
2. **No orphan asks** (chosen for the owner). When a job ends with a question of its own still open, either something keeps waiting on it, or the ask stays open with a plain note. Things that keep waiting are the task, the stage, or the check. The note reads: "The checker asked this and has since finished, so no agent waits on your answer. If you answer, premise takes it in as new work for <software>, like anything you send in the chat; you can also leave it." Such an ask no longer counts as something premise waits on. A missing-program card says that what the person chooses applies to the agents' next sessions.
3. **What is being worked on is shown.** The software's page has a "What is being worked on" card, and every Activity row shows the same:
   - For each job that has not ended: what it is doing, in plain words ("Fixing what the check found: shields are missing, so one-headshot kills don't match", "Building task 2: Count words").
   - The record items it serves, with their words.
   - The person's answers it carries.
   - The person's recent answers (the last six), each with where it went: given to a job, held for a job still working, or taken in as an intake item.

   (Builders' choice.)
4. **A fix round names the items that were not met** in its title ("Fix what the check found: W-3 not met"), its task items and so its trace line. This also holds when the person gives more rounds: the items the last check found not met. When only a finding failed, the round names no items, and the builder names what its commit serves. A round that rebuilds for another reason says so in its title ("Make it start from a clean copy", "Build it again"). (Builders' choice.)
5. **A check that could not run the software for a reason outside it does not count as a failed round.** When a check ends with a must not met, a blocking finding, or a must it could not check, and a program the agents lack is asked for and still open, the round is not counted. The check is marked "waiting for a tool", and the chat says why. The same commit is checked again once the person answers that card. The checker is told that a missing program, a blocked download or a sandbox limit is "could not check", never "not met", and to ask for what is missing. (Builders' choice.)
6. **No session may open local sockets, so no virtual screen is promised** (chosen for the owner: never allow all local sockets). Claude Code's sandbox can allow a single socket path only on macOS; on Linux the one switch, `allowAllUnixSockets`, allows every local socket, including a tmux server, an ssh-agent or a gpg-agent, which a denylist cannot cover. premise never sets it, for any role, and there is no setting for it. The checker is told to try a screen only if one works in its sandbox, and to say `seen_on_screen: false` otherwise.
7. **"Nobody has seen it on screen"** (chosen for the owner). `verdict_submit` takes `seen_on_screen`. For a game or desktop program, if the latest check did not say it saw it on a screen, the report's Running section says: "Nobody has seen it on screen: the check could not show it on a screen here, so how it looks and plays is unchecked. Start it yourself and look."

## Reason

- The owner, verbatim, above: an answer to "tell me what is missing" is the most valuable input a person gives, and premise lost it while saying it would be used. Taking it in as intake is the route premise already has for anything the person says about built software ([0062](0062-intake-goes-in-normally.md)). It is triaged and routed, and it can never be lost.
- Builders' note: an agent session reads its brief once. "The agent's next step" was only true for a builder whose task waited on the answer. Holding the answer and building the task again makes the other case true, at the cost of one more build session.
- Chosen for the owner: withdrawing a finished agent's question would also have thrown the owner's feedback away, since he answered after the checker had ended. Keeping it open, holding nothing up, and saying plainly where an answer goes keeps the question and wastes no attention ([0270](0270-premises-own-figures-and-asks-that-cost-attention-honestly.md)).
- Builders' note: "a builder is working but I don't know what on". What a job serves and carries is already in its brief. Saying it on the page costs nothing.
- Builders' note: a fix round's trace line is how a commit is tied to the record. Naming another item made the record say the wrong thing about what was fixed.
- Builders' note: the stop after three failed rounds exists because a builder could not fix the software from the evidence. A missing program is not the software's fault, and the builder cannot fix it either.
- Chosen for the owner: opening every local socket lets a checker with a shell reach any host socket outside a short denylist (a tmux server is full command execution outside the sandbox). Claude Code on Linux cannot allow one path, so the screen is given up rather than the sandbox loosened; the report says plainly that nobody has seen the program on screen.

## Alternatives considered

| Alternative | Why rejected |
| --- | --- |
| Withdraw every question of a job that ended | The owner's gameplay feedback came after the checker had ended; it would have been refused. |
| Keep the job waiting on every question it asked | A checker's "how does it feel?" holds up nothing it judges; landing would wait on a person for no reason. |
| Give the answer to "the next brief" of the software | No brief of the later stages read it; that was the bug. |
| Start a new checker just to read the answer | The checker judges, it does not change anything; the answer is about the software, which intake routes. |
| Let the builder poll for answers mid-session | A new tool and a new habit for every agent; building the task again after it ends gives the same result with what exists. |
| Count an environment failure as half a round | Still burns rounds on what no builder can fix; the person's answer on the missing program is what unblocks it. |
| Share the person's own screen with the checker | The checker would see whatever else is on the person's screen. |
| Allow all local sockets for the checker, denying host sockets by path | A denylist cannot name every socket (tmux, ssh-agent, gpg-agent); one missed socket escapes the sandbox. |
| Allow one private socket path for the session's own screen | Claude Code's sandbox cannot filter by path on Linux. |

## Consequences

- `src/line/working-on.ts` describes each job and where each answer went. The ask's `fate` (given, held, intake), with what premise said after the answer, is kept in the ask's own data, so there is no database change.
- New API fields:
  - `SoftwareDetail.working`, with the jobs and the answers.
  - `doing`, `items` and `answers` on `JobView`.
  - `fate` on `AskView`.
  - A check status, `waiting-for-tool`.
- New page parts: the "What is being worked on" card, the answered card's "What happens with it", and the Activity row's words ([page](../specs/page.md)).
- New field `seen_on_screen` on `verdict_submit` ([agent tools](../specs/agent-tools.md)).
- The [checker](../prompts/checker.md) prompt now covers environment failures and what to say when no screen could be used.
- Carried in the [line engine](../specs/line-engine.md) and [Build, Check and Run](../architecture/build-check-run.md).
- Kept tests with the scripted agent, for each point: `test/answers-visible.test.ts`.
- Left for later, filed as issues: a running agent reading an answer mid-session ([222](https://github.com/omkarbhale/premise/issues/222)), a verdict naming an environment cause without a missing program ([223](https://github.com/omkarbhale/premise/issues/223)), the checker's screenshots on the page ([224](https://github.com/omkarbhale/premise/issues/224)), starting a desktop program on the owner's own screen ([225](https://github.com/omkarbhale/premise/issues/225)), and the planner's brief carrying earlier answers ([226](https://github.com/omkarbhale/premise/issues/226)).

## Related

[0062](0062-intake-goes-in-normally.md), [0186](0186-how-build-check-and-run-are-built.md), [0196](0196-roles-and-taste-in-one-session.md), [0270](0270-premises-own-figures-and-asks-that-cost-attention-honestly.md), [0277](0277-an-agent-without-its-answer-is-asked-once-more.md), [0300](0300-judgement-fixes-from-the-first-real-runs.md).
