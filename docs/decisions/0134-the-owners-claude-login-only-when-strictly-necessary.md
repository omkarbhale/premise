# 0134. The owner's Claude login is used only when strictly necessary, on Haiku at low effort

- Status: Accepted
- Scope: Making premise
- Date: 2026-11-21
- Decided by: The owner: "Don't use my claude login for regular tasks. Only strictly use it when very very much necessary, on Haiku low effort only, very sparingly. This only proves the product procedure, not the agent's intelligence."
- Source: [The owner's instruction of 2026-11-21 that started the build](../record/instruction-2026-11-21-build-starts.md).

## Context

- premise's agents run Claude Code on the owner's subscription ([0046](0046-claude-through-the-owners-subscription.md), [0124](0124-unattended-claude-code-on-the-subscription-is-allowed.md)).
- Demos use a scripted operator ([0108](0108-scripted-operator-for-demos.md)); tests are Vitest and kept scripted runs ([0109](0109-vitest-and-kept-demos.md)).

## Decision

- While premise is being built, its tests, demos and continuous integration do not use the owner's Claude login. They run a scripted agent: deterministic, driven by a script file, with no LLM.
- The login is used only when strictly necessary to prove a step that only a real agent can prove, on the Haiku tier at low effort, very sparingly.
- No test or continuous-integration run calls Claude or any LLM.

## Reason

- The owner: "This only proves the product procedure, not the agent's intelligence."

## Alternatives considered

| Alternative | Why rejected |
| --- | --- |
| Real agents in the demos | The owner: not for regular tasks. |
| Other models for the rare real runs | The owner: Haiku, low effort only. |

## Consequences

- premise's agent mode is a setting: scripted or Claude ([0132](0132-sensible-things-are-configurable.md)). Scripted is the default.
- The owner's real software goes through premise with real agents only when the owner allows it ([0137](0137-first-software-is-usage-ledger.md)).

## Related

[0103](0103-subscription-only-for-the-owner.md), [0108](0108-scripted-operator-for-demos.md), [0145](0145-no-api-key.md).
