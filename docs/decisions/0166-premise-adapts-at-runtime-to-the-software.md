# 0166. premise adapts at runtime to the software

- Status: Accepted
- Scope: The product
- Date: 2026-11-21
- Decided by: The owner, answering the assistant's first caution (that history sides with narrow tools): "That research could very well have been prior to large language models. For us, we can engineer premise to adapt at runtime for the software. And I want it to, as its vision."
- Source: [The owner on scale, direction and order](../record/scale-and-direction-2026-11-21.md)

## Context

- The assistant read the prior-art research as siding with narrow tools, and said that what can be general is the line; what differs per kind of software is how it is built, run and checked ([assessment](../record/direction-assessment-2026-11-21.md)).
- premise had no list of kinds of software ([0049](0049-any-kind-of-software.md)), and said nothing about how it learns what a given software needs.

## Decision

- There is no fixed list of kinds of software in premise.
- For each software, premise works out how to build it, run it and check it, and keeps that in the software's record.
- It corrects what it worked out through intake, like any other item.
- VISION.md gains this as part of the vision.
- Builders' note, inside this record: where premise cannot operate a software (for example, it cannot run it, or cannot reach what the check needs), it reports "could not check" and names what is needed, as principle 7 requires ([VISION.md](../../VISION.md)). It does not guess a pass. This note is the builders', not the owner's.

## Reason

- Owner: "we can engineer premise to adapt at runtime for the software. And I want it to, as its vision."
- Builders' note (not the owner's): reporting "could not check" is how the vision's honesty principle shows when adaptation falls short.

## Alternatives considered

| Alternative | Why rejected |
| --- | --- |
| A fixed list of supported kinds, each with its own checks | The owner wants adaptation at runtime, and a list is out of date the day a new kind arrives ([0049](0049-any-kind-of-software.md)). |
| Narrow premise to a few kinds, as the prior art suggests | The owner's reason: the research may be older than large language models. |

## Consequences

- [VISION.md](../../VISION.md) gains a short section on adapting to the software.
- The record holds, per software, how to build, run and check it ([record](../architecture/the-record.md)); the existing `run.md` and check scenarios already carry part of this ([0107](0107-one-part-knows-the-runtime.md), [0122](0122-scenarios-written-before-the-build.md)).
- A wrong way of building, running or checking is corrected through intake ([0062](0062-intake-goes-in-normally.md)).

## Related

[0049](0049-any-kind-of-software.md), [0165](0165-any-software-of-any-scale.md), [0168](0168-a-first-pass-need-not-be-perfect.md), [0122](0122-scenarios-written-before-the-build.md).
