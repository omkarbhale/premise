# Page specification

Status: specification, being built ([0130](../decisions/0130-the-build-starts-and-covers-all-of-premise.md)). Related: [page server](page-server.md), [line engine](line-engine.md), [reporter](reporter.md), [gate](gate.md), [roles and use cases](../product/roles-and-use-cases.md).

## 1. Purpose

People use premise through one browser page ([0044](../decisions/0044-one-browser-page.md)). It holds one session where everything is open: chat, every stage, the record view, the report view, and "needed", grouped by role ([0065](../decisions/0065-one-open-session.md)). It is designed as if one person does everything. Roles stay as labels on what is asked, so every ask still says which role it is for.

Nobody has to use another tool alongside it ([0063](../decisions/0063-premise-may-depend-on-other-tools.md)).

## 2. Responsibilities and non-responsibilities

Responsible for:

- showing every software premise looks after, its stage, and everything open in it;
- letting whoever is in the session answer any ask, under whichever role it is labelled;
- per-item strike, keep and edit on every draft and say-back;
- the record view, the report view, the "needed" list, approvals, taste claims and proposals, chat;
- the tab count and browser notifications while the page is open ([0099](../decisions/0099-notices-in-the-session.md)).

Not responsible for:

- deciding anything; every action is a request to the [page server](page-server.md);
- holding state between visits; everything comes from the server.

## 3. Interfaces

The page uses the API and event stream in [page server](page-server.md) 3.2. It is React, built with Vite, served by the server as static files ([0069](../decisions/0069-react-and-vite-page.md)).

## 4. Data owned

None. The token from the link is kept in the page's memory only.

## 5. Behaviour

### 5.1 Layout

