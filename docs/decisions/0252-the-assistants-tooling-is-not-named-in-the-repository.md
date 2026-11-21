# 0252. The tool name of the assistant's tooling is not written in the repository

- Status: Accepted
- Scope: Making premise
- Date: 2026-11-21
- Decided by: The owner: "Reword it" (said of the name of the assistant's tooling in the owner's own quoted instruction); the standing rule is the assistant's reading of it.
- Source: [The owner's instruction that started the build](../record/instruction-2026-11-21-build-starts.md), where one word is reworded at the owner's request; [0039](0039-public-repository.md).

## Context

- The repository is public ([0039](0039-public-repository.md)). The owner's instruction named the tool the assistant works through; the name of that tooling is not part of premise.

## Decision

1. **The repository says "the assistant"** and never the name of the assistant's tooling, in documents, code, commits, pull-request text and issues.
2. **Quotes are still the owner's words,** with that one word reworded and the record saying so.
3. **Private details do not go in:** no local paths, emails or private system names ([0081](0081-nothing-about-people-in-the-repository.md)).

## Reason

- The owner asked for it to be reworded; a public repository should not depend on a private tool's name.

## Alternatives considered

| Alternative | Why rejected |
| --- | --- |
| Keep the name in the quote | The owner asked to reword it. |

## Consequences

- Wording about who does the work is "the assistant", "the owner" and "the builders".
- Writing made before this rule, which names tools the owner and assistant discussed at the time, is left as recorded.

## Related

[0039](0039-public-repository.md), [0081](0081-nothing-about-people-in-the-repository.md).
