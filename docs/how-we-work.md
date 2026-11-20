# How premise is being made

Why and how premise is being made, as far as the conversation of 2026-11-20 shows it, with the working arrangement settled on 2026-11-21 at the end.
Sources: [the conversation](record/conversation-2026-11-20.md), [the shaping notes](record/shaping-notes-2026-11-20.md), [the prior-art ask](prior-art/ask.md) and [report](prior-art/report.md).
"Owner" is the person premise is being made for; "Assistant" is the LLM agent the owner shaped it with. Decisions themselves are in the [decision records](decisions/README.md); the old entry numbers are kept as record numbers.

## Why premise is being made

- The owner: "I want to create a software factory", "So a new thing".
- Before the conversation, the loop the assistant described existed "in pieces held together by hand":
  - entail decides go/no and merges;
  - firstmate runs the workers;
  - a deploy puts the merged result on a local [private system];
  - usage-ledger is planned to track where agent usage goes.
- Where that loop broke on 2026-11-20, per the assistant:
  - open merge requests needed rebasing after every merge;
  - the pool of local working copies filled up;
  - entail's acceptance criteria assumed facts the platform doesn't expose;
  - entail's start and send-back commands aren't wired to anything.
- The owner chose not to build on that loop: "I want to rethink everything, and I want to also decide what is in and what is not in this."
- The owner's own motive, said about the prior-art step: "For me, I build what I want to use, so it can avoid effort, some or full."

## Working rules the owner set

- "From now and always, take what I say as I see it and give your opinion where have to."
- Decide what is in and what is not in the product.
- "I'd rather avoid premature thinking for our product, but at the same time make it good."
- On adding sources of big mistakes not yet named: "I mean I'm following the same rules as we discuss them haha".
- Lists over long paragraphs: "(for now, my opinion only) long paragraphs of information is harder to deal with for humans than a list of things. Be it code or anything."
- Do not use other tools unless they match the vision: "I'd rather not use anything else right now. Atleast if it is not what this product's vision is."
- The vision states the vision only: "Regardless of what we want to build now or later. Later could also be clearly part of the vision, you know."
- Records: "write down I guess raw everything that should be persisted. Including why and how we are doing things, as well as for the decisions made, why they were made."
- "Don't write too much more (inferred) from what we talked, but at the same time, the repo should not miss anything this chat session has!"

## Rules the assistant kept during the conversation

- No repository until the owner had agreed its name, owner, visibility and how changes get shipped.
- Nothing is designed until scope is settled.
- The owner's statements are kept in his words (shaping notes).
- Check a name for clashes before committing to it.

## The method the conversation followed

1. **Before the conversation:** another agent offered three readings of "software factory"; the owner chose to build it as a new product.
2. **Opening:** the assistant said what it understood, asked three questions (what goes in and out; who it is for; on top of existing pieces or replacing them) and gave a lean. The owner asked to rethink everything instead.
3. **Root question and a blank-slate map:** the assistant asked what the factory is for and offered a twelve-part map to mark in, out or later. The assistant offered to put a first pass on a visual board "so you can move items around rather than re-reading chat". The owner answered with his own description and main idea.
4. **Rounds of read-back and opinion:** each round the assistant said how it read the owner, gave numbered opinions, and asked a few calls. The owner answered by number: agreeing, pushing back, or adding.
5. **A running shaping record:** the assistant kept notes of the owner's statements in his words, what was settled, deferred and open ([shaping notes](record/shaping-notes-2026-11-20.md)).
6. **A review page for marking:** the assistant drafted the whole line as a page ([scope page draft 0.1](record/scope-page-draft-0.1.html)): principles as cards, one picture of the line, a table of who has the last word, 26 items to mark in, later or out (18 starting on "in" from the owner's words, 8 edges on the assistant's suggestion), two calls, parked items and four risks. The owner asked to keep it open and come back later. It was never marked.
7. **Prior-art research:** commissioned at the owner's request, then discussed (below).
8. **A short list instead of the page:** when the owner asked what the page's outcome was, the assistant dropped it and put ten assumptions in chat for the owner to strike out.
9. **The vision statement:** written from those answers, then changed once after the owner took out "finding out whether real people want the software". Current text: [VISION.md](../VISION.md), draft 3.
10. **Naming:** the owner asked for a name; the assistant suggested premise and four others, then checked premise for clashes.
11. **The repository:** the owner asked to register the project publicly on his GitHub and write everything down; the assistant asked how changes should ship before creating it.
12. **Writing it down:** the assistant gathered the full conversation and records "so a worker can write them into it". This repository is the result.

## How changes ship

- The owner's choice: "Fast, I merge".
- Every change goes straight to a pull request with no automated review-and-test run, and the assistant merges it. As offered: "Fastest, least checked."
- The other options and why they were not chosen are in record [0040](decisions/0040-fast-i-merge.md).
- Reconfirmed on 2026-11-21 ([0052](decisions/0052-fast-i-merge-reconfirmed.md)).