| Area | Shows | People can |
|---|---|---|
| Softwares | Each software, its phase and stage, what it is doing now, and a "Waiting on you" or "Paused" mark; what needs you first, then what is working, then paused, then finished, each by priority. Archived softwares are one click away under "Archived (n)" ([0197](../decisions/0197-how-several-softwares-at-once-is-built.md)) | Start a software; bring in software that already exists, from a folder on this computer or a clone address; open one; restore an archived one. Under a software's name: change its priority, pause or resume it, archive it after a confirm (finished, ended or paused ones only; nothing is deleted) |
| Summary | Once there are two softwares: one short summary across them, from recorded facts only: what waits on you, what changed since you last looked, every software's phase, what it is doing, its priority and where it runs ([reporter](reporter.md) 5.8a) | Open a software; leaving the summary counts as having looked |
| Existing software | For a software taken on from existing code ([0189](../decisions/0189-how-taking-on-existing-software-is-built.md)): where it came from, how far taking it on has got, how much was recovered and confirmed, how to run it, what premise could not check and what it needs, where its record stands in the operator's repository, and that hand edits outside premise make the record drift ([0188](../decisions/0188-existing-softwares-record-and-hand-edits.md)) | Offer adding the record to the repository again after declining |
| Line | The three phases (Understand, Build, Running) with the eleven stages under each, where the software is ([0165](../decisions/0165-the-page-shows-three-phases.md)), each stage's budget used. Under Build: each task and where it is, each check of an exact version with its verdict per item and the evidence, what landed, and what waits on a person. Under Running: how to open the software, or the command and a sample run's output ([0186](../decisions/0186-how-build-check-and-run-are-built.md)) | Send it back to any stage; per piece of work (the software, each milestone, each part of a split piece): see its size, steps and split with their reasons, change its size or steps, undo a split until a part is built ([0117](../decisions/0117-size-classes-set-stage-budgets.md), [0184](../decisions/0184-how-sizing-of-work-is-built.md)). Steps the piece being worked on does not need show as "Not needed", with the reason |
| What is being worked on | On every software's page, under its name: each job that has not ended, with what it is doing in plain words ("Fixing what the check found: ..."), the record items it serves with their words, and the person's answers it carries; then the person's recent answers, each with where it went: given to a job, held for a job still working, or taken in as an intake item ([0310](../decisions/0310-answers-are-never-lost-and-the-work-is-visible.md)) | Nothing to do; it is there to read |
| Timeline | Above a software's tabs ([0320](../decisions/0320-a-timeline-of-the-line.md)): its work top to bottom: done (collapsed), running now with the step it is on, who works on it, since when, its last progress line and a checklist of its steps and tasks, then everything queued in order, each with its place, why it waits, what starts it, and a rough estimate of the wait and the work from premise's own history ([0321](../decisions/0321-the-queue-of-changes-says-where-each-stands.md)); questions sit where the work waits for them; each milestone's wait as a mark. The software list shows each software's now, next and queue; Activity shows one line per software | Answer a question from where it waits; move a queued change up or down, set its priority, put it before or after the milestones; make related changes one or keep them apart, split one again; build a change as part of a milestone that touches the same parts; switch a milestone's wait; answer the long-queue notice (hold the lowest-value ones, raise the budget, more agents at once, leave it) |
| Chat | The conversation, with premise's one-line acknowledgements ("Taken as I-14") | Write; corrections go to the open draft ([0118](../decisions/0118-how-chat-messages-are-routed.md)) |
| Needed | Every open ask, grouped by role label, each saying exactly what to do | Answer any of them |
| Record | Each record file as items, with their marks, what they replaced, struck items with reasons, and the commits that name them | Ask "more" on any item |
| Report | The report view ([reporter](reporter.md)): Decided, Running, Needed, Failed or not checked, How premise is doing, Cost | Open the running software; ask "more" on any line |
| Approvals | Standing approvals per software | Withdraw one |
| Queue | Jobs running, waiting (and on what), queued, paused; each with what it is doing, the record items it serves and the person's answers it carries ([0310](../decisions/0310-answers-are-never-lost-and-the-work-is-visible.md)) | Stop a job |
| Top bar | "Pause everything" or "Resume", always visible; while paused, or while premise is stopping, a banner says what is paused, what is still finishing and whether it is safe to close premise; one line at the top says what the last start picked up (with "Start (software) again" for software that stopped with premise) and, after the computer slept, what was checked and restarted | Pause everything (let what is running finish, or stop it now); Resume; Dismiss ([0290](../decisions/0290-pausing-and-resuming-the-whole-of-premise.md)) |
| Learned | A tab per software, under "More views": the two kinds of learning apart, each explained in a sentence. Lessons for this software and the operator's taste, each line with the correction it came from and how often it was given to agents; improvements for premise, grouped, with where each was seen; recent corrections with where each went and why (a correction whose lesson was since deleted or dropped says so, with nothing to move); lines removed and why ([learning](learning.md)). It opens with one sentence saying it is premise's notebook, which nobody needs to open | Edit or delete a line; move a correction to another place; delete an improvement; save the improvements as a text file |
| How premise is doing | A page under "More": one sentence saying it is premise's notebook about itself, which nobody needs to open; premise's own return for every software together and each one, each figure with what it rests on, "not enough yet" when too few; then the Learned view across softwares ([measures](measures.md)) | The same as Learned |
| Intake | A tab per software: every item with where it stands in plain words, its kind, why it went where it went (and the record items it touches), a question's answer, minutes from arriving to its change running; once its change runs, the version, how to try it, and to say so in the conversation if it is still not right; the held count and earlier readings ([0185](../decisions/0185-how-intake-in-a-thin-form-is-built.md)) | Send a problem or a wish; take a merged, closed or held item in after all; ask for a reading now |

### 5.1a First run and plain words

