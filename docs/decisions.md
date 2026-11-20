# Decisions

Every decision made in the conversation of 2026-11-20 that shaped premise, one entry each.
Sources: [the conversation](record/conversation-2026-11-20.md), [the shaping notes](record/shaping-notes-2026-11-20.md), [the scope page draft](record/scope-page-draft-0.1.html).
"Owner" is the person premise is being made for; "Assistant" is the LLM agent the owner shaped it with.
Quotes are the speakers' own words. Where no reason was given, the entry says so.

All entries are dated 2026-11-20.

## What premise is

### 1. Build the factory as a new product
- **Decision:** build a software factory as a new product, not operate the existing issue-to-merge-to-deploy loop.
- **Why:** No reason was recorded. Owner: "I want to create a software factory", "So a new thing", "#2 I meant, not #1".
- **Rejected:** (1) run a factory, operating the existing loop on the owner's projects; (3) both. These were offered by another agent before the conversation.

### 2. Rethink everything, and decide what is in and out
- **Decision:** start from a blank slate. Existing tools (entail, firstmate, deploys, usage-ledger) are candidates, not the starting point.
- **Why:** Owner: "I want to rethink everything, and I want to also decide what is in and what is not in this."
- **Rejected:** the assistant's first lean: "build it as a thin connecting layer first and prove it on [a private project], since that's where the loop already runs and where it broke. Only make it installable by others once it has run cleanly on two or three of your projects." The assistant dropped it.
- **Also not taken up:** the assistant's twelve-part blank-slate map (intake, decision, specification, build, verification, landing, deploy, feedback, accounting, control surface, capacity, reach). The owner answered with his own description instead (entry 3).

### 3. Scope: from ideas and decisions to properly built software, with intake
- **Decision:** "Everything from ideas and decisions to a properly built software, from scratch, as well as handling intake."
- **Why:** No reason was recorded; stated by the owner as what the product is.

### 4. The operator relationship is two-way
- **Decision:** the product "should also help get the ideas and decisions from the operator, take ideas from the operator, as well as give ideas to the operator or ask questions."
- **Why:** No reason was recorded; stated by the owner.

### 5. Implementation is free
- **Decision:** "It can be via any implementation detail that supports all that we want." (Owner)
- **Why:** No reason was recorded.

### 6. If an LLM can do it, an LLM does it; return on effort decides
- **Decision:** "if something can be done by LLMs, it should be done by LLMs. And what decides that is ROI rather than perfection. I can accept defects if it speeds things up considerably" (Owner, "My main idea").
- **Why:** No further reason was recorded; it is the owner's governing principle.

### 7. If an LLM cannot reliably do it, it does not decide it
- **Decision:** Owner, as a corollary of entry 6: "if something can't be done by LLMs it shouldn't. ... So perhaps along with the operator if there are other people needed, we say so or maybe use LLMs with that considered".
- **Refined:** where an LLM cannot reliably decide, it still gives its best attempt and proposes; a person decides.
- **Why:** Owner: "LLMs can produce useful information regardless, with reasoning, so I do not know where to draw the line. Perhaps it only suggests and tries its best."
- **Related:** the assistant listed what an LLM cannot reliably do today: know an intent nobody has stated; act in the real world (accounts, payments, signatures); carry accountability; tell whether real users actually want the thing. The assistant proposed the product keeps that list explicitly and asks a named person, in their terms, and said the list will shrink over time. Owner: "Sure, and our product should know that."

### 8. Target operator: a person who knows what the software is for
- **Decision:** "even a single person who knows what the purpose of building a sofware is, should be able to" (Owner). That is all the product requires of the operator.
- **Why (Assistant):** "If the operator only knows the purpose, the factory must own every technical judgement. ... Every question it asks has to be about purpose ... I'd design for that operator even while you're the only user, because it stops the factory leaning on your engineering skill." Owner: "I agree though on the target user."
- **Refined by the owner:** "the operator isn't strictly non-technical. Because at the end of the day, the goal is to get a properly built software. And for things LLMs can't reliably do, we need other people. One operator ONLY isn't strict, I was just saying that."

### 9. Everyone needed is a user of the product
- **Decision:** Owner: "all the roles needed are part of the target users for our product and the product gives a way for those other people to come in in those steps. It could be one person or many. Including the primary operator, which might or might not be just one person."
- **Why:** No reason was recorded.