## Building without the owner (from 2026-11-21)

- The owner asked to settle every call that needs the owner first, so that premise can be built without the owner ([0042](decisions/0042-plan-top-down-settle-owner-calls-first.md)). The calls and follow-ups are records 0043–0060; the decisions after them are 0061–0066.
- Nothing is built until the owner says to start; the whole plan is committed first ([0061](decisions/0061-nothing-built-until-the-owner-says.md)). The plan is now carried by the [architecture](architecture/overview.md), the [roadmap](product/roadmap.md) and the [decision records](decisions/README.md) ([0066](decisions/0066-documents-follow-the-aras-insight-layout.md)).
- Once building starts, the builders decide the rest of the design and record each choice with its reason and the alternative rejected, as a new [decision record](decisions/README.md).
- Work stops for the owner only on destructive, security-sensitive, public-facing or money-spending actions ([0053](decisions/0053-when-work-stops-for-the-owner.md)).
- One short report per finished milestone; an immediate message only when something needs the owner ([0054](decisions/0054-reports-to-the-owner.md)).

## The prior-art research and what was done with it

### Why it was done
- Owner: "I [want] a thorough prior art (things built or just ideas, opinions available) research done as well, and then we can talk about what we want as we are doing now."
- Shaping talk was to resume once its findings were in.

### What it was asked to do
- Full ask: [prior-art/ask.md](prior-art/ask.md).
- Three kinds of prior art, each labelled: things built, ideas and proposals, opinions (including critiques and sceptical takes).
- The whole line, not just code-writing tools, for new and existing software, and the older pre-LLM history of the "software factory" idea.
- For each entry: which parts of the line it covers and leaves to people; how it treats people and roles; how it handles the gap between what was wanted and what was understood; what it is opinionated about; independent evidence kept apart from the maker's claims.
- Every claim with its source. No recommendation of what the factory should be.

### How it was done
- Run as a research task by a separate worker, using seven parallel research sub-agents, one per area; about 60 of the most load-bearing pages re-fetched and about 150 quoted phrases and figures checked. No tool was installed or run hands-on. Details: [report](prior-art/report.md), "How this was done" and Appendix A.
- The assistant noted that the research worker was switched to Opus 5.5 at high effort just after it was started on Fable 5.2 at the highest reasoning setting. The assistant took that as the owner's change and left it alone. No reply is recorded.

### What it found (the assistant's summary in the conversation)
- Nothing built covers the whole line. Closest: 8090, Factory 2.0, Spec Kit and BMAD, and app builders like Lovable and Replit. Almost all evidence for them is the makers' own claims.
- Crowded: building, spec and plan checkpoints, AI code review, migrations of existing code that have tests to check against.
- Thin: deciding what to build, several people entering at their own steps, reporting at a detail the operator chooses, cost against value, recovering intent from existing code.
- Not found anywhere: a product that owns the conversation and won't build until the problem and users are settled; routing each question to the right person in their own terms; keeping a record of rejected alternatives.
- "So the parts you care most about are the parts nobody has done. That is an opening, and it also means there's no evidence yet that they work."
- Supporting what the owner had said: intent mismatch is the top reported failure (agents guess rather than ask, though asking helps by up to 74%); tolerable defects are bounded by stakes, not by speed gained ("That backs the floor we parked"); recovered intent from existing code misses 44–65% of user goals.
- Challenging the draft: written specs didn't reduce defects across 88,000 pull requests and 81.5% of spec files are never updated; human attention is the bottleneck, not build speed; agents game checks they can reach; a reusable factory may be the wrong shape; non-expert operators are where security incidents cluster; the idea is old (a 1970s US factory failed when requirements were split from building; a 1983 Air Force programme stalled on scope and on languages people couldn't use).

### What was done with it
- The assistant pointed to sections 2 (closest entries side by side), 5 (failure modes) and 6 (open questions) of the report as the ones worth reading first.
- Reading only. The owner declined all three research follow-ups, including the hands-on trial the assistant recommended ([0024](decisions/0024-no-other-tools-unless-they-match-the-vision.md)).
- The research raised four points, each settled with the owner:
  - the record is kept by the product ([0025](decisions/0025-two-kinds-of-record.md), [0026](decisions/0026-no-maintained-description-of-what-exists.md));
  - people's attention is spent least ([0027](decisions/0027-spend-least-of-peoples-attention.md)–[0029](decisions/0029-lists-over-long-paragraphs.md));
  - the check is out of the builder's reach ([0030](decisions/0030-independent-check.md));
  - reusable product or a setup bonded to each software ([0031](decisions/0031-the-product-is-general.md)).
- A fifth point, security defaults for an operator who can't judge them, was put with the parked floor.
- It showed "software factory" "carries fifty years of baggage", one reason the assistant gave for avoiding "factory" in the name ([0037](decisions/0037-name-premise.md)).
- Looking at what already exists became a step of premise's own line ([0023](decisions/0023-looking-at-what-exists.md)): "similar to how we are doing prior work, this should also be in product I think."