- With no software yet, the page says what premise is, gives one box to describe a software ("What should the software do, and for whom?"), a second to bring in software that already exists ("Bring in software you already have", with what happens after), says what happens next, and says what is not real yet (the stand-in for the later stages, scripted agents when in use, mocked usage), and, when real agents cannot start, what is missing and a "look around with scripted agents (not real)" button ([0180](../decisions/0180-premise-uses-real-agents-by-default.md)) ([0135](../decisions/0135-the-experience-works-without-the-guide.md)).
- Every empty view says what will appear there and when. Every error says what to do next.
- premise's own words (the record, say back, the floor, roles, intake) are explained where they appear, in a few words; the Help view lists them all.
- Usage (under "More"): each software's budget, set in plain words as a share of the week's usage or dollars a week, and what it used by phase, step, change and record item, with premise's own count first (sessions, minutes and what the sessions' own results said they used, real and not marked, or that there are none to count) and the figures labelled Mocked after it, and the weekly window as the agents last reported it, with its age ([0270](../decisions/0270-premises-own-figures-and-asks-that-cost-attention-honestly.md)); a software paused for its budget shows what was spent on what and the three answers, here and on its own page ([usage](usage.md), [0200](../decisions/0200-how-cost-and-the-spending-limit-are-built.md)).
- Navigation: Softwares, Waiting on you (once something is waiting or a software exists) and Help; Activity, Usage and Settings under "More" (they stay open while one is the page shown). Each software shows Conversation and Report; Line, Record and Intake are under "More views". The open software, the view and the software's tab are kept in the link, so a refresh keeps your place ([0190](../decisions/0190-how-the-first-visit-is-made-clear.md), [0197](../decisions/0197-how-several-softwares-at-once-is-built.md)). "Summary" joins the navigation once there are two softwares.
- No setting's name appears in prose outside the Settings page: where a default matters, the page names its value ("Let premise decide (medium)") and says the Settings page tells how to change it.
- The first-screen note matches the mode (scripted agents: a demo, nothing real is built; real agents: the work is real). The page follows a changed link token without a reload and says "This link is old" after a restart.

### 5.2 Asks

Every ask shows its kind and is written in its role's terms ([0009](../decisions/0009-everyone-needed-is-a-user.md)). Every ask shows its role label too, except while only the operator is asked anything: then no label is shown at all, since it would only be jargon ([0196](../decisions/0196-roles-and-taste-in-one-session.md)).

