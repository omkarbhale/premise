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
| Softwares | Each software, its stage, its state (active, paused and why) | Start a software; bring in software that already exists, from a folder on this computer or a clone address; open one |
| Existing software | For a software taken on from existing code ([0189](../decisions/0189-how-taking-on-existing-software-is-built.md)): where it came from, how far taking it on has got, how much was recovered and confirmed, how to run it, what premise could not check and what it needs, where its record stands in the operator's repository, and that hand edits outside premise make the record drift ([0188](../decisions/0188-existing-softwares-record-and-hand-edits.md)) | Offer adding the record to the repository again after declining |
| Line | The three phases (Understand, Build, Running) with the eleven stages under each, where the software is ([0165](../decisions/0165-the-page-shows-three-phases.md)), each stage's budget used. Under Build: each task and where it is, each check of an exact version with its verdict per item and the evidence, what landed, and what waits on a person. Under Running: how to open the software, or the command and a sample run's output ([0186](../decisions/0186-how-build-check-and-run-are-built.md)) | Send it back to any stage; per piece of work (the software, each milestone, each part of a split piece): see its size, steps and split with their reasons, change its size or steps, undo a split until a part is built ([0117](../decisions/0117-size-classes-set-stage-budgets.md), [0184](../decisions/0184-how-sizing-of-work-is-built.md)). Steps the piece being worked on does not need show as "Not needed", with the reason |
| Chat | The conversation, with premise's one-line acknowledgements ("Taken as I-14") | Write; corrections go to the open draft ([0118](../decisions/0118-how-chat-messages-are-routed.md)) |
| Needed | Every open ask, grouped by role label, each saying exactly what to do | Answer any of them |
| Record | Each record file as items, with their marks, what they replaced, struck items with reasons, and the commits that name them | Ask "more" on any item |
| Report | The report view ([reporter](reporter.md)): Decided, Running, Needed, Failed or not checked, Cost | Open the running software; ask "more" on any line |
| Approvals | Standing approvals per software | Withdraw one |
| Queue | Jobs running, waiting (and on what), queued, paused | Stop a job |
| Intake | A tab per software: every item with where it stands in plain words, its kind, why it went where it went (and the record items it touches), a question's answer, minutes from arriving to its change running; the held count and earlier readings ([0185](../decisions/0185-how-intake-in-a-thin-form-is-built.md)) | Report a problem or a wish; take a merged, closed or held item in after all; ask for a reading now |

### 5.1a First run and plain words

- With no software yet, the page says what premise is, gives one box to describe a software ("What should the software do, and for whom?"), a second to bring in software that already exists ("Bring in software you already have", with what happens after), says what happens next, and says what is not real yet (the stand-in for the later stages, scripted agents when in use, mocked usage), and, when real agents cannot start, what is missing and a "look around with scripted agents (not real)" button ([0180](../decisions/0180-premise-uses-real-agents-by-default.md)) ([0135](../decisions/0135-the-experience-works-without-the-guide.md)).
- Every empty view says what will appear there and when. Every error says what to do next.
- premise's own words (the record, say back, the floor, roles, intake) are explained where they appear, in a few words; the Help view lists them all.
- Navigation: Softwares, Waiting on you (once something is waiting or a software exists) and Help; Activity, Usage and Settings under "More" (they stay open while one is the page shown). Each software shows Conversation and Report; Line, Record and Intake are under "More views". The open software is kept in the link so a refresh returns to it ([0190](../decisions/0190-how-the-first-visit-is-made-clear.md)).
- The first-screen note matches the mode (scripted agents: a demo, nothing real is built; real agents: the work is real). The page follows a changed link token without a reload and says "This link is old" after a restart.

### 5.2 Asks

Every ask shows its role label and its kind, and is written in that role's terms ([0009](../decisions/0009-everyone-needed-is-a-user.md)).

| Kind | Shown as | Answered by |
|---|---|---|
| question | A short question, with premise's best attempt where it has one ([0007](../decisions/0007-llm-does-not-decide-what-it-cannot.md)) | Text |
| draft | A short list; each item marked assumed or from a role | Strike, keep or edit each item, one at a time |
| say-back | At most ten items of what premise understood and assumed, assumptions marked. For a software taken on from existing code, every item recovered from the code, marked recovered, grouped by record file and in pages of twelve, still one list answered once ([0189](../decisions/0189-how-taking-on-existing-software-is-built.md)) | Strike what is wrong |
| scope | After What: the items in three tiers (what you asked for, premise recommends adding, premise could also add) and three choices, each with a rough estimate of agent sessions and minutes ([0191](../decisions/0191-scope-check-effort-and-milestones.md)) | Pick a choice with one click (the software's effort picks the first); move any item to the first version, a later milestone, or leave it out; "Build this much" |
| proposal | For a claimed area: a screenshot of a quick prototype, or a short list ([0102](../decisions/0102-taste-proposals-before-building.md), [0115](../decisions/0115-taste-prototypes-on-a-throwaway-branch.md)) | Accept, or say what to change |
| approval | The gate's fixed card: exactly what will happen and why ([gate](gate.md)) | Approve once, approve this kind for this software (where allowed), or refuse |
| needed | Something only a person can do or provide: an account, a licence, a payment, a secret written into a named file ([0120](../decisions/0120-secrets-stay-out-of-premise.md)) | Mark done, or say why not |

- Every list is short and item by item ([0029](../decisions/0029-lists-over-long-paragraphs.md)).
- Answering an ask resumes only the work waiting on it.

### 5.3 Notices

- The "needed" list, grouped by role; a count of open asks in the browser tab's title; browser notifications while the page is open ([0099](../decisions/0099-notices-in-the-session.md)).
- A notice appears only when someone is needed ([0098](../decisions/0098-report-when-a-change-reaches-running.md)).

### 5.4 Taste

- Any area can be claimed under a role, in its own words ([0022](../decisions/0022-people-can-put-in-their-taste.md)). Claimed areas are listed with their role; a claim can be released.

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
- Milestone 3: role labels on every ask, the "needed" list grouped by role, taste claims and proposals, approvals for a kind of action.
- Milestone 4: the intake area and readings.
- Milestone 7: several softwares at once.
