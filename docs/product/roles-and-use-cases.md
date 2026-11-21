# Roles and use cases

premise's users are roles, not personas. Every person a software needs is a user of the product, one person or many, and each has a way in at their step and is asked in their own terms ([0009](../decisions/0009-everyone-needed-is-a-user.md)). All of them work in one session where everything is open, designed as if one person does everything; a role is a label on what is asked, so every ask still says which role it is for ([0065](../decisions/0065-one-open-session.md)).

Sources: [VISION.md](../../VISION.md#who-it-is-for), the [decision records](../decisions/README.md), and the plan's [line](../architecture/the-line.md) and [milestones](roadmap.md).

## The roles

### The operator

- Someone who knows what the software is for. That is all the product requires of them ([0008](../decisions/0008-operator-knows-the-purpose.md)).
- One person or several, technical or not. The design target stays a person who knows the purpose, so premise does not lean on anyone's engineering skill ([0008](../decisions/0008-operator-knows-the-purpose.md)).
- What premise asks of them, always in purpose terms:
  - once, what the software is for, in their own words (Why);
  - to strike or edit drafts: the problem, the users and roles, what the software must do (Why, Who, What);
  - to decide the outcome of What exists: do not build, build on something, or build something different ([0023](../decisions/0023-looking-at-what-exists.md));
  - to strike what is wrong in the say-back ([0028](../decisions/0028-say-back-as-assumptions-to-strike.md));
  - any change of purpose, including after a reading of held intake ([0095](../decisions/0095-what-is-held.md));
  - to reopen accepted defects if they want ([build, check and run](../architecture/build-check-run.md#check-0030));
  - optionally, per software, how much effort it gets (a share of weekly usage, or a priority) and which milestones to wait after; at a wait, to say when to go on ([0128](../decisions/0128-effort-per-software-and-milestone-waits.md)). The builders' reading is in [0129](../decisions/0129-builders-reading-of-effort-and-milestone-waits.md).
- Has the last word on purpose, users and priorities ([0084](../decisions/0084-who-has-the-last-word.md)).
- Can send a software back to any stage ([the line](../architecture/the-line.md#rules-for-every-stage)).
- Gives the feedback page's link to the software's users; that is the operator's act ([intake](../architecture/intake-and-reporting.md#intake-sources)).

### People with their own taste in a part of the software

- User experience, technical choices, minor features ([0022](../decisions/0022-people-can-put-in-their-taste.md)).
- By default premise decides. A person claims an area in the session, under a role and in their own words, for example "the look of the main screen" or "the API's naming".
- Before a claimed area is built, they see a proposal: a screenshot of a quick prototype, or a short list ([0102](../decisions/0102-taste-proposals-before-building.md), [0115](../decisions/0115-taste-prototypes-on-a-throwaway-branch.md)). It is decided under their role.
- What they say becomes `T` items in the record; checkable ones go into the checker's scenarios.
- Small wishes come in as intake.

### People who decide or do what an LLM cannot reliably decide or do

- What an LLM cannot reliably do today: know an intent nobody has stated; act in the real world (accounts, payments, signatures); carry accountability ([0007](../decisions/0007-llm-does-not-decide-what-it-cannot.md)). Whether real users want the thing is left to the operator and intake ([0036](../decisions/0036-finding-out-if-people-want-it-is-out.md)).
- premise gives its best attempt with its reasons, and asks under the role that decides or acts ([0084](../decisions/0084-who-has-the-last-word.md)).
- For a real-world act, premise names the role and exactly what is needed, and runs what it can meanwhile: for example an account with an outside service, a licensed system to run against, a payment ([build, check and run](../architecture/build-check-run.md#run)).
- Floor actions are asked by the gate under the role whose call it is ([0101](../decisions/0101-the-gate-asks-in-the-session.md)).
- With existing software, parts that conflict or cannot be inferred become questions labelled with the role they are for ([0019](../decisions/0019-existing-software-through-the-same-line.md)).

### The software's own users

- They use the running software. Their ideas, problems and opinions come in through intake: a feedback page per software, and the software's GitHub issues ([intake](../architecture/intake-and-reporting.md#intake-sources)).
- They are told where their item stands; a comment on a public issue goes through the gate because it is public and in the owner's name.
- Their opinions on whether the software is wanted are held and read together ([0095](../decisions/0095-what-is-held.md)); premise does not find out on its own whether they want it ([0036](../decisions/0036-finding-out-if-people-want-it-is-out.md)).
- They read what premise writes for them: help text, guides, release notes ([0033](../decisions/0033-answers-to-the-ten-assumptions.md), item 4).

### The owner of premise

- The person premise is being made for. Picks the first software when they want, one they need, which goes through premise as early as possible ([0050](../decisions/0050-first-software-is-the-owners-pick.md), [0127](../decisions/0127-first-software-is-one-the-owner-needs.md)); said to build the whole of premise ([0130](../decisions/0130-the-build-starts-and-covers-all-of-premise.md)), and asked the assistant to choose the open questions ([0136](../decisions/0136-open-questions-chosen-for-the-owner.md)).
- While premise is built, work stops for the owner only on destructive, security-sensitive, public-facing or money-spending actions ([0053](../decisions/0053-when-work-stops-for-the-owner.md)), with one short report per finished milestone ([0054](../decisions/0054-reports-to-the-owner.md)).
- While premise runs on the owner's machine, the owner is also the operator of the softwares premise builds there, and the only person whose subscription premise uses ([0103](../decisions/0103-subscription-only-for-the-owner.md)).

## Use cases

Each is drawn from the plan's line and its milestone demos.

### A new software from a one-paragraph idea

1. The operator says once what the software is for.
2. premise drafts the problem, the users and roles, and what it must do, each as a short list; the operator strikes and edits.
3. The researcher looks at what exists and recommends an outcome; the operator decides.
4. The say-back lists at most ten things premise understood and assumed; the operator strikes one, and the record changes to match.
5. The planner decides the technical side and records why; the first task is the smallest version that runs.
6. The builder builds; the checker, who never sees the builder's account, uses the running software and gives a verdict per item with evidence.
7. The software runs: a link on the page for a web app, a command and sample output for a command-line tool.
8. A short report says what was decided, what runs, what is needed and from whom, and what failed or was not checked.
Milestone 1 shows this for a command-line utility and a small web app ([0110](../decisions/0110-two-sample-softwares.md)).

### "Do not build"

- What exists finds something that already does the job. The operator decides not to build, and the line ends with a report ([the line](../architecture/the-line.md)).

### A claimed area

- A role claims "the look of the main screen". Before it is built, a screenshot of a quick prototype is shown under that role and decided there; other tasks go on ([0102](../decisions/0102-taste-proposals-before-building.md)). Milestone 3 shows this.

### Something only a person can do

- The software needs an account with an outside service. premise names the role and exactly what is needed, labels the ask with that role, and runs what it can meanwhile. Milestone 3 shows this.

### Intake from the software's users

- Bugs come in from the feedback page and GitHub issues and are fixed through the line; a wish that changes purpose is asked of the operator; opinions are held and read together into a short list; duplicates are merged and noise closed ([intake and reporting](../architecture/intake-and-reporting.md)). Milestone 4 shows this.

### Nobody wants the software

- Held opinions say people do not want it. The reading puts that to the operator, and premise goes back to Why with them: the wrong problem may have been solved, or there are other problems ([0036](../decisions/0036-finding-out-if-people-want-it-is-out.md)).

### A wait after a milestone

- For a software where the operator set one, premise stops after a milestone at running software and a report, and does not go on until the operator says to. That is where the operator judges whether the software is fixing the right problem, with the way back to Why ([0128](../decisions/0128-effort-per-software-and-milestone-waits.md); the reading is [0129](../decisions/0129-builders-reading-of-effort-and-milestone-waits.md)). Milestone 1 shows this.

### Taking on existing software

- premise drafts the record from the code, documentation, history and issues, marks every item `recovered`, asks where parts conflict or cannot be inferred, and says back the whole recovered record before anything is built ([existing software](../architecture/the-line.md#existing-software-milestone-6)). Milestone 6 shows this.

## Which role answers which ask

| Ask kind | Answered under | Record |
| --- | --- | --- |
| Draft of purpose, users, priorities; say-back | The operator | [0084](../decisions/0084-who-has-the-last-word.md) |
| What exists outcome | The operator | [0023](../decisions/0023-looking-at-what-exists.md) |
| Proposal for a claimed area | The role that claimed it | [0102](../decisions/0102-taste-proposals-before-building.md) |
| An intent nobody stated, a real-world act, accountability | The role that decides or acts | [0084](../decisions/0084-who-has-the-last-word.md) |
| Floor action (approval) | The role whose call it is | [0101](../decisions/0101-the-gate-asks-in-the-session.md) |
| Anything that follows from the record and is cheap to undo | Nobody: premise decides and records why, unless the area is claimed | [0084](../decisions/0084-who-has-the-last-word.md) |
