# 0111. VISION.md stays at the root

- Status: Accepted
- Scope: Making premise
- Date: 2026-11-21
- Decided by: The builders, in the documentation restructure of 2026-11-21. The owner did not make this choice.
- Source: The documentation restructure of 2026-11-21.

## Context
- The owner agreed that premise's documents follow aras-insight's layout, which keeps the vision in `docs/product/vision.md` ([0066](0066-documents-follow-the-aras-insight-layout.md)).
- The restructure left the choice open: move `VISION.md` into `docs/product/` with a pointer at the root, or keep it at the root and link it.
- The raw records, which are never edited, name `VISION.md` at the root ("It's at `VISION.md`", [conversation record](../record/conversation-2026-11-20.md)).

## Decision
- `VISION.md` stays at the repository root, unchanged.
- `docs/product/` has no `vision.md`.
- The README and the product documents link to `VISION.md`.

## Reason
- The raw records name `VISION.md` at the root.
- It is the document every other one follows from.
- A moved file would leave a stub that only points elsewhere.

## Alternatives considered
| Alternative | Why rejected |
| --- | --- |
| Move it to `docs/product/vision.md`, with a root `VISION.md` that only points to it | Two files for one text; the raw records would point at the stub. |

## Consequences
- The product section of the documentation map links to `../../VISION.md` from `docs/product/`.

## Related
[0035](0035-the-vision-states-the-vision-only.md), [0066](0066-documents-follow-the-aras-insight-layout.md).
