# 0123. The reporter drafts release notes from met items only

- Status: Accepted
- Scope: The plan
- Date: 2026-11-21
- Decided by: The builders, in the documentation restructure of 2026-11-21. The owner did not make this choice.
- Source: The documentation restructure of 2026-11-21, writing the [reporter prompt](../prompts/reporter.md).

## Context

- What the software's users read (help text, guides, release notes) is part of the product ([0033](0033-answers-to-the-ten-assumptions.md), item 4).
- Old `docs/plan.md`, section 5: "Release notes for each change that reaches running are drafted from the record items it served." It names no agent role for this.
- Help text and guides are written by the builder as part of each task, and the checker checks that they match what the software does. Release notes are written after the check, when the change reaches running.

## Decision

- The reporter drafts the release notes for each change that reaches running, from the record items the change served and the check verdicts that were met.
- Items not met, or not checked, are left out of the release notes: they are not released behaviour. They stay in the report's "Failed or not checked" section.

## Reason

- The reporter already builds reports from recorded facts only ([0097](0097-reports-from-recorded-facts.md)); release notes drawn the same way cannot claim what the check did not show.
- Drafting short lines from facts is the fast-tier work the reporter does ([0104](0104-model-tier-by-role.md)).

## Alternatives considered

| Alternative | Why rejected |
| --- | --- |
| The builder writes the release notes with its change | The builder's account of its own work is not a source premise trusts ([0097](0097-reports-from-recorded-facts.md)), and it writes before the check knows what works. |
| Release notes listing every item the change served | Would announce behaviour the check found not met or could not check, which is a false report ([0056](0056-what-is-on-the-floor.md)). |

## Consequences

- The reporter's prompt has a release notes brief ([reporter prompt](../prompts/reporter.md)).
- Release notes and the change report come from the same facts and cannot disagree.

## Related

[0033](0033-answers-to-the-ten-assumptions.md), [0097](0097-reports-from-recorded-facts.md), [0098](0098-report-when-a-change-reaches-running.md), [0113](0113-agent-roles.md).
