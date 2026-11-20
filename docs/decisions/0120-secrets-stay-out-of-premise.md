# 0120. A software's secrets are written by a person; premise never holds their values

- Status: Accepted
- Scope: The plan
- Date: 2026-11-21
- Decided by: The builders, in the documentation restructure of 2026-11-21. The owner did not make this choice.
- Source: The documentation restructure of 2026-11-21, writing the [runner](../specs/runner.md), [storage](../specs/storage.md) and [page](../specs/page.md) specifications.

## Context

- The security defaults say secrets are kept out of the repository, in a local file that git ignores ([0092](0092-security-defaults.md)).
- Handling credentials is a floor action ([0100](0100-floor-actions.md)), and agents hold no credentials ([0087](0087-agents-run-confined.md)).
- The runner starts each software from a clean copy, which holds no ignored file. The plan does not say where a software's secrets come from, or who puts them there.

## Decision

- Each software has a secrets file in premise's data folder, outside every working copy.
- When a software needs a secret (an outside service's key, for example), premise asks for it as an ask of kind `needed`, under the role that holds it: the page names the file and the key, and the person writes the value into that file on the machine.
- premise never takes a secret's value through the page, and never stores one in its database.
- The runner copies the file into the run copy, where git ignores it, when it starts the software.
- Agents never see the file: the data folder is closed to them. A check item that needs a real secret is `could-not-check` unless the role provides a separate test value the same way, marked for checks.

## Reason

- A value typed into the page would pass through premise's server and database, where it could leak into a transcript, a report or an agent's context.
- Writing a credential is handling credentials, on the floor; doing it by a person's own hand keeps premise out of it.

## Alternatives considered

| Alternative | Why rejected |
| --- | --- |
| Entering secrets in the page, stored by premise | premise would hold credentials, close to transcripts and agents; every entry would be a floor action. |
| Letting the builder or checker read the secrets file | Agents holding credentials is how the prior art's worst incidents happened ([0087](0087-agents-run-confined.md)). |

## Consequences

- Some check items stay `could-not-check` until a test value is given; reports say so ([0097](0097-reports-from-recorded-facts.md)).
- Starting a software that lacks a secret fails with the key named, and a `needed` ask.

## Related

[Runner](../specs/runner.md), [storage](../specs/storage.md), [page](../specs/page.md), [0092](0092-security-defaults.md), [0100](0100-floor-actions.md).