| Kind | Shown as | Answered by |
|---|---|---|
| question | A short question, with premise's best attempt where it has one ([0007](../decisions/0007-llm-does-not-decide-what-it-cannot.md)). At What exists, only the choices that apply, each worded for what it does, with one line each on what choosing it changes, and a one-line box for why when the choice differs from premise's recommendation ([0300](../decisions/0300-judgement-fixes-from-the-first-real-runs.md)) | Text, or one of the choices. A choice against the recommendation with the box left empty is followed by one question in the chat, and the next message is taken as the why |
| draft | A short list; each item marked assumed or from a role. On the milestones list, below the milestones: each must item that works only under a condition, with that condition ([0300](../decisions/0300-judgement-fixes-from-the-first-real-runs.md)) | Strike, keep or edit each item, one at a time; a condition is kept, struck (the must is struck), or "Check it first" (the first build task checks it before building on it) |
| say-back | At most ten items of what premise understood and assumed, assumptions marked. For a software taken on from existing code, every item recovered from the code, marked recovered, grouped by record file and in pages of twelve, still one list answered once ([0189](../decisions/0189-how-taking-on-existing-software-is-built.md)) | Strike what is wrong |
| scope | After What: the items in three tiers (what you asked for, premise recommends adding, premise could also add) and three choices, each with a rough estimate in minutes and then agent sessions (explained on hover), and, when a choice costs the same as the one above it, why ([0191](../decisions/0191-scope-check-effort-and-milestones.md)) | Pick a choice with one click (the software's effort picks the first); move any item to the first version, a later milestone, or leave it out; "Build this much" |
| proposal | For a claimed area: one or two described options to pick from ([0102](../decisions/0102-taste-proposals-before-building.md), [0196](../decisions/0196-roles-and-taste-in-one-session.md)) | Keep one, or say what to change in your own words |
| approval | The gate's fixed card: exactly what will happen and why ([gate](gate.md)) | Approve once, approve this kind for this software (where allowed), or refuse |
| needed | Something only a person can do or provide: an account, a licence, a payment, a secret written into a named file ([0120](../decisions/0120-secrets-stay-out-of-premise.md)), as exact steps in order. For a secret, the file and key, and that premise never takes the value. For a program the agents lack: which one, and why ([0300](../decisions/0300-judgement-fixes-from-the-first-real-runs.md)) | "It is done" (premise checks the key is in the file, and says what is missing if not), or say why not. For a missing program: "Allow <host> for <software>" when one host would let the agents get it (recorded as an approval for that software only, applied from the next session without a restart), "I installed it" (premise checks the agents can run it, and says plainly if not), or "Go on without it" (the check marks what needs it "could not check") |

- Every list is short and item by item ([0029](../decisions/0029-lists-over-long-paragraphs.md)).
- Answering an ask resumes only the work waiting on it.
- A milestone that stops is a question with two choices: "Go on" (the main button) and "Go back to Why" (a quiet one). It says what going on does (the next milestone by name, or that nothing more is built after the last one), and shows how to try the software: "Open it" only when there is a link, the command for command-line software, otherwise "Show me how to try it". The answer is echoed in the conversation with what happens next ([fixed wording](../prompts/fixed-wording.md)).
- When software taken on from existing code did not say how to start it, premise asks "How do you start …?" under Waiting on you once the recovered list is gone through; the answer is taken in as intake. The recovered list's card says first that hand edits outside premise make the record drift.

### 5.3 Notices

- The "needed" list ("Waiting on you"), grouped by role when something waiting is for another role than the operator, with one note saying a role is a label and one person answers for all of them; a plain list otherwise. A count of open asks in the browser tab's title; browser notifications while the page is open ([0099](../decisions/0099-notices-in-the-session.md)).
- A notice appears only when someone is needed ([0098](../decisions/0098-report-when-a-change-reaches-running.md)).

### 5.4 Taste

- Pieces of work built at the same time ([0313](../decisions/0313-several-pieces-of-one-software-at-once.md)): a card "Built at the same time" on the Line tab lists each piece in flight, where it is (being built, checked, landing, reported, or waiting), what it touches ("not known" when the sizer did not say), and for a waiting piece why, in one line ("Waits for I-1 (the shield breaks): both change src/combat/."). The list of pieces marks them "Being built alongside" or "Waiting to be built" with the same reason, and the software's status line says what is in flight. A card "Work built at the same time" chooses how many of the software's pieces may be built at once: the default, one at a time, or up to 2 to 5.
- Any area can be claimed under a role, in its own words ([0022](../decisions/0022-people-can-put-in-their-taste.md)), on the Line tab under "Parts you want to see first"; with no role given, it is the operator's. Claimed areas are listed with their role and where each stands (a proposal comes before it is built, being prepared, waiting for an answer, decided); a claim can be released ([0196](../decisions/0196-roles-and-taste-in-one-session.md)). "Claim an area" links to that form from the Conversation tab and from any listed item that mentions claiming an area.

## 6. Configuration

| Key | Default | Meaning |
|---|---|---|
| `page.notifications` | `"offer"` | `"offer"`: a button on "Waiting on you" offers browser notifications, and the browser asks only when it is pressed. `"off"`: never offered ([0157](../decisions/0157-browser-notifications-are-offered-not-asked.md)) |

## 7. Limits

- Works in current browsers on the owner's machine, from a phone-width window to a wide one, in light and dark, and by keyboard alone ([0155](../decisions/0155-the-page-is-readable-at-phone-width.md)).
- One session; no accounts ([0045](../decisions/0045-a-link-per-person-no-accounts.md)).

## 8. Failure modes and recovery

| Failure | Detection | Effect | Recovery |
|---|---|---|---|
| Event stream drops | Connection lost | Updates stop | Reconnects with the last event id and catches up |
| Token wrong or revoked | 401 | Nothing works | The page says to open the link printed by premise |
| An ask was answered in another open page | 409 | The answer is not taken twice | The page shows the answer already given |

## 9. Security considerations

- The token never goes into the browser's storage or into links the page creates.
- The page renders outside text (intake items, issue text, research sources) as text, never as markup ([0116](../decisions/0116-outside-content-is-data.md)).

## 10. Observability

- None of its own; the server records every action as an event.

## 11. Milestones

- Milestone 1 step 2: one session: chat, record view, report view, "needed"; drafts with per-item strike, keep and edit; say-back; approvals for one action; the running software's link or command.
- Milestone 3: role labels on every ask, the "needed" list grouped by role, taste claims and proposals, approvals for a kind of action. Built ([0196](../decisions/0196-roles-and-taste-in-one-session.md)).
- Milestone 4: the intake area and readings.
- Milestone 7, built: several softwares at once: the ordered list with marks, the summary, priority, pause, archive and restore ([0197](../decisions/0197-how-several-softwares-at-once-is-built.md)).
