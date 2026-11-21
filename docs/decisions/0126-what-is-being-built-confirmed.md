# 0126. What is being built is confirmed: eight points, and the problem statement as written

- Status: Accepted
- Scope: The product
- Date: 2026-11-21
- Decided by: The owner. The owner asked twice whether premise is the software factory it was said to be, the assistant said back what is being built, and the owner answered: "All of what you said sounds fine".
- Source: [Conversation record, 2026-11-21](../record/conversation-2026-11-21.md).

## Context

- The owner doubled back: "Let's double back on not just the entire planning, but also, are we building a software factory like we said we should?" And again: "No, but for real for real, I don't mind accepting those if the thing we are building is what we want. Sorry I'm asking this twice now, but I don't want to rebuild it later. And I guess sure, rebuilding is part of software development, which I did for entail twice, and one other project of mine once because I knew what I wanted to solve only vaguely."
- The assistant named a gap: the problem statement in this repository is in the assistant's words (the old loop "broke at the hand-carried joins", [executive summary](../executive-summary.md#the-problem), [how we work](../how-we-work.md#why-premise-is-being-made)) and the owner had never confirmed it.
- The assistant then said back what is being built, in eight points:
  1. The owner brings an idea, and premise talks it through in a fixed order: why, who it is for, what already exists, what it must do.
  2. Before building, it shows a short list of what it understood, and the owner strikes out what is wrong.
  3. It then plans, builds and checks on its own, and hands over running software plus a short honest report.
  4. Work is never carried between tools by hand; people only talk to premise, in one web page.
  5. It keeps the reasons for every decision in the software's own repository, so later changes are judged against them.
  6. Bugs and wishes come back in on their own and go through the same line; it only stops for a person when a change touches the purpose.
  7. It works for any software, including existing ones later, and other people can run it later too.
  8. It is a product in its own right, not a better version of how the owner and the assistant work today.
- The assistant also said where a rebuild could come from:
  - low risk: running the agents, the independent checker, the safety rules, the plain technical base;
  - real risk: the conversation itself (eleven fixed stages may feel like paperwork; the record's shape may not suit), which only use can settle;
  - costly to undo: the record's format.
- The assistant made two recommendations: the owner confirms or corrects the problem statement; the first software through premise is one the owner actually needs, as early as possible, before the later milestones are built, with the two sample softwares kept as extra proof ([0127](0127-first-software-is-one-the-owner-needs.md)).

## Decision

- The eight points stand as what premise is being built to be.
- The problem statement stands as written.
- The owner confirmed this with: "All of what you said sounds fine". The assistant takes that as the eight points, the problem statement as written, and the recommendation about the first software ([0127](0127-first-software-is-one-the-owner-needs.md)).

## Reason

- The owner: "I don't want to rebuild it later." The owner accepts rebuilding as part of software development if what is being built is what the owner wants.

## Alternatives considered

| Alternative | Why rejected |
| --- | --- |
| The owner corrects the problem statement | The owner did not correct it. |

## Consequences

- No document changed because of the eight points: they restate the vision, the line and the existing records. The problem statement in the executive summary and the README now stands confirmed by this record.
- Where a rebuild could still come from is kept in [open questions](../open-questions.md): the conversation's fit, and the record's format.
- Building is still on hold ([0061](0061-nothing-built-until-the-owner-says.md)).

## Related

[0001](0001-build-the-factory-as-a-new-product.md), [0002](0002-rethink-everything.md), [0010](0010-the-whole-line-is-the-product.md), [0127](0127-first-software-is-one-the-owner-needs.md).
