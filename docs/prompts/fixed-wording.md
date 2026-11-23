# Fixed wording

| Field | Value |
| --- | --- |
| Runs on | No model. The server fills these texts from recorded facts and shows them on the page. |
| Used by | [gate](../specs/gate.md), [intake](../specs/intake.md), [line engine](../specs/line-engine.md), [agent runner](../specs/agent-runner.md), [reporter](../specs/reporter.md), [page](../specs/page.md) |
| Related | [records 0099](../decisions/0099-notices-in-the-session.md), [0101](../decisions/0101-the-gate-asks-in-the-session.md), [0118](../decisions/0118-how-chat-messages-are-routed.md), [0065](../decisions/0065-one-open-session.md) |

## Purpose

Some moments matter too much, or happen too often, to be worded by a model each time: asking for a floor action, telling someone where their item stands, saying that work has paused. This file holds that text. The server fills it from recorded facts, so no model can change what it says, and it can be tested.

## Design notes

- **Built from facts, not rewritten.** The gate's card shows exactly what will happen, taken from the request the server will carry out. A model never rewords it ([record 0101](../decisions/0101-the-gate-asks-in-the-session.md)).
- **Every ask names its role.** Everything is open in one session, designed as if one person does everything; each ask still says which role it is for ([record 0065](../decisions/0065-one-open-session.md)).
- **One line where one line will do.** People's attention is what premise spends least of ([record 0027](../decisions/0027-spend-least-of-peoples-attention.md)).
- **Nothing goes out in anyone's name without the gate.** Status lines for items said in the session are shown there. A status comment on a GitHub issue is public and in the owner's name, so it goes through the gate ([record 0101](../decisions/0101-the-gate-asks-in-the-session.md)).
- **Lines whose value is empty are left out**, never filled with "none".

## Placeholders

| Placeholder | Description |
| --- | --- |
| `{{role}}` | The role whose call it is, as named in the software's record |
| `{{software_name}}` | The software |
| `{{action}}` | Exactly what will happen, from the gate request: the command, the target, the amount |
| `{{floor_kind}}` | losing data, security, spending money, acting publicly, or changing a repository of the person's |
| `{{card_title}}` | The card's own title for the kind of action, such as "Add premise's record to your repository?" |
| `{{reality}}` | What really happens if approved, for that kind of action, in every mode |
| `{{why_now}}` | Why premise asks at this moment, for that kind of action |
| `{{reason}}` | Why the work needs it, from the request |
| `{{waiting}}` | The work that waits on the answer |
| `{{kind_label}}` | For an approval of a kind of action: the kind, for example "status comments on this software's issues" |
| `{{item_id}}` | An intake item's ID |
| `{{close_reason}}` | Why an item was closed |
| `{{merged_into}}` | The item a duplicate joined |
| `{{needed}}` | Exactly what a role must do or provide |
| `{{reset_time}}` | When the subscription's usage limit resets, as reported |
| `{{budget}}` | A software's budget, as set in usage-ledger |
| `{{task}}` | A task's title |
| `{{item}}` | A record item, ID and words |
| `{{restarts}}` | How many times the runner restarted a software |
| `{{stage}}` | A stage of the line |
| `{{effort}}` | A software's effort level: low, medium or high |
| `{{alternative}}` | The researcher's one line to use instead of building, such as an alias |
| `{{version}}` | The short commit of the version the runner started last |
| `{{minutes}}` | Minutes from an intake item arriving to its change running |
| `{{how_to_try}}` | From the latest run: open its link, or type its command in a terminal in its folder |
| `{{milestone}}` | A milestone's title |
| `{{next_milestone}}` | The title of the milestone after the one just reached |

## Full text: gate approval card

````text
{{card_title}}
For {{role}} · {{software_name}}

{{reality}}
premise wants to: {{action}}
This is on the floor: {{floor_kind}}.
Why: {{reason}}
Why now: {{why_now}} Waiting on this: {{waiting}}. Everything else goes on.

[Approve once] [Approve {{kind_label}} for {{software_name}} from now on] [Decline…]


- Each kind of action has its own title and standing-approval wording ([0220](../decisions/0220-approvals-and-verdicts-tell-the-truth.md)), for example "Add premise's record to your repository?" with "adding and updating premise's record in your repository", or "Create a private repository on GitHub for {{software_name}}?" with "creating private repositories on GitHub".
- `{{reality}}` is "This is real." or "Nothing happens yet." followed by the server's line for that kind of action, in every mode: for the record, "Even when the agents are scripted, approving writes a branch named premise with a premise/ folder to your repository on this machine. Nothing leaves this machine."; for GitHub with real agents, "Approving creates the private repository {{owner}}/{{name}} on your GitHub account, with the GitHub CLI you are logged in with, and pushes ..."; with scripted agents, "Nothing is created on GitHub whichever you choose: premise is running with scripted agents (a demo), and a demo does nothing outside this machine ..." ([0260](../decisions/0260-the-real-github-step-is-built-and-each-use-is-asked.md)).
- After the answer the session says one of: "Approved and done: ...", "Approved, but this step is not available yet: ...", "Approved, but nothing was done: ..." (a GitHub or remote step with scripted agents), "Approved, but it failed: ...", "Approved, but it did not all work: ..." (creating the GitHub repository, with what happened and what to do), or "Declined: ...".````

