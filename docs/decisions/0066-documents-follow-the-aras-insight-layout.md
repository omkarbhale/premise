# 0066. premise's documents follow aras-insight's layout

- Status: Accepted
- Scope: Making premise
- Date: 2026-11-21
- Decided by: The owner, agreeing to the assistant's proposal: "I liked the format of the entire repository for omkarbhale/aras-insight for planning, thoughts?" ... "Yeah go ahead".
- Source: The owner's words from the 2026-11-21 conversation, relayed with this restructure; not otherwise kept in this repository.

## Context

- premise's documents were a vision, one `docs/decisions.md` with every decision, and one `docs/plan.md` with the whole build plan ([0061](0061-nothing-built-until-the-owner-says.md)).
- The owner pointed to the layout of the public aras-insight repository, a specification-stage repository, and asked for thoughts. The assistant proposed adopting it; the owner agreed.

## Decision

The agreed proposal:
- premise adopts aras-insight's layout:
  - a README with what premise is, the problem, key capabilities, how it works, a status line and a map of the documents;
  - an executive summary;
  - `docs/product/` (scope, roles and use cases, roadmap);
  - `docs/architecture/` (an overview and topic documents);
  - `docs/decisions/`: one numbered decision record per file, with an index grouped by theme; a record is never edited to reverse it but superseded by a new one, both kept;
  - `docs/specs/`: one spec per module;
  - `docs/prompts/` and `docs/skills/`: the prompts and skills as documents;
  - a glossary and a list of open questions.
- premise keeps its own `docs/record/` (raw conversation and notes, never edited) and `docs/prior-art/` as they are.
- premise leaves out `docs/business/`, because premise is not being sold.
- Unlike aras-insight, every decision record says who decided, and quotes the owner where the call was the owner's, so nothing inferred passes as the owner's.
- The single `docs/decisions.md` and `docs/plan.md` are split into that layout without losing anything, and the specs and prompts the plan implies are written out.
- Documents only. The build stays on hold until the owner says to start ([0061](0061-nothing-built-until-the-owner-says.md)).

## Reason

- The owner: "I liked the format of the entire repository for omkarbhale/aras-insight for planning". No further reason was recorded.

## Alternatives considered

| Alternative | Why rejected |
| --- | --- |
| Keep the single `docs/decisions.md` and `docs/plan.md` (the status quo the proposal replaced) | No other alternative was put to the owner beyond the proposal. The owner agreed to the proposal instead; no further reason was recorded. |

## Consequences

- This set of documents. The old single files remain in git history (commit f62615a).
- Where the specs, prompts or skills need a choice no document makes, the builders make it and record it, with its reason and the alternative rejected (records [0111](0111-vision-stays-at-the-root.md) onward).
- The specs, prompts and skills are the builders' design; none of them is the owner's call.

## Related

[0039](0039-public-repository.md), [0061](0061-nothing-built-until-the-owner-says.md), [0111](0111-vision-stays-at-the-root.md), [0112](0112-record-numbering-keeps-old-entry-numbers.md), [decision records index](README.md).
