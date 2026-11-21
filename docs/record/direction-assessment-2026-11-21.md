# The assistant's assessment of the direction, 2026-11-21

The assistant's own read, given when the owner asked whether premise is going in the right direction, "not biased by what we are already building" ([the owner's words](scale-and-direction-2026-11-21.md)). It is the assistant's opinion, measured against the [prior-art report](../prior-art/report.md). It decided nothing by itself: the owner's replies are in the record above, and the only decisions taken from this exchange that concern the assistant's cautions are [0166](../decisions/0166-premise-adapts-at-runtime-to-the-software.md), [0168](../decisions/0168-a-first-pass-need-not-be-perfect.md) and [0169](../decisions/0169-what-may-be-split-is-decided-by-strong-prompting.md).

## Where the assistant thought premise is right

- On the problem: keeping hold of intent, spending people's attention carefully, checking what the builder cannot reach, keeping the reasons behind decisions, and keeping some actions structurally safe.
- On where the work is thin elsewhere: the prior art is crowded around building, checking and running, and thin around intent and the record.

## The three cautions, and the owner's answers

| Caution | What the assistant said | The owner's answer |
| --- | --- | --- |
| Generality | History sides with narrow tools. What can be general is the line; what differs per kind of software is how it is checked. | The research may be older than large language models; premise can adapt at runtime to the software, "as its vision" ([0166](../decisions/0166-premise-adapts-at-runtime-to-the-software.md)). |
| Ceremony before running | Writing specifications first was measured as slow and as not reducing defects. Running software and a wait after a milestone are the real guard. Sizing the ceremony to the change is supported. | A first pass need not be perfect; if it saves time and intake can fix the problems, premise works ([0168](../decisions/0168-a-first-pass-need-not-be-perfect.md)). |
| Orchestration | Splitting work across several agents is the least proven part of the field, breaks when the model changes, and costs more. So the work-items piece should be built thin: sizing picks the stages, a split only when a piece cannot fit one agent, no fan-out by default. | Stronger prompting decides what may be split: completely separate parts or very long parts; one heavy piece of work is not by itself a reason ([0169](../decisions/0169-what-may-be-split-is-decided-by-strong-prompting.md)). |

## One more observation

Most of the engineering so far goes into the crowded half (build, check, run). The half that sets premise apart is intent and the record. The assistant suggested using premise for real early, so that this is tested by use rather than by argument; the owner agreed ([0174](../decisions/0174-premise-is-used-for-real-as-soon-as-milestone-1-runs.md)).

## What the assistant said was missing from the plan as it stood

- Every stage was one agent making one draft.
- A software could not be split into modules that each have their own line.
- Intake items were not sized one by one.
- There was no check of a whole system built from pieces.

These are what [0167](../decisions/0167-any-piece-of-work-goes-through-the-same-line-at-its-own-size.md) and [0169](../decisions/0169-what-may-be-split-is-decided-by-strong-prompting.md) answer.