- The second button is not shown for deleting data or spending money: those are always asked one at a time.
- An approval is recorded with the time and can be withdrawn from the "needed" list.

## Full text: intake acknowledgement (in the session)

````text
Taken as {{item_id}}.
````

## Full text: sender status lines

Shown in the session for items said there. For a GitHub issue, the same line becomes a comment only through the gate.

````text
{{item_id}}: taken. It is going into the line.
````

````text
{{item_id}}: held. It will be read together with others like it, and you will see the outcome here.
````

````text
{{item_id}}: its fix is running in version {{version}}, {{minutes}} minutes after it came in. Try it: {{how_to_try}}. If the problem is still there, say so here.
````

For a wish or other change, "its change is running …" and "If it is not what you wanted, say so here." It never says "fixed": the check may not have judged it. The Intake tab shows the same, starting "Done: its change runs in version …".

````text
{{item_id}}: closed. {{close_reason}}
````

````text
{{item_id}}: joined {{merged_into}}, which asks for the same thing.
````

## Full text: "needed" list entry

````text
For {{role}} · {{software_name}}
Needed: {{needed}}
Waiting on this: {{waiting}}. Everything else goes on.
````

## Full text: draft and say-back cards

````text
For {{role}} · {{software_name}} · {{stage}}
premise's draft. Strike what is wrong, edit what is close, keep the rest.
Items marked "assumed" are premise's guesses.
````

````text
For {{role}} · {{software_name}} · say back
What premise understood and assumed. Strike anything wrong; each struck item goes back to its stage.
````

## Full text: scope check and changes to What

The scope check after What ([record 0191](../decisions/0191-scope-check-effort-and-milestones.md)):

````text
How much to build?
premise sorted what it must do into what you asked for, what premise recommends adding, and what it could also add. Pick how much to build; the choice already picked follows premise's usual effort ({{effort}}). You can move any item. The first version is what you asked for; what premise adds comes in a later milestone, after you have tried the first. What you leave out stays in the record and is not built; to have it built later, ask for it in the conversation.
````

When the software's effort is not premise's usual one, the second sentence says "the choice already picked follows the effort you set for this software ({{effort}})": a person who never chose an effort is not told they did. Each choice shows its rough time first and agent sessions second; a choice that costs the same as the one above it says why ("premise has nothing more to add here", or "what it adds fits in the same builds").

A change from intake to what the software must do, and a "do not build" recommendation ([record 0192](../decisions/0192-effort-in-proportion-to-what-was-asked.md)):

````text
This changes what it must do; confirm to change it ({{item_id}})
These lines are what changes in what the software must do. Strike or edit any that are wrong, then confirm to change it. Nothing else is asked before it is planned and built.
````

````text
premise recommends not building it: something already does this
Instead: {{alternative}}. Something that already exists does the job, which is the cheapest outcome: nothing to build, check or keep running. Pick "Do not build it" to stop here with a short report, or another choice to build it anyway. What was found is listed below.
````

## Full text: a milestone that stops

When the operator asked premise to stop after a milestone ([record 0191](../decisions/0191-scope-check-effort-and-milestones.md)). The card also shows how to try the software: "Open it" only when there is a link to open; for command-line software, the command and its folder; otherwise "Show me how to try it", which opens the report. "Go on" is the main button; "Go back to Why" is the quiet one.

````text
Milestone reached: {{milestone}}. Go on?
You asked premise to stop after this milestone. Try the software and read the report. "Go on" builds the next milestone, "{{next_milestone}}". If it is solving the wrong problem, "Go back to Why" redoes the work from Why with what you say then.
````

For the last milestone the middle sentence is: This is the last milestone, so "Go on" builds nothing more: premise finishes, and then takes in any problem or wish you send in the conversation.

After "Go on", in the conversation:

````text
You said go on. Next: premise builds the next milestone, "{{next_milestone}}".
````

````text
You said go on. That was the last milestone, so nothing more is built: premise finishes the line, then takes in any problem or wish you send here.
````

## Full text: notices

````text
Paused: the subscription's usage limit was reached. Work resumes at {{reset_time}}. Nothing was lost.
````

````text
Paused {{software_name}}: usage-ledger reports its budget of {{budget}} is overrun. Its work is paused until the operator decides.
````

````text
Stopped: {{task}} failed the same way three times. Needed from {{role}}: {{needed}}
````

````text
Stopped work on {{item}}: it did not pass its check in three rounds. Needed from {{role}}: {{needed}}
````

````text
{{software_name}} crashed and was restarted {{restarts}} times. It is stopped now; its logs are taken in as intake.
````

````text
Cost is not tracked yet.
````