### 10. The whole line is the product
- **Decision:** the whole pipeline is the product, not only the conversation. No step exists where a person carries work to an LLM by hand.
- **Why (Owner):** "After this said conversation (if we have it), if somebody has to go to a chat interface and ask the LLM to do the coding, that is also something that can be automated but it isn't. The same thing can go for a lot of things in the entire pipeline."
- **Why (Assistant, agreeing):** "Today's loop broke at exactly those hand-carried joins."
- **Rejected:** the assistant's opinion "the conversation is the product, not the build line", because "Getting agents to write code is the solved part." The assistant then said: "I was wrong to call the build line the solved part."

### 11. The product is opinionated about the conversation and its records
- **Decision:** the product owns "how to separate and group out and write persisted records on the conversation, and where should the conversation start and go" (Owner). Examples from the owner: if target users are not defined, the product writes plausible ones with the operator; if the problem statement is not defined, the product clears that first.
- **Why:** Owner: "Our product is opinionated here." No further reason was recorded.

### 12. Reporting is part of the line, with a product default
- **Decision:** reporting to the operator is in the line. Default report: what was decided, what is running, and what it needs from the operator (the scope page and vision add "and from whom"). More detail when asked.
- **Why:** Owner: "if a software is big, the operator should be kept upto date in the level of detail he wishes to be kept (or same always as opinion of our product maybe)". Assistant: "Reporting should have a product default, not a setting to configure first." Owner: "I agree".
- **Considered:** a level of detail the operator sets. The product default was chosen.

### 13. The mistake that matters is a mismatch of intent
- **Decision:** small bugs are tolerable; the big mistake is "a mismatch between the intent wanted and what was inferred".
- **Why:** Owner: "only in my opinion, I don't know where mistakes could come from".
- **Agreed with it (Owner: "I agree"):** the assistant's point that "Accepting defects for speed only works if defects are cheap to find and fix. So the loop back from 'this is wrong' to 'fixed' has to be in scope and fast. Without it the trade stops paying."
- **What follows (Assistant; Owner: "I agree on all"):** the product says back what it understood, in purpose terms, before spending real effort; every built piece traces to a recorded intent, so it can be told whether the record was wrong or the build drifted; it shows running software early, "because seeing it is the cheapest way to catch a mismatch."

### 14. Guard against further sources of big mistakes
- **Decision:** the product guards against a false report, a wrong early foundation, and silent contradiction, "and more if we missed them here" (Owner).
- **Why (Assistant):** a false report leaves an operator who relies on reports blind ("I'd treat honest reporting as part of the floor"); a technical choice made alone early "can make everything after it expensive"; with silent contradiction "A later decision quietly undoes an earlier one and nobody notices."
- **Owner:** "I mean I'm following the same rules as we discuss them haha".

### 15. Some things are never traded for speed (accepted in principle)
- **Decision:** a floor of things never traded for speed is accepted in principle; how it works is decided when the whole plan is made.
- **Why (Assistant):** "Some mistakes can't be bought back: lost data, a security hole, money spent, something sent out in the operator's name. I'd let the factory move fast on everything reversible and slow down only for those."
- **Owner:** "Maybe, yes, but when we make the whole plan of the software factory, we'll think how exactly that could happen or works."

### 16. Coarse cost tracking is in
- **Decision:** the product knows what each piece of work costs.
- **Why (Assistant):** "If return on effort decides things, the factory has to measure cost. Otherwise the rule is a guess." Owner: "I agree."

### 17. The line ends at running software
- **Decision:** "properly built" ends at running software, not merged code.
- **Why (Assistant):** "a purpose-only operator can't judge anything else." Owner: "Yes it has to run."
- **Rejected:** ending at merged code.

### 18. Existing software too, with automatic intake
- **Decision:** the product covers existing software as well as new, and automatic intake is wanted. How both work is open (Owner: "How so is a big question of itself").
- **Why:** No reason was recorded.
- **Considered:** the assistant had said "The second is much harder and I'd leave it for later." The owner put existing software in scope; when it is built is entry 34.

### 19. Existing software goes through the same line, with people
- **Decision:** the product first reconstructs the record a from-scratch conversation would have produced (why it exists, for whom, what it must do), "along with people, not fully automatically, if the parts of software conflict with each other or not automatically inferrable" (Owner).
- **Why:** proposed by the assistant; the owner added the people. No further reason was recorded. (The prior-art research later found recovered intent misses 44–65% of user goals; the assistant said this "backs your 'with people, not fully automatic'".)

