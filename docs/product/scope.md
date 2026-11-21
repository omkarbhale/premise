# Scope

What is in premise, what is not its job, and what is not yet worked out. Everything here comes from [VISION.md](../../VISION.md) and the [decision records](../decisions/README.md). The vision states the vision only ([0035](../decisions/0035-the-vision-states-the-vision-only.md)), so "in" means part of the product as envisioned, whenever it is built. When each part is built is the [roadmap](roadmap.md).

premise sorts what it could cover three ways:
- **In:** part of the product.
- **Not the product's job:** premise names who must do it and exactly what is needed, or leaves it to people.
- **Not yet worked out in the vision:** the vision leaves it open; the builders' answer in the plan is linked.

## In

### The line ([0003](../decisions/0003-scope-ideas-to-built-software-with-intake.md), [0010](../decisions/0010-the-whole-line-is-the-product.md))

- From ideas and decisions to properly built software, from scratch, as well as handling intake.
- Every stage of the line, with nothing carried by hand: Why, Who, What exists, What, Say back, Plan, Build, Check, Run, Report, Intake ([the line](../architecture/the-line.md)).
- Two-way with the operator: drawing ideas and decisions out, taking the operator's ideas, giving ideas, asking questions ([0004](../decisions/0004-two-way-with-the-operator.md)).
- Clearing the problem first; writing plausible users with the operator when they are missing ([0011](../decisions/0011-opinionated-about-conversation-and-records.md)).
- Looking at what already exists, for new and existing software, with "do not build" as a possible outcome ([0023](../decisions/0023-looking-at-what-exists.md)).
- Saying back what was understood, as a short list of assumptions to strike out ([0020](../decisions/0020-when-to-say-back.md), [0028](../decisions/0028-say-back-as-assumptions-to-strike.md)).
- Making the technical decisions itself, each recorded with its reason ([VISION.md](../../VISION.md#the-line)).
- Building unattended; an independent check out of the builder's reach ([0030](../decisions/0030-independent-check.md)).
- Ending at running software people can open, not merged code ([0017](../decisions/0017-the-line-ends-at-running-software.md)), and keeping it live for its real users ([0033](../decisions/0033-answers-to-the-ten-assumptions.md), item 1).
- Reporting with a product default: what was decided, what is running, what is needed and from whom; more detail when asked ([0012](../decisions/0012-reporting-with-a-product-default.md)).
- Intake from the operator, other people, the software's users and the product itself, picked up automatically; going back to Why when people do not want the software ([0018](../decisions/0018-existing-software-and-automatic-intake.md), [0036](../decisions/0036-finding-out-if-people-want-it-is-out.md)).
- Existing software, through the same line, with people where parts conflict or cannot be inferred ([0018](../decisions/0018-existing-software-and-automatic-intake.md), [0019](../decisions/0019-existing-software-through-the-same-line.md)).

### People ([0008](../decisions/0008-operator-knows-the-purpose.md), [0009](../decisions/0009-everyone-needed-is-a-user.md))

- An operator who knows what the software is for; one person or several, technical or not.
- Every other person the software needs, each with a way in at their step and asked in their own terms ([roles and use cases](roles-and-use-cases.md)).
- Taste: people can put their own taste into any part of the software; by default premise decides, and a person claims the areas they want to see before they are built ([0022](../decisions/0022-people-can-put-in-their-taste.md)).
- Where an LLM cannot reliably decide, it gives its best attempt and proposes; a person decides ([0007](../decisions/0007-llm-does-not-decide-what-it-cannot.md)).

### The record ([0025](../decisions/0025-two-kinds-of-record.md), [0026](../decisions/0026-no-maintained-description-of-what-exists.md))

- Lasting records kept current by the product as part of every change: purpose, users, what the software must do, decisions with their reasons, rejected alternatives. Every built piece traces to the intent behind it.
- Working records as detailed as the work needs, not maintained afterwards.
- No maintained description of what exists; it is written from the code when someone needs it.

### Also part of the product ([VISION.md](../../VISION.md#also-part-of-the-product))

- Knowing what each piece of work costs ([0016](../decisions/0016-coarse-cost-tracking.md)), through usage-ledger ([0064](../decisions/0064-cost-and-spending-limit-from-usage-ledger.md)), with a spending limit ([0048](../decisions/0048-a-spending-limit.md)).
- Writing what the software's users read: help text, guides, release notes ([0033](../decisions/0033-answers-to-the-ten-assumptions.md), item 4).
- Looking after several softwares at once ([0033](../decisions/0033-answers-to-the-ten-assumptions.md), item 6).
- Per software, optionally: how much effort it gets, as a share of weekly usage or by priority, and milestones with a wait after them ([0128](../decisions/0128-effort-per-software-and-milestone-waits.md)). How it works is the builders' reading, open to the owner's correction ([0129](../decisions/0129-builders-reading-of-effort-and-milestone-waits.md)).
- Other people setting premise up and running it themselves ([0033](../decisions/0033-answers-to-the-ten-assumptions.md), item 7).
- Any kind of software; no first kind ([0049](../decisions/0049-any-kind-of-software.md), [0057](../decisions/0057-vision-stays-any-software.md)).
- Nobody has to use another tool alongside premise; it may be built on other tools underneath ([0063](../decisions/0063-premise-may-depend-on-other-tools.md)).

### Never traded for speed ([0015](../decisions/0015-a-floor-never-traded-for-speed.md), [0056](../decisions/0056-what-is-on-the-floor.md))

- Losing data, security holes, spending money, acting publicly in someone's name, false reports. How premise slows down for each: [the floor and the gate](../architecture/the-floor-and-the-gate.md).

## Not the product's job

From the vision's "What the product does not do":

| Item | What premise does instead | Record |
| --- | --- | --- |
| Acting in the real world: opening accounts, paying, licences, signing | Names the person and tells them exactly what is needed | [0033](../decisions/0033-answers-to-the-ten-assumptions.md), item 3 |
| Selling or supporting the software: marketing, pricing, customer support | Nothing | [0033](../decisions/0033-answers-to-the-ten-assumptions.md), item 5 |
| Finding out on its own whether real people want the software | People's opinions arrive through intake; the operator sees for themselves whether anybody uses it; premise goes back to Why with the operator when people do not want it | [0036](../decisions/0036-finding-out-if-people-want-it-is-out.md) (whether the owner meant "out" or "later" is an [open question](../open-questions.md)) |

## Not yet worked out in the vision

The vision lists four things not yet worked out. The owner handed them to the builders ([0042](../decisions/0042-plan-top-down-settle-owner-calls-first.md)); the plan answers each, and the vision text is unchanged.

| Not yet worked out | The builders' answer |
| --- | --- |
| What exactly is never traded for speed, and how the product slows down for it | What is on the floor: the owner ([0056](../decisions/0056-what-is-on-the-floor.md)). How: [0100](../decisions/0100-floor-actions.md), [0101](../decisions/0101-the-gate-asks-in-the-session.md), [the floor and the gate](../architecture/the-floor-and-the-gate.md) |
| How automatic intake works | [0094](../decisions/0094-triager-reads-every-item.md)–[0096](../decisions/0096-when-held-items-are-read.md), [intake and reporting](../architecture/intake-and-reporting.md) |
| What taking on existing software requires | [Existing software](../architecture/the-line.md#existing-software-milestone-6), milestone 6 |
| What is set per software and what stays with the product | [0106](../decisions/0106-per-software-and-with-premise.md) |

## How premise itself is made

Not part of the product, but decided with the owner: public repository on the owner's GitHub ([0039](../decisions/0039-public-repository.md)); licence all rights reserved ([0055](../decisions/0055-all-rights-reserved.md)); changes as pull requests the assistant merges ([0040](../decisions/0040-fast-i-merge.md), [0052](../decisions/0052-fast-i-merge-reconfirmed.md)); runs on the owner's machine first ([0043](../decisions/0043-runs-on-the-owners-machine-first.md)); one browser page and one open session ([0044](../decisions/0044-one-browser-page.md), [0065](../decisions/0065-one-open-session.md)); TypeScript ([0047](../decisions/0047-typescript.md)); Claude through the owner's subscription first ([0046](../decisions/0046-claude-through-the-owners-subscription.md)). See [how we work](../how-we-work.md).
