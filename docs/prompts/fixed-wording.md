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
| `{{floor_kind}}` | losing data, security, spending money, or acting publicly |
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

## Full text: gate approval card

````text
For {{role}} · {{software_name}}

premise wants to: {{action}}
This is on the floor: {{floor_kind}}.
Why: {{reason}}
Waiting on this: {{waiting}}. Everything else goes on.

[Approve this once] [Approve {{kind_label}} for {{software_name}}] [Decline]
````

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
{{item_id}}: done. It is in the running software.
````

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