### 20. When the product says back what it understood
- **Decision:** always at the start of a new software or when taking on an existing one; for later changes, only when the change touches the purpose or would be costly to undo.
- **Why:** proposed by the assistant as its view; no further reason was recorded. Owner: "I agree on the one call you asked for me as well."
- **Changed later:** the say-back is a short list of assumptions to strike out, not a document to agree with (entry 28).

### 21. Vocabulary: product and software
- **Decision:** Owner: "I'm calling software that's built and product which we are making."
- **Why:** No reason was recorded.

### 22. People can put their own taste into the software
- **Decision:** people with their own taste in parts of the software (user experience, technical things, minor features) can assert it. Minor wishes can come in as intake; review before building can be chosen per area. Shape left open on purpose.
- **Why:** Owner: "I'm just rambling here and I'd rather avoid premature thinking for our product, but at the same time make it good."
- **Default (assistant's assumption 9, Owner: "I agree"):** the product decides; a person claims the areas they want to see before they are built. The scope page gave the reason: "Follows the return-on-effort rule: every review point costs speed, so they exist only where someone asked for one."
- **Rejected (scope page):** "A person reviews by default and releases the areas they do not care about."

### 23. Looking at what already exists is a step of the line
- **Decision:** like the prior-art research done for premise, looking at what exists is part of the product, "For maybe both, new or existing software" (Owner).
- **Why (Owner):** "For me, I build what I want to use, so it can avoid effort, some or full. For somebody else, that might amount to finding what others are missing or market research."
- **Shape (Assistant, now in the vision):**
  - it sits after Why and Who, before What;
  - one step serves both motives; the product can tell which from the Why;
  - three outcomes: don't build, use what exists; build on top of something that exists; build something different because there's a real gap ("You said 'some or full', so I take it the product is allowed to say 'don't build this'");
  - it repeats at smaller sizes, before a large feature or a big technical choice; for existing software it also asks whether something has appeared that makes part of it unnecessary;
  - depth follows the return-on-effort rule.
- **Consequence:** the scope page's edge item "finds out whether real users want it" split in two: what exists and what's missing is LLM work and goes in as this step; whether real people want it still needs real people.

### 24. Do not adopt other tools unless they match the vision
- **Decision:** no hands-on trial of Spec Kit, BMAD or Kiro; nothing else is brought in unless it matches the product's vision. The research stands as reading only.
- **Why:** Owner: "I'd rather not use anything else right now. Atleast if it is not what this product's vision is."
- **Rejected:** the report's three follow-ups: a hands-on trial of the upstream tools (the assistant's recommendation); the primary KBSA record; independent evidence on the 2026 whole-line factories.

### 25. Two kinds of record
- **Decision:**
  - **Lasting records** (purpose, users, what it must do, decisions with their reasons, rejected alternatives) are kept current by the product as part of every change.
  - **Working records** (plans and the like) can be as detailed and thorough as the work needs and are not maintained afterwards.
