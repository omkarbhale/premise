# Conversation record, 2026-11-20

The conversation in which premise was shaped, in order. "Owner" is the person the product is being made for; "Assistant" is the LLM agent he shaped it with. Text is verbatim except that terms of direct address were removed from the assistant's replies, one private project name and one private system name were replaced with bracketed placeholders, and two local file paths were replaced with their paths in this repository.

## Before this conversation

The owner had been offered three readings of "software factory" by another agent: (1) run a factory, operating an existing issue-to-merge-to-deploy loop on his projects; (2) build the factory itself as a new product; (3) both. His words: "I want to create a software factory", "So a new thing", "#2 I meant, not #1".

## Owner

I want to build a software factory.

## Assistant

Before I propose anything, here is what I understand so far and the three things I need from you.

**What I think you mean:** a new product that turns a stated intent into a deployed, visible change, with you making only the product decisions. Today that loop exists in pieces held together by hand:

- entail decides go/no and merges.
- firstmate runs the workers.
- A deploy puts the merged result on your local [private system].
- usage-ledger is planned to track where agent usage goes.

The factory would be the thing that makes those one line.

**Where today's loop broke (2026-11-20):**

- Open merge requests needed rebasing after every merge.
- The pool of local working copies filled up.
- entail's acceptance criteria assumed facts the platform doesn't expose.
- entail's start and send-back commands aren't wired to anything.

**Three questions that decide the design:**

1. **What goes in and what comes out?** When it's working, what do you hand it (an issue, a one-line idea, a whole VISION.md), and what do you get back: a merged change, a deployed instance to look at, or a report of what it cost?
2. **Who is it for?** Is it only for you on this machine, or something another person could install and point at their own projects? This changes almost everything about how it's built.
3. **Does it sit on top of the existing pieces or replace them?** One option is a thin layer that connects entail, firstmate, deploys and usage-ledger as they are. The other is a single new product that absorbs their jobs over time.

My lean, for you to correct: build it as a thin connecting layer first and prove it on [a private project], since that's where the loop already runs and where it broke. Only make it installable by others once it has run cleanly on two or three of your projects.

I won't create a repository until you've agreed its name, owner, visibility and how changes get shipped.

## Owner

I want to rethink everything, and I want to also decide what is in and what is not in this.

## Assistant

Understood. I'm dropping my lean and treating the existing tools as things we may or may not use, not as the starting point.

Here is how I suggest we do the rethink: you say what the factory is for, we lay out everything it could cover, and you mark each part in, out or later. Nothing gets designed until that's settled.

**The root question first:** in your own words, what is the factory for? What should be true once it exists that isn't true today? Rough is fine; this is the anchor for every in/out call.

**A blank-slate map to react to.** These are the parts a software factory could own, stated without reference to any tool you have now:

1. **Intake:** where work comes from (ideas, issues, bug reports, customer requests).
2. **Decision:** whether something is worth doing, judged against a stated vision.
3. **Specification:** turning a yes into buildable work with clear acceptance criteria.
4. **Build:** agents making the change.
5. **Verification:** proving the change meets its criteria (tests, review, checking the running thing).
6. **Landing:** merging, ordering, and keeping parallel work from colliding.
7. **Deploy:** getting the result somewhere a person can see it.
8. **Feedback:** what happens after deploy (defects and observations flowing back into intake).
9. **Accounting:** what each piece of work cost.
10. **Control surface:** the one place you watch and steer from.
11. **Capacity:** the machines, working copies and test instances it runs on.
12. **Reach:** one project or many, you alone or others too, GitHub or GitLab or both.

You can answer the root question, mark the list (for example "1–7 in, 9 later, 12 just me"), or tear the list up and give me your own. If the map is missing something or cuts things the wrong way, say so; that tells me as much as the in/out marks.

Once we have a first pass, I can put it on a visual board so you can move items around rather than re-reading chat.

## Owner

Everything from ideas and decisions to a properly built software, from scratch, as well as handling intake. It should also help get the ideas and decisions from the operator, take ideas from the operator, as well as give ideas to the operator or ask questions. It can be via any implementation detail that supports all that we want. From now and always, take what I say as I see it and give your opinion where have to. My main idea is that: if something can be done by LLMs, it should be done by LLMs. And what decides that is ROI rather than perfection. I can accept defects if it speeds things up considerably, for example. I would go so far as to say even a single person who knows what the purpose of building a sofware is, should be able to.

