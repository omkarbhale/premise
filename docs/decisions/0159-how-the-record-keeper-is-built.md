# 0159. How the record keeper keeps the record, and the commits that carry it

- Status: Accepted
- Scope: Making premise
- Date: 2026-11-22
- Decided by: The builders, while building the record keeper. The owner did not make these choices.
- Source: [record keeper](../specs/record-keeper.md), [the record](../architecture/the-record.md), [0080](0080-record-in-the-softwares-repository.md), [0082](0082-record-as-markdown-with-ids.md), [0083](0083-trace-trailer-on-every-commit.md).

## Context

- The specification fixes the files, the IDs and the trailer, and leaves the finer shape of a line, the life of a repository and the steps of a change to the builders.

## Decision

Each is a builders' choice, open to correction:

1. **A software's repository starts with no commits.** Its first commit is its first accepted record change, so every commit premise makes has a trace trailer naming something that exists.
2. **The repository is on this machine first.** It lives at `repos/<software>/` in the data folder. Each job gets a working copy cloned from it under `work/<software>/<job>/`, on its own branch ([0086](0086-working-copy-and-branch-per-change.md)). A finished branch is merged with a merge commit that carries the union of its commits' trailers. A remote is added later and only pushed to, never forced.
3. **One small git module does all git work.** It runs `git` with an argument list, ignores the machine's own git settings, hooks and signing, and sets the author from `record.commit_author_name` and `record.commit_author_email`. It has no force push and no history rewriting.
4. **A line has its marks in parentheses, in a fixed order:** priority (W only), `from:`, `replaces:`, `foundation` (D only), `wait` (M only), `confirmed:`, and the date last. A struck item is `- ~~[W-3] text (marks)~~ struck 2026-11-22: reason`, and a replaced one ends its reason with `(replaced by W-7)`.
5. **The files hold headings and list items only,** except `run.md`, which is free text. A decision must say `Reason:` and `Rejected:`. An email address in an item is refused ([0081](0081-nothing-about-people-in-the-repository.md)). An item can only replace an item of its own kind, and can be replaced once.
6. **Marks that are not an item's meaning change in place.** A milestone's `wait` and the say-back's `confirmed:` are set with a `mark` operation, which keeps the ID. Everything else that changes meaning gets a new ID.
7. **A change moves through `reviewing`, then `at-say-back` when it replaces purpose, a user, a must or a foundation decision, then `accepted`, then `committed`;** a rejected change keeps its diagnostics. The reviewer's verdict and the say-back's outcome are applied by the line engine. The change stores the files it would produce and a hash of each file it was checked against, and refuses to write when a file has changed since.
8. **A record change goes in the same commit as code when the caller says so;** otherwise it is committed on its own with only the record folder.
9. **Before a push, every commit not yet on the remote is checked:** it needs the trailer, and every ID in it (except intake's `I-n`) must exist in the record at that commit, where struck items still count.
10. **Settings added:** `record.default_branch`, `record.commit_author_name`, `record.commit_author_email`, beside `record.folder` and `record.trailer`.

## Reason

- 1: a first commit without items would need an exception to the trailer rule, and the rule is meant to have none.
- 2: nothing leaves the machine until the owner approves it; the working copy and branch per change are already decided.
- 3: premise must behave the same on any machine, and a global setting such as signing must not stop a commit.
- 4 to 6: stable, parseable lines; people read them on GitHub, and a replacement or a wait flag must not break traces.
- 7 and 8: the specification's flow, with the check against a file changing underneath.
- 9: it is the specification's rule, applied at the commit it is about.

## Alternatives considered

| Alternative | Why rejected |
| --- | --- |
| A first commit with a trailer such as `none` | An exception to a rule meant to have none. |
| Change a milestone's wait by replacing the milestone | It would give the milestone a new ID each time and break its traces. |
| Parse freer Markdown | The record keeper must refuse malformed lines; free prose cannot be checked. |
| Fast-forward merges | A merge commit gives every merged job a commit with its own trailer. |

## Consequences

- The record keeper's specification, the storage specification and the roadmap are updated to say so.
- The table `record_changes` is added (schema 2). The table `reviews` is not: the review's verdict is kept on the change until the reviewer's own module exists.

## Related

[0080](0080-record-in-the-softwares-repository.md), [0082](0082-record-as-markdown-with-ids.md), [0083](0083-trace-trailer-on-every-commit.md), [0160](0160-milestones-are-record-items.md), [0161](0161-github-repository-step-not-approved.md).
