# 0320. A timeline of the line

- Status: Accepted; builders' choices, open to the owner's correction
- Scope: Making premise
- Date: 2026-11-24
- Decided by: The builders, from the owner's words.
- Source: The owner, after using premise: "I can't see what is going on in the line, atleast visually. So after planning, there might be lot of steps but can't see which step it is on and stuff in Activity, nor what will resume when it is done. For example here, it told me it will run after current work but where is it? This is UX thing in premise". His example was an intake item "taken in: it goes onto the line after the work before it", with nowhere on the page showing that queue. Related: [0135](0135-the-experience-works-without-the-guide.md), [0155](0155-the-page-is-readable-at-phone-width.md), [0165](0165-the-page-shows-three-phases.md), [0181](0181-the-line-works-on-work-items.md), [0185](0185-how-intake-in-a-thin-form-is-built.md), [0321](0321-the-queue-of-changes-says-where-each-stands.md).

## Context

The Line tab showed the eleven stages and the pieces of work, but not as an order: which step the running piece was on, who was doing it, what came after it and why it waited. Activity listed jobs, not pieces of work. An item taken in said "after the work before it" and nothing showed where that was.

## Decision

1. **One timeline per software, on its page, above the tabs**, so it is seen whatever tab is open. Top to bottom: finished work collapsed into one line ("3 pieces done", with how each ended), what runs now expanded, and everything queued after it in the order the line takes it.
2. **Each entry is a piece of work**: the understanding (Why to Plan), each milestone or part, a fix the check of the whole asked for, each change from intake ("Your change I-2: …", "Your fix I-3: …"), and items taken in that are still being read. Before the plan exists, one entry stands for the build: "Build it: the milestones the plan makes", which starts when the plan is confirmed.
3. **The running entry** says the step it is on in plain words ("Build, task 3 of 7: bots peek corners", "Fixing what the check found, task 1 of 2: …", "Check, round 2: …"), who works on it (builder, checker, planner …), since when, and the agent's last progress line; and a checklist of its steps with done, running and to-do marks, the tasks of Build and of each fix round under it, and each check round with what it found.
4. **Each queued entry** says its place, why it waits ("Waits for you to say go on after milestone 1", "after your change I-2: both change the same parts") and what will start it.
5. **Questions sit where the work waits**: a change's question at the change, an intake question at its item, the milestone's "Go on?" at the stopped milestone, anything else at the running work, each with "Answer it", which opens the conversation at that card.
6. **Built on the server from what premise already keeps** (work items, the build of the running piece, jobs, open asks, intake items), as one more part of the software's detail, so the page's existing live refresh from the event stream keeps it current. The builder of the view is a pure function so each state is tested on its own.
7. **Several running pieces are a list**, so pieces running side by side within one software show as several running entries once the line runs them.
8. **A glance everywhere else**: the software list shows each software's now and next and its queue; Activity gets one line per software with what runs (and its step) and what is next up.
9. **Plain words**: ids such as M-2 are only under "Details"; intake references stay in titles, as the person uses them in the conversation.
10. **Tested at each state**: component tests for each kind of entry; a test on the real line with scripted agents that reads the timeline through the plan, build tasks, a check, a fix round, intake queued and a milestone stop; and a second part of the one browser test file of [0156](0156-page-tests-with-testing-library-and-one-browser-test.md) (run after the first-run walk, not beside it), that walks the same on the page and saves screenshots at laptop and phone width (`timeline-*.png`). `start()` takes a script written in code for that, for tests only.

## Reason

- The owner could not see the line. One view, in the order the work goes, answers "where is it, what is it doing, what comes next and why" without the guide ([0135](0135-the-experience-works-without-the-guide.md)).
- Above the tabs, because the person should not have to know which tab holds it; collapsed history and a few queued entries before "Show all" keep it short at phone width ([0155](0155-the-page-is-readable-at-phone-width.md)).
- From the server, because only the server knows the jobs, the asks and the line's own order; the page holds no state ([page spec](../specs/page.md) 2).