## Assistant

I've recorded that and your standing instruction: I'll take what you say as you see it and give my opinion where one is needed.

**How I read it**

- **Scope:** from ideas and decisions to properly built software, starting from nothing, with intake included.
- **Two-way with the operator:** it draws ideas and decisions out of them, takes theirs, offers its own, and asks questions.
- **Rule:** if an LLM can do it, an LLM does it. The test is return on effort, not perfection.
- **Operator:** one person who knows what the software is for. That is all it requires of them.

**My opinions**

1. **The operator line is the most important thing you said.** If the operator only knows the purpose, the factory must own every technical judgement. It can never ask "which database" or show a diff for approval. Every question it asks has to be about purpose: what should happen, for whom, and what matters more. I'd design for that operator even while you're the only user, because it stops the factory leaning on your engineering skill.

2. **So the conversation is the product, not the build line.** Getting agents to write code is the solved part. The hard part is holding the purpose, knowing when to ask and when to just decide, and bringing ideas back to the operator. That's where I'd put the design effort.

3. **Accepting defects for speed only works if defects are cheap to find and fix.** So the loop back from "this is wrong" to "fixed" has to be in scope and fast. Without it the trade stops paying.

4. **The return-on-effort rule needs a floor.** Some mistakes can't be bought back: lost data, a security hole, money spent, something sent out in the operator's name. I'd let the factory move fast on everything reversible and slow down only for those.

5. **If return on effort decides things, the factory has to measure cost.** Otherwise the rule is a guess. I'd count coarse cost tracking as in.

**Three calls I need from you**

1. **New software only, or existing software too?** "From scratch" could mean it only builds new things, or that it can also take over something like [a private project]. The second is much harder and I'd leave it for later.
2. **Where does "properly built" end?** At merged code, or at running software the operator can open and use? I think it has to be running software, because a purpose-only operator can't judge anything else.
3. **Do you accept the floor in point 4, and is anything missing from it?**

## Owner

