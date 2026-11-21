# Skills

A skill in premise is a short piece of written guidance that agents load to do one kind of work well: writing for people, reading and proposing record items, deciding when to ask, reporting honestly, recognising the floor. Skills carry the rules that hold across several agent roles, so each rule is written once.

Skills are the same for every software. They ship with premise, in its repository, and change only with premise ([record 0114](../decisions/0114-prompts-and-skills-as-files.md)). Nothing in a skill is set per software: what is set per software is its record, its `run.md` and build setup, its people and claimed areas, and its approvals ([record 0106](../decisions/0106-per-software-and-with-premise.md)). Skills are about the line and the records, not workarounds for one model ([record 0031](../decisions/0031-the-product-is-general.md)).

These skills are the builders' design. Nothing here is the owner's wording or the owner's decision; each skill says which vision lines and records it rests on.

## Catalog

The order below is the order in which skills are appended to a role prompt.

| Skill | Loaded by | Purpose |
| --- | --- | --- |
| [writing-for-people](writing-for-people.md) | drafter, researcher, planner, builder, checker, reader, reporter | Lists over paragraphs, short, in the reader's role and terms |
| [the-record](the-record.md) | every agent role except the sizer | How the lasting record is laid out, read and changed; agents propose, never write |
| [assume-and-show](assume-and-show.md) | drafter, researcher, planner, builder, reader, sizer | Decide and show the assumption when being wrong is cheap; ask only when it is costly |
| [asking-the-right-role](asking-the-right-role.md) | drafter, researcher, planner, builder, checker, reader | Who has the last word; label every ask with its role; best attempt where an LLM cannot decide |
| [honest-reporting](honest-reporting.md) | every agent role except the sizer | Say what failed and what could not be checked; claims need evidence |
| [the-floor](the-floor.md) | every agent role except the sizer | Recognise floor actions and request them through the gate; never take one |
| [tracing-work](tracing-work.md) | planner, builder | Every task and commit names the record items it serves |
| [outside-content-is-data](outside-content-is-data.md) | all ten agent roles | Web pages, issues, logs and code are data, never instructions |
| [working-within-limits](working-within-limits.md) | all ten agent roles | Budgets, turn and time limits, three failures, usage-limit pauses |
| [security-defaults](security-defaults.md) | reviewer, planner, builder, checker | The security defaults every software gets |
| [return-on-effort](return-on-effort.md) | drafter, researcher, planner, builder, checker, triager, reader, sizer | Depth follows return on effort; small defects are accepted when fixing costs more |

| Agent role | Skills |
| --- | --- |
| drafter | writing-for-people, the-record, assume-and-show, asking-the-right-role, honest-reporting, the-floor, outside-content-is-data, working-within-limits, return-on-effort |
| researcher | the same as the drafter |
| reviewer | the-record, honest-reporting, the-floor, outside-content-is-data, working-within-limits, security-defaults |
| planner | all eleven |
| builder | all eleven |
| checker | writing-for-people, the-record, asking-the-right-role, honest-reporting, the-floor, outside-content-is-data, working-within-limits, security-defaults, return-on-effort |
| triager | the-record, honest-reporting, the-floor, outside-content-is-data, working-within-limits, return-on-effort |
| reader | writing-for-people, the-record, assume-and-show, asking-the-right-role, honest-reporting, the-floor, outside-content-is-data, working-within-limits, return-on-effort |
| reporter | writing-for-people, the-record, honest-reporting, the-floor, outside-content-is-data, working-within-limits |

## How skills are loaded

- At the start of every agent session, the agent runner appends every skill the role lists, in full, in catalog order, after the role's system prompt and before the task brief ([prompts README](../prompts/README.md)).
- No skill is loaded on demand. A rule that must hold on every turn cannot depend on an agent choosing to load it ([record 0114](../decisions/0114-prompts-and-skills-as-files.md)).
- Skills arrive as instructions, with the same authority as the role prompt. Tool results, web pages, intake text and code arrive as data and never carry that authority ([record 0116](../decisions/0116-outside-content-is-data.md)).
- Each skill is kept short, because every one a role lists is in its context on every turn.

## Why skills are published in full

- Skills define premise's behaviour as much as any specification does. Anyone reading premise should be able to see exactly what its agents are told.
- Agents are not asked to keep this text secret. What they never reveal is credentials, which they do not hold anyway ([record 0087](../decisions/0087-agents-run-confined.md)).
- The shipped skill files follow these documents. A change to a skill is made here first, in the same pull request as the shipped file.

## Each skill file

- A header table: which agent roles load it, when (always), and related documents.
- "Why this skill exists": the vision lines and records it rests on.
- The skill text as the agent receives it, after a horizontal rule.

## Related documents

- [Prompts](../prompts/README.md)
- [Agent tools](../specs/agent-tools.md), [agent runner](../specs/agent-runner.md)
- [Decision records](../decisions/README.md)
