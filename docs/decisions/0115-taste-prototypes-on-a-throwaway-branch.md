# 0115. Taste proposals are built on a throwaway branch and captured by the server

- Status: Partly superseded by [0196](0196-roles-and-taste-in-one-session.md): for now a proposal is one or two described options written by the planner, with no prototype or screenshot
- Scope: The plan
- Date: 2026-11-21
- Decided by: The builders, in the documentation restructure of 2026-11-21. The owner did not make this choice.
- Source: The documentation restructure of 2026-11-21.

## Context
- Before a claimed area is built, a proposal is shown in the session under the claiming role: a screenshot of a quick prototype, or a short list ([0102](0102-taste-proposals-before-building.md)).
- The plan does not say which agent makes the prototype or who takes the screenshot.
- The checker must not build ([0030](0030-independent-check.md), [0089](0089-checker-in-a-fresh-session.md)).

## Decision
- For a claimed area, the builder builds a quick prototype as a task on a throwaway branch.
- The runner starts it confined ([0087](0087-agents-run-confined.md)).
- The server takes the screenshot with Playwright and shows it under the claiming role.
- Where a screenshot does not fit (an API's naming), the planner writes the short list instead.
- The branch is deleted after the decision. It holds no unmerged work anyone wants; deleting a branch with unmerged work would be a floor action ([0100](0100-floor-actions.md)).

## Reason
- P36 asks for something to look at.
- The builder is the agent that can make a running prototype.
- The server, not an agent, makes the screenshot, so the picture is of what runs.

## Alternatives considered
| Alternative | Why rejected |
| --- | --- |
| The drafter describes the area in words | P36 rejected a written description ([0102](0102-taste-proposals-before-building.md)). |
| The checker builds the prototype | The checker must not build. |

## Consequences
- The work queue has a `prototype` job kind ([work queue](../specs/work-queue.md)).
- Implemented by the [line engine](../specs/line-engine.md) and [runner](../specs/runner.md) specs.

## Related
[0022](0022-people-can-put-in-their-taste.md), [0113](0113-agent-roles.md).
