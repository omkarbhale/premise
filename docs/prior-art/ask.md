# What the prior-art research was asked to do

## Owner's intent
"I [want] a thorough prior art (things built or just ideas, opinions available) research done as well, and then we can talk about what we want as we are doing now."

The research is prior art for a software factory that is being shaped in conversation and does not exist yet: no repository, no design. The description of it so far, in the same voice:

- "Everything from ideas and decisions to a properly built software, from scratch, as well as handling intake. It should also help get the ideas and decisions from the operator, take ideas from the operator, as well as give ideas to the operator or ask questions. It can be via any implementation detail that supports all that we want."
- "My main idea is that: if something can be done by LLMs, it should be done by LLMs. And what decides that is ROI rather than perfection. I can accept defects if it speeds things up considerably, for example. I would go so far as to say even a single person who knows what the purpose of building a sofware is, should be able to."
- "if something can't be done by LLMs it shouldn't. There's less of what LLMs can't do, but while thinking we also think of this. So perhaps along with the operator if there are other people needed, we say so or maybe use LLMs with that considered."
- "The pipeline is also our product. After this said conversation (if we have it), if somebody has to go to a chat interface and ask the LLM to do the coding, that is also something that can be automated but it isn't. The same thing can go for a lot of things in the entire pipeline. And how to separate and group out and write persisted records on the conversation, and where should the conversation start and go is also owned by the product. Our product is opinionated here. If target users aren't defined for example, then the product might write the plausible once with the help of the operator. If the problem statement is not defined, the product might get that cleared first as part of why to build this, and so on. In this pipeline, reporting to the operator is also included, if a software is big, the operator should be kept upto date in the level of detail he wishes to be kept (or same always as opinion of our product maybe)"
- "small bugs are no problem perhaps. The big mistakes are when there is a mismatch between the intent wanted and what was inferred"
- "Existing software too. So perhaps we can have automatic intake as well. How so is a big question of itself, along with what is needed for existing softwares."
- "Yes it has to run."
- "all the roles needed are part of the target users for our product and the product gives a way for those other people to come in in those steps. It could be one person or many. Including the primary operator, which might or might not be just one person."
- "if the users of our products have their own taste in parts of the software ... such as user experience, technical things, minor features, etc. then they should be able to do that as well."

Vocabulary used in that conversation: the "product" is the factory being made; the "software" is what the product builds.

## Firstmate spec
Produce a thorough prior-art report for the software factory described above. Research only: no design for the product, no code, no repository, nothing published anywhere.

What counts as prior art, per the ask: things actually built (products, open-source projects, internal systems that have been written up), ideas and proposals (papers, essays, manifestos, talks), and opinions (practitioner write-ups, critiques, post-mortems, sceptical takes). Cover all three, and label each entry as built, idea or opinion.

Search the open web as it stands today (run `date` for the current date; this field moves monthly, so prefer recent sources and say when a source is old). Find the field yourself: search for systems and writing that try to take software from intent to running software with LLMs doing the work, and for each part of that line on its own. Go wider than tools that only write code from a prompt: the ask spans eliciting ideas and decisions from people, deciding what to build, specifying, building, checking, landing, running, reporting, and taking work back in, for both new and existing software. Include the older, pre-LLM history of the "software factory" idea and what became of it, since the name has been used before.

For every entry worth keeping, establish from its own primary source where one exists:
1. What it is and who made it, with links.
2. Which parts of the line it covers and which it leaves to people: intake, deciding what to build, eliciting and recording intent, specification, technical planning, build, verification, landing, running or deploying, reporting, feedback and automatic intake, existing software, cost tracking.
3. How it treats people: which roles exist, where a person enters, what a person must know, what they are asked and in what terms.
4. How it handles the gap between what was wanted and what was understood, and its stance on speed against defects.
5. What it is opinionated about: where the conversation starts and goes, what records it keeps and how they are structured.
6. Evidence that it works or does not: real use, published results, reported failures, independent criticism. Separate the maker's claims from independent evidence.

Then synthesise, still as findings and not as a design:
- A map of the field: which parts of the line are crowded, which are thin, which nobody appears to have attempted.
- The approaches that recur and the places where serious people disagree, with the strongest version of each side.
- Reported failure modes and what was learned from them.
- The entries closest to the whole described factory, compared side by side in a table.
- Open questions the prior art raises that the people shaping this factory would want to have considered.

Evidence standard: every factual claim carries its source URL and the date you read it. Say plainly whether you read the primary source or a secondhand account, and list what you looked for and could not verify. Do not fill a gap from memory; a name you recall is a lead to check, never a finding. Where you run a tool to try it, record the commands and output.

Breadth matters here: use parallel sub-agents to cover the areas independently, then verify and merge their findings yourself before writing, since a sub-agent's summary is a lead until you have checked its sources.

Report shape: a summary of at most one page at the top that a reader can act on alone, then the map, the side-by-side table, the entries grouped by the part of the line they cover, the disagreements, the failure modes, the open questions, and the source list. Plain Markdown text; no visual artifact.

Out of scope: recommending what this factory should be, choosing its name, architecture or tooling, and evaluating the owner's own existing tools.
