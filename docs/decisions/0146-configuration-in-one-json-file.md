# 0146. Configuration is one JSON file in the data folder, checked against one schema, with environment overrides

- Status: Accepted
- Scope: The plan
- Date: 2026-11-21
- Decided by: The builders, while building the foundation. The owner did not make this choice.
- Source: [0132](0132-sensible-things-are-configurable.md).

## Context

- The owner asked for configurable options ([0132](0132-sensible-things-are-configurable.md)). The specifications list settings by dotted key, with defaults.

## Decision

- Settings live in `config.json` in the data folder; a missing file means every default.
- Any setting can be overridden by an environment variable: `PREMISE_` followed by the dotted key in capitals with each dot as a double underscore (`queue.max_agent_sessions` is `PREMISE_QUEUE__MAX_AGENT_SESSIONS`).
- The data folder itself comes from `--data`, then `PREMISE_DATA_FOLDER`, then `.premise` in the home folder, since the file lives inside it.
- One schema in the code defines every setting, its default, its limits and its meaning. The [configuration reference](../reference/configuration.md) is generated from it, and a test fails if the two differ.

## Reason

- JSON needs no extra parser and is what the page will write when settings become editable there.
- Generating the reference from the schema keeps the two from drifting.

## Alternatives considered

| Alternative | Why rejected |
| --- | --- |
| YAML or TOML | Another parser for no gain at this size. |
| The `settings` table only | A person cannot set anything before premise first starts. The table stays for changes made from the page. |

## Consequences

- Wrong settings stop premise at start, naming the setting and why ([0132](0132-sensible-things-are-configurable.md)).

## Related

[0072](0072-sqlite-state.md), [0132](0132-sensible-things-are-configurable.md).
