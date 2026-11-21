# Learning from corrections

Status: built ([0173](../decisions/0173-premise-learns-from-corrections.md), [0195](../decisions/0195-two-kinds-of-learning.md), [0194](../decisions/0194-how-learning-from-corrections-is-built.md)); the code is in `src/learning/`. Related: [measures](measures.md), [reporter](reporter.md), [triager prompt](../prompts/triager.md).

A few minutes' read. Learning is two things, kept apart everywhere (code, storage, the page):

- **premise adapting**: short lessons that change what premise's agents do next, for one software or, as your taste, for every software;
- **premise itself improving**: notes on premise's own way of working. They never change how premise works; a person reads them and decides.

## 1. What starts it

A correction is something a person does that says premise got something wrong:

- striking an item premise wrote, at any stage or the say-back (items a person wrote are not counted);
- editing an item premise wrote;
- asking for changes to a proposal; for a proposal for a claimed area, premise's fixed rule sends what the claimer said to the operator's taste ([0196](../decisions/0196-roles-and-taste-in-one-session.md));
- declining a request at the gate;
- sending work back to an earlier stage;
- undoing a split;
- a bug coming in against something premise's check said worked (a checker miss, from the [measures](measures.md)).

premise notices each one from what it already records, within a second or so. Nothing else is needed from the person.

## 2. Where each correction goes

Each correction goes to exactly one place, with what kind of mistake it was and why it goes there. The triager agent reads it; premise's fixed rules decide when agents are off or say nothing, and always for an undone split and a checker miss.

| Place | What it can change | What it cannot change |
| --- | --- | --- |
| **This software** | What this software's agents (drafter, planner, builder, checker) are told, from the next brief on | Any other software; premise's own prompts or defaults |
| **Your taste** | What every software's agents are told, from the next brief on | premise's own prompts or defaults |
| **premise itself** | Nothing at runtime. It is kept under "Improvements for premise", grouped when the same thing recurs, with where it was seen | Anything premise does; a person decides what to do with it |
| **Nothing to learn** | Nothing | Nothing |

Worked examples:

- **This software.** At Why you strike "Doing this by hand gets skipped", saying "I never skip it". The line: *L-1: Do not assume "Doing this by hand gets skipped"; it was struck: I never skip it.* The next drafter brief for this software carries it; when the What draft follows it, the item shows "Follows what you taught premise (L-1)".
- **Your taste.** On a recipes app you edit "Users sign up with email" to "No accounts: it is just for me", and on a reading list you strike an account item too. The triager reads it as how you like things, whatever the software: *L-4: Assume no accounts unless the person asks for them.* Every software's briefs carry it.
- **premise itself.** The check said W-2 was met, then a bug came in against W-2. This is a miss by premise's own check: *The check said W-2 was met, but a bug came back against it.* It goes under Improvements for premise as "checker-miss, seen once, in Reading list". A second miss anywhere groups under the same entry ("seen 2 times"). Nothing premise does changes.
- **Nothing to learn.** You send the work back to Why without saying why. A send-back says what to redo, not what was wrong, so there is nothing to learn; the page says so and suggests saying in chat what was wrong.

## 3. How a line takes effect

- A new line is said once in the software's conversation ("Learned from your correction…"), never asked as a question. It takes effect unless you remove it.
- It goes into every brief premise writes after it exists, for the drafter, planner, builder and checker. A brief already written for work that is already queued does not have it; in practice the stage after next is the first to.
- Briefs get this software's lessons, then your taste. Improvements for premise are never put in a brief.
- Each time a line goes into a brief it counts as used, and the page shows how often and when last.
- A draft item that follows a lesson says so on the page, so you can see you were heard.

## 4. What a person can do

On a software's **Learned** tab (under "More views"), and for all softwares on **How premise is doing** (under "More"):

- see both lists, each line with the correction it came from, how often it was used and when;
- **edit** a line, or **delete** it, in one click;
- see every recent correction with where it went and why, and **move** it to another place in one click (a line moves with it; moving to "nothing to learn" removes it);
- see Improvements for premise, delete one, or **save them all as a text file**;
- see lines removed recently, and why.

## 5. The caps

- At most 10 lines per software and 10 lines of taste (`learning.software_lines_max`, `learning.taste_lines_max`). Over the cap, the least-used line is dropped (the oldest among equals), with a note in the conversation and on the page.
- A line is at most 200 characters (`learning.line_max_chars`).
- No line exists without the correction it came from.
- `learning.read_with_agent` (on by default) turns the triager's reading off, leaving premise's fixed rules.

## 6. What is kept where

- Both lists and the improvements are in premise's database, in its data folder. Your taste is about you, so it never goes into a software's repository.
- They survive a restart; a correction being read when premise stopped is finished when it starts again.

## 7. What is measured

The [measures](measures.md) count how often something premise said worked came back as a bug; each such miss is also a correction that goes to premise itself (section 2).

## 8. Not built yet

- Writing a software's lessons into its record in its repository (each change would otherwise show as a new version not running) ([issue 116](https://github.com/omkarbhale/premise/issues/116)).
- A lesson reaching the brief of work already queued when it was learned ([issue 117](https://github.com/omkarbhale/premise/issues/117)).
- Learning from things said in chat that are corrections but not one of the acts in section 1 ([issue 118](https://github.com/omkarbhale/premise/issues/118)).
- Sending Improvements for premise anywhere outside this machine; it would be a floor action through the gate, so premise would ask first ([issue 119](https://github.com/omkarbhale/premise/issues/119)).
- Giving a lesson only to the roles it is about, and merging near-duplicates ([issue 122](https://github.com/omkarbhale/premise/issues/122)).
