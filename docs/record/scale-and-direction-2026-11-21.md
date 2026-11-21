# The owner on scale, direction and order, 2026-11-21

What the owner said, verbatim, in the conversation of 2026-11-21 that came after the build started ([instruction record](instruction-2026-11-21-build-starts.md)). "Owner" is the person premise is being made for; "the assistant" is the LLM agent the owner shaped premise with. Nothing the owner said is edited, including spelling. The assistant's side of the conversation is summarised in the [direction assessment](direction-assessment-2026-11-21.md), not copied.

## Scale and recursion

The owner asked:

> Also, are we considering building software of a much larger scale and stuff? Like: is the plan only a single agent single step always, similarly, is research or building and all of that stuff a single step per single agent? Build can be a ticket or a entire module or entire software. Similarly, for intake, a single intake entry might need just one task/agent/validation/etc or planning as well. Perhaps the intake also goes through the entire line, following the same principle. If it can be done by LLMs, it should.
>
> I'm curious if we considered this thoroughly.

The assistant answered that it had not been considered thoroughly. The owner then said:

> Premise should, as its vision, work for any software. Be it a small tool, enterprise app, or a monorepo. How close we can get to that is engineering

The owner then asked whether, in theory and not biased by what was already being built, premise was going in the right direction, given the prior-art research:

> I agree, real test is using it. But in theory, do you think we are going in the right direction? Not biased by what we are already building. I mean we did do prior art research for this

## The owner's replies to the assistant's three cautions

The assistant answered with three cautions ([assessment](direction-assessment-2026-11-21.md)). The owner replied:

> 1. That research could very well have been prior to large language models. For us, we can engineer premise to adapt at runtime for the software. And I want it to, as its vision.
> 2. I agree that perfection is not guarenteed in first pass, but if it saves time and the problems can be fixed with intake, then premise works. Again, ROI over value when work is done automatically. I mean, isn't that same for old fasioned way of programming anyway.
> 3. Yeah, so we need stronger prompting in decidng what can get split. Completely separate parts or very long parts might, one heavy work doesn't necessarily.

## The seven suggestions

The owner asked:

> Based on this, do you have any suggestions? Please give your opinion at your best capacity.

The assistant made seven suggestions:
1. Existing software much earlier, in a thin form: draft the record from the code, strike, take intake from there.
2. premise measures its own return: minutes of people's attention, time from idea to running, time from a reported problem to a running fix, how often something reported as working came back as a bug.
3. premise learns from corrections: a short list per software and a short list of the operator's taste that carries across softwares, each line tied to its correction, deletable.
4. The checker on a different model from the builder.
5. Tolerating commits made outside premise (hand work).
6. The page shows three phases (Understand, Build, Running), with the eleven stages as detail.
7. premise is used for real once milestone 1 runs: usage-ledger first, then premise's own remaining work.

It also suggested pushing hosting for other people, accounts and public deployment later, until two real softwares have run through premise.

The owner answered:

> I agree on 1, 2, 3. Put 4, 5, on later. I agree on 6, 7, and I agree on what you said to push later.

## What followed

- The decisions are records [0166](../decisions/0166-any-software-of-any-scale.md)–[0179](../decisions/0179-the-roadmap-is-reordered.md).
- The roadmap was reordered ([roadmap](../product/roadmap.md)); [VISION.md](../../VISION.md) became draft 5.
- Suggestions 4 and 5 were filed as GitHub issues 62 and 63.
