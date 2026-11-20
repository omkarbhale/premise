# 0014. Guard against further sources of big mistakes

- Status: Accepted
- Scope: The product
- Date: 2026-11-20
- Decided by: The owner, agreeing to the assistant's three further sources: "Yes they (and more if we missed them here, I mean I'm following the same rules as we discuss them haha) should also be incorporated in our product."
- Source: [Conversation record](../record/conversation-2026-11-20.md); old docs/decisions.md entry 14.

## Context

- The owner had said "I don't know where mistakes could come from" ([0013](0013-mismatch-of-intent-is-the-mistake-that-matters.md)). The assistant named three more.

## Decision

- The product guards against a false report, a wrong early foundation, and silent contradiction, "and more if we missed them here" (Owner).

## Reason

- Assistant:
  - a false report leaves an operator who relies on reports blind ("I'd treat honest reporting as part of the floor");
  - a technical choice made alone early "can make everything after it expensive";
  - with silent contradiction "A later decision quietly undoes an earlier one and nobody notices."
- Owner: "I mean I'm following the same rules as we discuss them haha".

## Alternatives considered

| Alternative | Why rejected |
| --- | --- |
| None recorded | No alternative was put to the owner or recorded. |

## Consequences

- Vision principle 7: "It reports honestly, including what failed and what it could not check."
- False reports are on the floor ([0056](0056-what-is-on-the-floor.md)) and prevented by reports from recorded facts ([0097](0097-reports-from-recorded-facts.md)).
- Foundation decisions get a second agent's review ([the line](../architecture/the-line.md), [0113](0113-agent-roles.md)).
- Silent contradiction: every proposed record change is compared with the whole record ([the record](../architecture/the-record.md)).

## Related

[0013](0013-mismatch-of-intent-is-the-mistake-that-matters.md), [0015](0015-a-floor-never-traded-for-speed.md).