- **Why (Assistant):** "Written specs rot because someone has to remember to update them." Updating the record should be "part of every change the line makes, so it can't fall behind."
- **Why (Owner, changing the assistant's proposal):** "things such as planning and whatnot, which is intended to be used right away can be detailed and thorough. ... why what decisions are made is also needed long term."
- **Rejected:** the assistant's "keep it small ... No implementation detail" applied to every record.

### 26. A description of what exists is not maintained
- **Decision:** technical architecture and code documentation are not maintained; they are written from the code when someone needs them. Only the why is kept.
- **Why (Assistant):** "The code is the truth about what exists, and an LLM can write a fresh description from it whenever someone needs one. A maintained copy only adds something that can go stale. What can't be recovered from code is why it's that way, so that's the part worth keeping."
- **Owner:** had been unsure ("what exists, I'm unsure whether needs maintaining"), then "I agree on your points."

### 27. People's attention is what the product spends least of
- **Decision:** the product decides and shows its assumptions, not asks, whenever being wrong is cheap.
- **Why (Assistant):** "The evidence says build speed isn't the limit; people reading and answering is." "A short visible list of 'I assumed this' is cheaper to correct than a question is to answer." Owner: "I agree."

### 28. The say-back is a list of assumptions to strike out
- **Decision:** the say-back changes "from a document to agree with into a short list of assumptions to strike out" (Assistant). Owner: "I agree."
- **Why:** follows from entry 27.

### 29. Lists over long paragraphs
- **Decision:** the product speaks to people in lists.
- **Why:** Owner: "I also think (for now, my opinion only) long paragraphs of information is harder to deal with for humans than a list of things. Be it code or anything." Assistant agreed: "a list can be corrected item by item." Recorded as the owner's opinion for now.

### 30. The check is independent of the builder
- **Decision:** whatever checks the software is a different agent from the builder, cannot be edited by it, and judges the running result against the intent, "not against the builder's account of what it did" (Assistant). Its form is free: Owner: "it can be anything such as a review pass of an agent, or anything else."
- **Why (Assistant):** "Agents game the checks they can touch." It is "also the best guard against the false report".

### 31. The product is general
- **Decision:** Owner: "the product in general should be able to be used for anything. It has all the prompts and application logic and stuff already decided ... The quality can depend on the LLM models used". What is set per software at run time and what stays with the product is to be decided.
- **Consequence (Assistant; Owner: "I agree on your points"):** "the product's logic should be about the line and the records, not workarounds for one model's weaknesses. Workarounds are what broke on upgrade in the case from the research. Built that way, a better model makes the product better without a rewrite."
- **Rejected:** a setup bonded to one application (the view of one voice in the research: "a general factory breaks on every model upgrade and must be built around one application").
- **Left open:** the assistant's split, "the general part is the conversation, the record and the order of the line. The build setup for each software can be specific to it and regenerated when models change." The assistant called this "the one I'm least sure of". Owner: "What needs to be updated runtime per software and what stays with the product can be decided."

### 32. Drop the review page for a short list of assumptions
- **Decision:** the scope page (draft 0.1) was dropped. The assistant put ten assumptions in chat for the owner to strike out; the outcome was the first vision statement.
- **Why:** Owner: "I don't know though what is the outcome of this page." Assistant: "most of it repeats things you've already told me. Making you read them again breaks the rule we just agreed about spending least of your attention."
- **Earlier:** the owner had asked to keep it open ("Let's keep the lavish open, and we can come back to that later"). It was closed when the vision statement replaced it.

### 33. Answers to the ten assumptions
Owner agreed to 1, 3, 4, 5, 6, 8, 9 and 10, changed 7, and questioned 2.
1. **Keeping the software live for its real users** (hosting, staying up, incidents): later. For the first version, "running" means a place the people working with the product can open and try. Agreed.
2. **Finding out whether real people want the software:** see entry 36.
3. **Real-world acts** (opening accounts, paying, licences, signatures): out. The product names the person and tells them exactly what is needed. Agreed.
4. **What the software's users read** (help text, user guide, release notes): in. Agreed.
5. **Selling and supporting the software** (marketing, pricing, customer support): out. Agreed.
6. **Looking after several softwares at once:** later. Agreed.
7. **Other people setting the product up themselves:** the assistant proposed later, "designed for that from the start but proven on your work first". Owner: "I agree, but sooner than fully deferred." Recorded as sooner than the other later items.
8. **Any kind of software:** in. The first version proves itself on one kind the owner chooses. Agreed.
9. **Taste:** see entry 22. Agreed.
10. **First proof:** see entry 34. Agreed.

No reasons were recorded for 1, 3, 4, 5, 6 and 8 beyond the assumption text itself.

### 34. First proof, and existing software after
- **Decision:** the first proof is one small brand-new software, end to end. Existing software follows once the line works.
- **Why (Assistant):** existing software is "the larger problem and could swallow the effort". The scope page: a brand-new software "Exercises the whole line once with nothing inherited"; and "If it comes first, the line may never be proven end to end."
- **Rejected (scope page):** "An existing software of yours, taken on" ("Useful sooner, but starts with the hardest part: rebuilding the record from what is already there"); "Both at once" ("Finds out earliest what the two have in common, at the cost of two moving targets").

### 35. The vision states the vision only
- **Decision:** the vision statement has no now-or-later split. Build order is kept in a separate note.
- **Why:** Owner: "I want you to only state the vision. Regardless of what we want to build now or later. Later could also be clearly part of the vision, you know."

### 36. Finding out whether real people want the software is out
- **Decision:** the product does not find out on its own whether real people want the software. People's opinions arrive through intake, and the operator sees for themselves whether anybody uses it. When people don't want the software, the product goes back to Why with the operator: the wrong problem may have been solved, or there are other problems.
- **Why (Owner):** "Intake is in, and those people can say their opinion through that, and just saying that the operators can actually look in the real world whether anybody uses the software and decide what is the problem themselves."
- **Why (Assistant, agreeing):** "It keeps the product from claiming to know something only the real world can show. It also keeps the part that is valuable: when the answer comes back 'nobody wants this', the product reopens the problem instead of polishing the build."
- **How it got here:** the assistant first put this as "later"; the owner asked "Needing real people is not out in our product, right? Is this the entire prior work/research part of our product you mean by this?" The assistant explained it was the narrower thing ("putting the software in front of the people it's meant for and learning whether they want it"), not the research step, and had put it in the vision as part of the product. The owner then took it out.
- **Ambiguity left visible:** the owner said both "out" and "So later it is". The assistant wrote it as out of the vision as it stands, with an active version at most a later idea, and asked to be told if the owner meant it the other way. No answer is recorded.

### 37. Name: premise
- **Decision:** the product is named premise. Owner: "premise sounds good." and, after the name check, "Yes premise it is."
- **Why (Assistant):**
  - "It says what the product is about. Everything the product builds has to follow from a stated purpose."
  - "It sits naturally beside entail. A premise is what things follow from; entail is what follows."
  - "It's short, lowercase and easy to say".
- **Rejected:** corollary ("longer and harder to type"); keel (kept as the fallback "If the other project has grown"); slipway; wright ("people may hear 'Playwright'"). Avoided: "factory", "forge" and "foundry", because "They're heavily used already, and the research showed 'software factory' carries fifty years of baggage."
- **Name check:** no repository named premise existed under the owner's GitHub account; the npm name "premise" is taken by an unrelated package; a web search found a desktop app called Premise (mbenachour.github.io/premise) in an adjacent space, seen through a search summary only. Assistant's recommendation: keep premise, "It fits too well to drop over one small project".

### 38. premise stands alone
- **Decision:** Owner: "premise will do all the work entail does (if needed), and nobody has to use both." The vision: "It stands alone. It does everything it needs itself, and nobody has to use another tool alongside it."
- **Why:** No reason was recorded.

### 39. The repository: public, on the owner's GitHub
- **Decision:** register the project as a public repository on the owner's GitHub account (omkarbhale), and write down "raw everything that should be persisted. Including why and how we are doing things, as well as for the decisions made, why they were made." (Owner)
- **Why:** No reason was recorded for public visibility or the account.

### 40. How changes to premise ship: "Fast, I merge"
- **Decision:** every change goes straight to a pull request with no automated review-and-test run, and the assistant merges it.
- **Why:** No reason was recorded. The option as offered: "Fastest, least checked."
- **Rejected:**
  - "Checked, I merge (recommended)": product changes go through the full automated review-and-test run before a pull request; internal-only changes go straight to a pull request; the assistant merges anything that passes and is in scope; destructive or security-sensitive merges still go to the owner.
  - "Checked, you merge": the same checks, with every pull request waiting for the owner's approval ("This is the standard default; it costs your attention on each change").

## Build order agreed so far

Kept out of the vision, from the shaping notes and the conversation:
- First proof: one small brand-new software, end to end, of one kind the owner chooses.
- Existing software after the line works.
- Other people setting the product up comes sooner than the other later items.
- Later: keeping software live for real users; several softwares at once. (The shaping notes' build order also lists finding out whether real people want the software as later; it is now out of the vision, with an active version at most a later idea: entry 36.)
- Next step, per the conversation: "the plan: the order to build in, and what the first proof is."

## Open or parked

- **The floor:** what exactly is never traded for speed, and how the product slows down for it. Parked for the whole plan.
- **Security defaults** for an operator who cannot judge them: the assistant placed this with the floor.
- **How automatic intake works.** Parked for the whole plan (owner: "a big question of itself").
- **What taking on existing software requires.** Parked for the whole plan.
- **What is set per software and what stays with the product.** To be decided.
- **The owner's read of vision draft 3.** Open.
- **Which kind of software the first proof is on.** The owner chooses; not yet chosen.
- **Whether finding out if real people want the software is "out" or "later".** Written as out, with no answer to the assistant's question (entry 36).
- **The other Premise project** in an adjacent space. Keel is the assistant's fallback if it has grown.
- **Raised on the scope page and never discussed** (the page was dropped): four risks (the conversation turns into paperwork; a say-back that confirms the wrong thing; existing software swallows the effort; the whole line is a lot) and a table of who has the last word for each kind of decision. See [the scope page draft](record/scope-page-draft-0.1.html).