1. I agree, but also take into account this: as a corrlary to what i said, if something can't be done by LLMs it shouldn't. There's less of what LLMs can't do, but while thinking we also think of this. So perhaps along with the operator if there are other people needed, we say so or maybe use LLMs with that considered I guess. I agree though on the target user.
2. Actually I push back on this. The pipeline is also our product. After this said conversation (if we have it), if somebody has to go to a chat interface and ask the LLM to do the coding, that is also something that can be automated but it isn't. The same thing can go for a lot of things in the entire pipeline. And how to separate and group out and write persisted records on the conversation, and where should the conversation start and go is also owned by the product. Our product is opinionated here. If target users aren't defined for example, then the product might write the plausible once with the help of the operator. If the problem statement is not defined, the product might get that cleared first as part of why to build this, and so on. In this pipeline, reporting to the operator is also included, if a software is big, the operator should be kept upto date in the level of detail he wishes to be kept (or same always as opinion of our product maybe)
3. I agree, small bugs are no problem perhaps. The big mistakes are when there is a mismatch between the intent wanted and what was inferred (only in my opinion, I don't know where mistakes could come from)
4. Maybe, yes, but when we make the whole plan of the software factory, we'll think how exactly that could happen or works.
5. I agree.

1. Existing software too. So perhaps we can have automatic intake as well. How so is a big question of itself, along with what is needed for existing softwares.
2. Yes it has to run. And you can say that the operator isn't strictly non-technical. Because at the end of the day, the goal is to get a properly built software. And for things LLMs can't reliably do, we need other people. One operator ONLY isn't strict, I was just saying that.
3. I think I answered it.

## Assistant

All of that is recorded. You're right on the pipeline: I was wrong to call the build line the solved part.

**What I now take as settled**

- **The whole line is the product.** No step exists where a person carries work to an LLM by hand. Today's loop broke at exactly those hand-carried joins.
- **The product has opinions about the conversation.** It decides where the conversation starts, where it goes next, and how what's said is split up and kept. If the problem statement is missing, it clears that first. If target users are missing, it drafts plausible ones with the operator.
- **Reporting is part of the line.**
- **It ends at running software.**
- **It covers existing software as well as new, with automatic intake.**
- **People other than the operator are named where an LLM can't reliably do the job.**
- **The floor of things never traded for speed waits for the whole plan.**

**My opinions**

1. **Your intent-mismatch point should drive the design.** It leads to three things:
   - The factory says back what it understood, in purpose terms, before spending real effort.
   - Every piece of built work traces to a recorded intent. When something is wrong, we can tell whether the record was wrong or the build drifted from it.
   - It shows running software early, because seeing it is the cheapest way to catch a mismatch.

2. **You said you don't know where else big mistakes come from. I see three more:**
   - **A false report.** The factory says something works when it doesn't. An operator who relies on reports is blind if they're wrong, so I'd treat honest reporting as part of the floor.
   - **A wrong early foundation.** A technical choice the factory makes alone can make everything after it expensive.
   - **Silent contradiction.** A later decision quietly undoes an earlier one and nobody notices.

3. **What an LLM can't reliably do today is a short list:**
   - Know an intent nobody has stated.
   - Act in the real world: accounts, payments, signatures.
   - Carry accountability.
   - Tell whether real users actually want the thing.

   I'd have the factory keep that list explicitly and ask a named person, in their terms, when it hits one. The list will shrink over time.

4. **Reporting should have a product default, not a setting to configure first.** The default report covers what was decided, what is running, and what it needs from the operator. More detail is available when asked for.

5. **Existing software should go through the same line.** The factory would first reconstruct the record a from-scratch conversation would have produced: why it exists, for whom, and what it must do. It marks what it's unsure of and confirms that with the operator. I agree that how this works, and how automatic intake works, is its own large question.

**One call for you:** should the factory always play back what it understood before building? My view: always at the start of a new software or when taking on an existing one. For later changes, only when the change touches the purpose or would be costly to undo.

**Next step:** I'd write the first whole draft of the line, from the opening conversation through running software and back round to intake. It would mark what's in, out and still open at each stage, on a page you can mark up. Say the word and I'll draft it, or keep going here if there's more you want to say first.

## Owner

(*) People other than the operator are named. I would say all the roles needed are part of the target users for our product and the product gives a way for those other people to come in in those steps. It could be one person or many. Including the primary operator, which might or might not be just one person.

1. I agree on all.
2. Yes they (and more if we missed them here, I mean I'm following the same rules as we discuss them haha) should also be incorporated in our product.
3. Sure, and our product should know that. But also, LLMs can produce useful information regardless, with reasoning, so I do not know where to draw the line. Perhaps it only suggests and tries its best. I agree with your take.
4. I agree
5. Yes, and along with people, not fully automatically, if the parts of software conflict with each other or not automatically inferrable for example.

I agree on the one call you asked for me as well.

And maybe, if the users of our products have their own taste in parts of the software (I'm calling software that's built and product which we are making), such as user experience, technical things, minor features, etc. then they should be able to do that as well. Maybe for minor things that can just be ticket intakes. Or maybe reviewing before implementing can be chosen for things that are wished. I'm just rambling here and I'd rather avoid premature thinking for our product, but at the same time make it good.

## Assistant

Recording your latest points, then drafting the whole line as a page you can mark in, later or out. Writing the page now.

## Assistant

Your latest points are recorded, and the first draft of the whole line is up for you to mark: `docs/record/scope-page-draft-0.1.html`

**What I took from what you just said**

- **Everyone needed is a user of the product.** That covers the operator, who may be more than one person, and every other role. The product gives each a way in at their step.
- **Where an LLM can't reliably decide, it still gives its best attempt and proposes.** A person decides.
- **Existing software goes through the same line with people involved**, wherever parts conflict or can't be inferred.
- **Taste is in, with its shape left open on purpose.** Minor wishes come in as tickets, and review before building can be chosen per area.
- **Vocabulary:** "product" is the factory, "software" is what it builds. I use those words throughout the page.

**What the page holds**

- **The principles as cards**, so you can flag any I've got wrong.
- **One picture of the line.** The conversation runs along the top, the unattended steps along the bottom, and the record of intent sits in the middle.
- **A table of who has the last word** for each kind of decision.
- **26 items to mark in, later or out:**
  - 18 start on "in" because you said so.
  - 8 are edges you haven't spoken to, starting on my suggestion. Examples: keeping the software live for real users, acting in the real world, selling it, and other people installing the product.
- **Two calls:**
  - Who has the last word on taste by default. My suggestion: the product decides, and a person claims the areas they want to see first.
  - What the first version proves itself on. My suggestion: one small brand-new software, end to end.
- **Parked items**: how the floor works, how automatic intake works, and what existing software needs.
- **Where I think this can go wrong**: four risks, for you to argue with.

One place I differ from you: you put existing software in scope, and I agree it belongs. I'd still build it after new software works end to end, because it's the larger problem and could swallow the effort.

Change only what's wrong, queue your marks, and send them from the page. I'll be notified when you do. The page uses the review tool's default styling, since the product has no look of its own yet. I checked the wide layout but not a phone-width one.

## Owner

Thanks! I a thorough prior art (things built or just ideas, opinions available) research done as well, and then we can talk about what we want as we are doing now.

## Owner

Let's keep the lavish open, and we can come back to that later.

## Assistant

The review page stays open. I've written the instructions for the prior-art research and am starting the worker now.

## Assistant

The prior-art research is under way.

**What it will cover**
- **Three kinds of prior art, each labelled:** things actually built, ideas and proposals, and opinions, including critiques and sceptical takes.
- **The whole line, not just code-writing tools:** drawing out ideas and decisions, deciding what to build, specifying, building, checking, landing, running, reporting and intake, for both new and existing software.
- **The older, pre-LLM history of the "software factory" idea** and what became of it.

**What it will establish for each entry**
- Which parts of the line it covers and which it leaves to people.
- How it treats people and roles.
- How it handles the gap between what was wanted and what was understood.
- What it's opinionated about.
- Whether there's independent evidence it works, kept separate from the maker's own claims.

**What comes back**
- A one-page summary.
- A map of which parts of the line are crowded, thin or untouched.
- A side-by-side table of the entries closest to your factory.
- Where serious people disagree, the reported failures, and the open questions this raises for us.

Every claim will carry its source. It will not recommend what the factory should be; that stays for our conversation.

**Two things to know**
- The research worker's window shows it was switched to Opus 5.5 at high effort just after I started it on Fable 5.2 at the highest reasoning setting. I've taken that as your change and left it alone. Tell me if it wasn't you.
- The review page stays open as you asked, at `docs/record/scope-page-draft-0.1.html`. Nothing is lost if you leave it until after the research.

I'll bring you the findings when the report is in, and then we pick the conversation back up.

## Owner

Thing that comes to mind is that smilar to how we are doing prior work, this should also be in product I think. For me, I build what I want to use, so it can avoid effort, some or full. For somebody else, that might amount to finding what others are missing or market research.

## Owner

For maybe both, new or existing software.

## Assistant

Agreed, and recorded: looking at what already exists becomes a step of the line, for both new and existing software.

**How I'd shape it**

- **It sits after Why and Who, before What.** Once the problem and the users are known, the product looks at what's already out there before anyone decides what to build.
- **One step serves both motives.** For you it answers "can I skip some or all of this effort?". For someone else it answers "what are others missing?". The research is the same; only the question asked of it differs, and the product can tell which from the Why.
- **It has three possible outcomes:**
  - Don't build, use what exists.
  - Build on top of something that exists.
  - Build something different because there's a real gap.

  You said "some or full", so I take it the product is allowed to say "don't build this".
- **It repeats at smaller sizes.** The same look happens before a large feature or a big technical choice, not only at the start. For existing software it also asks whether something has appeared since that makes part of it unnecessary.
- **Depth follows your return-on-effort rule.** A quick look for a small thing, a thorough one for a big thing.

**One change this makes to the page**

I had "finds out whether real users want it" as a single edge item, suggested for later. It now splits in two:

- **What exists and what's missing** is work an LLM can do, so it goes in as this new step.
- **Whether real people actually want it** still needs real people, and stays where it was.

I haven't touched the open page, so any marks you've started there are safe. I'll add the step and the split when we come back to it.

The prior-art research is still running; I'll bring you its findings when it reports.

## Assistant

The prior-art research is finished. Full report: `docs/prior-art/report.md` (sections 2, 5 and 6 are the ones worth reading first).

**Headline:** nothing built covers the whole line you described. Several "software factories" launched in 2026, and the closest are 8090, Factory 2.0, Spec Kit and BMAD, and app builders like Lovable and Replit. Each covers a stretch and leaves the rest to people or other tools. Almost all the evidence for them is the makers' own claims.

**Where the field is crowded and where it's empty**
- **Crowded:** building, spec and plan checkpoints, AI code review, migrations of existing code that have tests to check against.
- **Thin:** deciding what to build, several people entering at their own steps, reporting at a detail the operator chooses, cost against value, recovering intent from existing code.
- **Not found anywhere:**
  - a product that owns the conversation and won't build until the problem and users are settled;
  - routing each question to the right person in their own terms;
  - keeping a record of rejected alternatives.

So the parts you care most about are the parts nobody has done. That is an opening, and it also means there's no evidence yet that they work.

**What supports what you've said**
- **Intent mismatch is the top reported failure.** Agents act on assumptions they never checked. They guess rather than ask, though asking helps by up to 74%.
- **Tolerable defects are bounded by stakes, not by speed gained.** Across sources the limit is data, security and production. That backs the floor we parked.
- **Recovered intent from existing code misses 44–65% of user goals.** That backs your "with people, not fully automatic".

**What challenges our draft**
- **Written specs didn't reduce defects** across 88,000 pull requests, and 81.5% of spec files are never updated. Our record of intent could rot the same way.
- **Human attention is the bottleneck, not build speed.** Review time rose 91% in one study, and agents spend about 80% of their time waiting on people. Every question and report we add costs the scarcest thing.
- **Agents game checks they can reach.** Tests get deleted and reports fabricated. The checking has to sit out of the builder's reach.
- **A reusable factory may be the wrong shape.** One well-known attempt collapsed on a model upgrade, and its author now argues the setup must be bonded to one application.
- **Non-expert operators are where security incidents cluster.** When the operator can't judge security, the product's defaults are the security.
- **The idea is old.** A 1970s US factory failed when requirements were split from building. The closest ancestor, a 1983 Air Force programme, stalled on scope and on languages people couldn't use.

**Your call:** the report suggests three follow-ups. I'd only do one before we design: a hands-on trial of the three tools closest to "settle the problem and users first" (Spec Kit, BMAD, Kiro), recording exactly what each asks and writes down. Want that run, or shall we go straight back to shaping?

The research worker's window is still open because it sits in the tab you're using; I'll clear it when that won't pull your focus. The review page is still open at `docs/record/scope-page-draft-0.1.html`.

## Owner

I'd rather not use anything else right now. Atleast if it is not what this product's vision is.

## Assistant

Understood. No trial, and nothing else gets brought in unless it matches this product's vision. That's recorded, and the research stands as reading only.

Back to shaping, then. The research raised four things that would change our draft. Here is my opinion on each, for you to agree with or correct.

1. **The record must be kept by the product, never by a person.**
   - Written specs rot because someone has to remember to update them.
   - I'd make updating the record part of every change the line makes, so it can't fall behind.
   - I'd keep it small: purpose, users, what it must do, decisions and their reasons, and the alternatives that were rejected. No implementation detail.

2. **People's attention is the thing to spend least of.**
   - The evidence says build speed isn't the limit; people reading and answering is.
   - So the product should decide and show its assumptions, not ask, whenever being wrong is cheap. A short visible list of "I assumed this" is cheaper to correct than a question is to answer.
   - This changes the say-back from a document to agree with into a short list of assumptions to strike out.

3. **Whatever checks the software must be out of the builder's reach.**
   - Agents game the checks they can touch.
   - I'd make the part that holds the intent and judges the running software separate from the part that builds, with no way for the builder to edit it.
   - This is also the best guard against the false report we talked about.

4. **Reusable product, or one setup bonded to each software?**
   - One serious voice says a general factory breaks on every model upgrade and must be built around one application.
   - My view: the general part is the conversation, the record and the order of the line. The build setup for each software can be specific to it and regenerated when models change.
   - This is the one I'm least sure of, and it's closest to a vision call, so I'd most like your view here.

A fifth point, security defaults for an operator who can't judge them, belongs with the floor we parked, so I've left it there.

## Owner

1. I agree for all but one part. Things that need to be updated, sure, yes, but things such as planning and whatnot, which is intended to be used right away can be detailed and thorough. Whether or not to maintain documentation for technical architecture and code (what exists, I'm unsure whether needs maintaining), as well as why what decisions are made is also needed long term.
2. I agree. I also think (for now, my opinion only) long paragraphs of information is harder to deal with for humans than a list of things. Be it code or anything.
3. Yeah, and it can be anything such as a review pass of an agent, or anything else. I agree with what you said though.
4. What needs to be updated runtime per software and what stays with the product can be decided. What I think is that the product in general should be able to be used for anything. It has all the prompts and application logic and stuff already decided, taking into account what I just said. The quality can depend on the LLM models used and so on.

## Assistant

Recorded. Here is how I take each, with my opinion where you left something open.

1. **Two kinds of record.**
   - **Lasting records** are kept current by the product: purpose, users, what it must do, decisions with their reasons, and rejected alternatives.
   - **Working records** are plans and the like, meant for use right away. They can be as detailed and thorough as the work needs, and nobody maintains them afterwards.
   - **Your open question, whether to maintain a description of what exists:** my opinion is no. The code is the truth about what exists, and an LLM can write a fresh description from it whenever someone needs one. A maintained copy only adds something that can go stale. What can't be recovered from code is why it's that way, so that's the part worth keeping.

2. **Lists over long paragraphs.** I've recorded this as how the product speaks to people, marked as your opinion for now. I agree with it. It also fits the attention point, since a list can be corrected item by item.

3. **The check can take any form.** Agreed. What matters is its independence:
   - it's a different agent from the builder;
   - it can't be edited by the builder;
   - it judges the running result against the intent, not against the builder's account of what it did.

4. **The product is general.** It's usable for any software, with its prompts and logic already decided. What gets set per software is still to be decided, and quality may rise or fall with the models used. One consequence I'd hold us to: the product's logic should be about the line and the records, not workarounds for one model's weaknesses. Workarounds are what broke on upgrade in the case from the research. Built that way, a better model makes the product better without a rewrite.

**Where I think we go next**

The remaining topics are either parked for the whole plan or already sitting on the review page. So I'd suggest:

1. I bring the page up to date with everything since: the step that looks at what already exists, the two kinds of record, attention, the independent check, and the general product.
2. You mark what's in, later and out.
3. I write the first proper vision statement from your marks, and we plan from that.

Say when you want the page refreshed. Or if there's more on your mind first, keep going here.

## Owner

I agree on your points.

I don't know though what is the outcome of this page. I'm happy to anyway, just saying.

## Assistant

Fair challenge. The page was meant to turn your in/out marks into the scope part of a vision statement, but most of it repeats things you've already told me. Making you read them again breaks the rule we just agreed about spending least of your attention. I'd drop the page and do it our own way: a short list of what I'm assuming, where you only strike out what's wrong.

**Already settled by you:** the whole line, the principles and the record, including everything you agreed to just now. You don't need to look at those again.

**Not yet said by you — my assumptions:**

1. **Keeping the software live for its real users** (hosting, staying up, incidents): later. For the first version, "running" means a place the people working with the product can open and try.
2. **Finding out whether real people want the software:** later, because it needs real people. Looking at what exists and what's missing is already in.
3. **Real-world acts** (opening accounts, paying, licences, signatures): out. The product names the person and tells them exactly what's needed.
4. **What the software's users read** (help text, user guide, release notes): in.
5. **Selling and supporting the software** (marketing, pricing, customer support): out.
6. **Looking after several softwares at once:** later.
7. **Other people setting the product up themselves:** later. It's designed for that from the start but proven on your work first.
8. **Any kind of software:** in, as you said. The first version proves itself on one kind you choose.
9. **Taste:** the product decides by default, and a person claims the areas they want to see before they're built.
10. **First proof:** one small brand-new software, end to end. Existing software follows once the line works.

**What comes out of this:** once you've struck out what's wrong, I write the first vision statement. It will be one short document saying what the product is, who it's for, what's in, later and out, and what's parked. We plan from that.

I'll close the review page once you've answered here, unless you'd rather keep it.

## Owner

1. I agree.
2. I don't understand. Needing real people is not out in our product, right? Is this the entire prior work/research part of our product you mean by this?
3. I agree.
4, 5, 6, I agree.
7. I agree, but sooner than fully deferred.
8, 9, 10, I agree.

And for the vision statement, I want you to only state the vision. Regardless of what we want to build now or later. Later could also be clearly part of the vision, you know.

## Assistant

You're right on item 2, and the first vision statement is written.

**Item 2, cleared up**
- No, needing real people is not out. I worded it badly.
- It is not the prior-work research. That step, looking at what exists and what's missing, is in the line as its own step.
- Item 2 was the narrower thing: putting the software in front of the people it's meant for and learning whether they want it. Under your rule they're simply more people the product gives a way in, so it's part of the vision. My "later" was only about build order.

**Item 7:** recorded as sooner than the other later items.

**The vision statement**

It's at `VISION.md`. It states the vision only, with no now-or-later split; build order is kept in a separate note. In short:

- **What it is:** one product that takes software from an idea to running software and keeps taking work back in, with LLMs doing everything an LLM can do.
- **Who it's for:**
  - Someone who knows what the software is for; that's all it requires of them.
  - The operator may be one person or several, technical or not.
  - Everyone else the software needs is a user too: people with taste in a part of it, people who decide what an LLM can't reliably decide, and the software's own users.
- **Principles:**
  1. If an LLM can do it, it does; return on effort decides, not perfection.
  2. If it can't reliably do it, it proposes and a person decides.
  3. The mistake that matters is a mismatch of intent.
  4. The whole line is the product, with nothing carried by hand.
  5. The product has opinions about the conversation and its records.
  6. It spends least of people's attention and speaks in lists.
  7. It reports honestly.
  8. Some things are never traded for speed.
  9. It's general, and a better model makes it better.
- **The line:**
  1. **Why:** clear the problem.
  2. **Who:** name the software's users.
  3. **What exists:** look at what's out there. The outcome can be don't build, build on something, or build different.
  4. **What:** what it must do and what matters more.
  5. **Say back:** a short list of assumptions to strike out.
  6. **Plan:** the product makes the technical decisions and records why.
  7. **Build:** unattended.
  8. **Check:** a separate agent, out of the builder's reach.
  9. **Run:** running software, kept live for its users.
  10. **Report:** what was decided, what's running, what's needed.
  11. **Intake:** from people, from the product itself, and picked up automatically.

  Existing software enters the same line by rebuilding the record with people.
- **The record:**
  - Lasting records are kept current by the product.
  - Working records such as plans are detailed and not maintained.
  - A description of what exists is written from the code on demand.
- **Taste:** the product decides by default; a person claims the areas they want to see first.
- **Also part of it:**
  - knowing what work costs;
  - writing what the software's users read;
  - finding out whether real people want the software;
  - several softwares at once;
  - other people setting it up themselves.
- **Not the product's job:** acting in the real world (it names the person and what's needed), and selling or supporting the software.
- **Not yet worked out:**
  - what exactly is never traded for speed;
  - how automatic intake works;
  - what existing software requires;
  - what's set per software versus what stays with the product.

I've closed the review page, since this replaces it.

Strike out or change anything that isn't how you see it. Once it reads right to you, the next step is the plan: the order to build in, and what the first proof is.

## Assistant

Shipshape.

## Owner

No I think then item 2 is out. Intake is in, and those people can say their opinion through that, and just saying that the operators can actually look in the real world whether anybody uses the software and decide what is the problem themselves. So later it is. It can be talking about why people don't want it if we are solving the problem. Could be that we solved the wrong one, or there are other problems.

## Assistant

I've changed the vision statement to match. It now reads this way:

- **Removed:** the line saying the product finds out whether real people want the software.
- **Added under "not the product's job":** finding that out on its own. People's opinions arrive through intake, and the operator sees for themselves whether anybody uses the software.
- **Added to intake:** when people don't want the software, the product goes back to Why with the operator. The wrong problem may have been solved, or there are other problems.

You said both "out" and "so later it is". I've written it as out of the vision as it stands, and noted an active version as at most a later idea. Tell me if you meant it the other way.

I agree with the change. It keeps the product from claiming to know something only the real world can show. It also keeps the part that is valuable: when the answer comes back "nobody wants this", the product reopens the problem instead of polishing the build.

The statement is still at `VISION.md`. Once it reads right to you, the next step is the plan: the order to build in, and what the first proof is.

## Owner

Suggest a good name for this :)

## Assistant

My pick: **premise**.

- **It says what the product is about.** Everything the product builds has to follow from a stated purpose. When the software comes out wrong in the way you care about, it's because the premise was wrong or misread.
- **It sits naturally beside entail.** A premise is what things follow from; entail is what follows. They're the same family without being the same thing.
- **It's short, lowercase and easy to say**, like your other names.

Four others, if that one doesn't land:

1. **corollary:** your own word from earlier, for software that follows from what was established. It's longer and harder to type.
2. **keel:** the first thing laid when a ship is built, and everything else is built on it. It fits the Why-first line and the nautical house style.
3. **slipway:** where a ship is built and then launched into the water. It covers "from idea to running" in one image.
4. **wright:** an old word for a maker, as in shipwright. It's short, though people may hear "Playwright".

I'd avoid "factory", "forge" and "foundry". They're heavily used already, and the research showed "software factory" carries fifty years of baggage.

I haven't checked any of these for clashes with existing products or taken repository names. Tell me which one you like and I'll check it before we commit to it.

## Owner

premise sounds good. And just so we are on the same page, I would say premise will do all the work entail does (if needed), and nobody has to use both.

## Assistant

Premise is now the name in the vision statement. I've also recorded that it stands alone: it does whatever of entail's work it needs itself, and nobody has to use both.

I checked the name as promised, and one result needs your call.

- **Your GitHub account:** no repository called premise exists there, so the name is free.
- **npm:** the package name "premise" is taken by an unrelated small library. That only matters if we ever publish a package under that exact name.
- **A clash in our own space:** a web search turned up an existing desktop app called [Premise](https://mbenachour.github.io/premise). The search summary describes it as:
  - one person's project, built on top of an AI coding tool;
  - a "structured layer" for defining requirements, planning and tracking architecture before code is written.

  I saw this through the search summary only and haven't read the page myself.

**What it means:** it looks like a small individual project, not a company, and it covers one stretch of what ours covers. But it has the same name in the same neighbourhood, and you want other people to be able to set ours up fairly soon, so some confusion is possible.

**My recommendation:** keep premise as the name. It fits too well to drop over one small project, and no repository exists yet, so nothing is locked in. When I put the repository to you for consent (name, owner, visibility, how changes ship), we confirm the name then. If the other project has grown by that point, **keel** is my fallback.

Do you want to keep premise on that basis, or would you rather settle on a different name now?

Sources:
- [Premise (mbenachour)](https://mbenachour.github.io/premise)

## Owner

Yes premise it is. Register our project, public on my github (omkarbhale), and write down I guess raw everything that should be persisted. Including why and how we are doing things, as well as for the decisions made, why they were made.

## Assistant

(Asked as a multiple-choice question.) Before I create the public premise repository under omkarbhale: how should changes to premise ship?

- Checked, I merge (recommended): product changes go through the full automated review-and-test run before a pull request; internal-only changes go straight to a pull request. I merge anything that passes and is in scope, and tell you in one line. Destructive or security-sensitive merges still come to you.
- Checked, you merge: same checks, but every pull request waits for your approval before it merges. This is the standard default; it costs your attention on each change.
- Fast, I merge: every change goes straight to a pull request with no automated review-and-test run, and I merge it. Fastest, least checked.

## Owner

Fast, I merge

## Owner

Don't write too much more (inferred) from what we talked, but at the same time, the repo should not miss anything this chat session has!

## Assistant

The public premise repository is created and registered. I'm now gathering the full conversation and records so a worker can write them into it.
