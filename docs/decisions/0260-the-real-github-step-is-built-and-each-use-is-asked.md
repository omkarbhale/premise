# 0260. The real GitHub step is built, and each use is asked through the gate

- Status: Accepted; points 4, 5 and 7 chosen for the owner, open to the owner's correction
- Supersedes: [0161](0161-github-repository-step-not-approved.md)
- Partly supersedes: [0220](0220-approvals-and-verdicts-tell-the-truth.md) point 3 (a push to a brought-in repository elsewhere is real only with real agents) and point 5 (what an approved GitHub step says)
- Scope: Making premise
- Date: 2026-11-23
- Decided by: The owner, on how it behaves: "Ideally the repo doesn't exist for new software, and already does for bringing in existing software, so mine is a one-off case." The builders, for how it is built; the points marked chosen for the owner are the assistant's, open to the owner's correction.
- Source: The owner's first real run reached the GitHub step and found it did nothing; [0051](0051-each-software-in-its-own-repository.md), [0059](0059-repository-visibility-per-software.md), [0077](0077-github-through-existing-cli-login.md), [0141](0141-github-repositories-in-tests-and-behind-the-gate.md), [0161](0161-github-repository-step-not-approved.md), [0220](0220-approvals-and-verdicts-tell-the-truth.md), [0246](0246-an-approved-action-that-never-finished-is-failed-at-start-up.md).

## Context

- Each software gets its own repository on the owner's GitHub account ([0051](0051-each-software-in-its-own-repository.md)), reached through the GitHub CLI login already on the machine, used only by the server ([0077](0077-github-through-existing-cli-login.md)).
- Until now the GitHub host was a stub that always answered "not available yet" ([0161](0161-github-repository-step-not-approved.md)). The owner's first real run approved the step and nothing happened.
- For a new software the repository does not exist yet; for software brought in it already does.

## Decision

1. **New software: premise creates the repository.** After the gate's approval at the end of Plan (asked once per software, or covered by a standing approval for creating repositories on GitHub), the server creates a repository named after the software on the account the GitHub CLI is logged in to, adds it as the software's remote, and pushes its code and record. After every later landing it pushes again. Agents never do any of this.
2. **Private unless the operator chose public.** A public repository is its own ask (`make-public`), as already modelled ([0059](0059-repository-visibility-per-software.md)).
3. **A name already used on the account is never adopted, overwritten or deleted.** premise says so plainly, creates nothing, and asks under Waiting on you: use a free name it suggests (the name with `-2`, `-3` and so on), write another name, or keep the software on this machine. A new name is asked through the gate again before anything is created. There is no option to take over an existing repository for a new software.
4. **The card says before the answer when GitHub cannot be reached** (chosen for the owner): it checks the GitHub CLI when it asks, and when it is missing or not logged in the card says so and how to fix it (`gh auth login`). Approving anyway creates nothing and premise offers to try again. The setup check reports the GitHub CLI's login too; premise still starts without it.
5. **Only real agents act outside this machine** (chosen for the owner). With scripted agents (tests, demos, a scripted look-around) nothing is created on GitHub and nothing is pushed to a repository elsewhere, whatever the answer, and the card says so ("Nothing happens yet."). A card asked with scripted agents is never carried out for real, even if premise was restarted with real agents before the answer. Writing to a brought-in repository on this machine stays real in every mode ([0220](0220-approvals-and-verdicts-tell-the-truth.md)).
6. **Outcomes are reported as they happened:** created and pushed, with the link; the name was taken, and nothing was created; not logged in, and nothing was created; created, but the push was refused, and what to do. Nothing is ever forced: a refused push leaves what is on GitHub as it is, and premise pushes again after the next change lands.
7. **A creation cut off by a restart is failed at start-up and never repeated by premise** ([0246](0246-an-approved-action-that-never-finished-is-failed-at-start-up.md)). For this action premise asks its own question in place of the general one (chosen for the owner): look on the account for the name; if it is not there, try again; if it is, premise will not use it, so pick another name or keep the software on this machine.
8. **Brought-in software:** the approved push of premise's record branch to the repository's own remote uses the person's own git login, and is the same code whether that remote is on this machine (as in the tests) or elsewhere.
9. **How it is built** (builders): the GitHub CLI wrapper in `src/git/github.ts` runs `gh api user`, `gh repo view` and `gh repo create`; pushes to a GitHub address use the GitHub CLI's login as the git credential helper for github.com, set in premise's own copy of the repository only, because premise's git ignores the machine's own git settings. Every push to GitHub (and the check of the remote before it) runs without holding up the server and within the setting `github.timeout_minutes`; the program is the setting `github.command`. Tests put a fake GitHub CLI first on the PATH (`test/fixtures/fake-gh`), which records every call and plays back success, a taken name, not logged in and a refused push; no test reaches GitHub or the network.

## Reason

- The owner's words settle the shape: a new software's repository does not exist, so premise makes it; one brought in exists, so premise only pushes its branch there.
- Builders' note: adopting a repository that happens to have the same name could push a software's code into someone else's project; saying so and offering another name costs one more answer.
- Chosen for the owner: a demo that reached GitHub would leave real repositories behind for a pretend run ([0141](0141-github-repositories-in-tests-and-behind-the-gate.md)); tying "outside this machine" to real agents keeps demos and tests harmless without another setting. Saying on the card that GitHub cannot be reached spends less attention than a failure after approving ([0027](0027-spend-least-of-peoples-attention.md)).

## Alternatives considered

| Alternative | Why rejected |
| --- | --- |
| Adopt an existing repository of the same name | The owner said not to build it for new software; it could overwrite someone's work. |
| A personal access token kept by premise | A new secret to create and store ([0077](0077-github-through-existing-cli-login.md)). |
| Create on GitHub in scripted mode too | Demos and tests would leave repositories on the owner's account. |
| Repeat a cut-off creation at start-up | It may already have happened; the floor forbids doing it twice ([0246](0246-an-approved-action-that-never-finished-is-failed-at-start-up.md)). |

## Consequences

- The real path has not been exercised against GitHub; the first real use is the owner's own approval on the page.
- New settings `github.command` and `github.timeout_minutes` ([configuration](../reference/configuration.md)); `line.remote` "github" now creates for real.
- Carried in the [gate](../specs/gate.md), the [record keeper](../specs/record-keeper.md), the [runner](../specs/runner.md) and the [fixed wording](../prompts/fixed-wording.md).

## Related

[0051](0051-each-software-in-its-own-repository.md), [0059](0059-repository-visibility-per-software.md), [0077](0077-github-through-existing-cli-login.md), [0141](0141-github-repositories-in-tests-and-behind-the-gate.md), [0161](0161-github-repository-step-not-approved.md), [0189](0189-how-taking-on-existing-software-is-built.md), [0220](0220-approvals-and-verdicts-tell-the-truth.md), [0246](0246-an-approved-action-that-never-finished-is-failed-at-start-up.md).
