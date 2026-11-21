# 0132. What is sensible to configure in premise is configurable

- Status: Accepted
- Scope: The product
- Date: 2026-11-21
- Decided by: The owner: "Configurable options should exist in premise where sensible, such as, not limited to, number of agents that can run in parallel, configurable model/effort per type of task, etc."
- Source: [The owner's instruction of 2026-11-21 that started the build](../record/instruction-2026-11-21-build-starts.md).

## Context

- The specifications already name every limit, budget, interval and count as a default in a configuration table ([specifications](../specs/README.md#conventions-used-throughout)).

## Decision

- premise has one typed configuration with a default for every setting, read from a file in the data folder and from environment variables.
- At least these are configurable: how many agent sessions run at once; the model and effort for each type of task; whether agents are scripted or real; the Claude Code configuration folder; how usage figures are got (mocked or real); each software's default priority and milestone waits; time and turn limits.
- A setting that is wrong stops premise at start, with a plain message naming the setting and why.
- Every setting is listed in a [configuration reference](../reference/configuration.md) that is checked against the code.

## Reason

- The owner, as quoted above.

## Alternatives considered

| Alternative | Why rejected |
| --- | --- |
| Fixed values in the code | The owner asked for configurable options. |

## Consequences

- The defaults stay the ones the decision records give (two sessions at once, [0074](0074-two-agent-sessions-at-once.md); strongest tier for most roles, [0104](0104-model-tier-by-role.md)); changing them is a setting, not a code change.
- What a person needs to change most often is shown on the page, so they need not read the reference ([0135](0135-the-experience-works-without-the-guide.md)).

## Related

[0074](0074-two-agent-sessions-at-once.md), [0104](0104-model-tier-by-role.md), [0105](0105-tier-aliases.md), [0146](0146-configuration-in-one-json-file.md).
