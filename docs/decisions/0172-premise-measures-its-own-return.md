# 0172. premise measures its own return, and shows it in reports

- Status: Accepted
- Scope: The plan
- Date: 2026-11-21
- Decided by: The owner, on the assistant's seven suggestions: "I agree on 1, 2, 3. Put 4, 5, on later. I agree on 6, 7, and I agree on what you said to push later." (suggestion 2)
- Source: [The owner on scale, direction and order](../record/scale-and-direction-2026-11-21.md)

## Context

- premise's value is the return on effort ([0006](0006-llm-does-what-it-can.md), [0169](0169-a-first-pass-need-not-be-perfect.md)), but nothing in the plan measured it.
- The assistant suggested four measures.

## Decision

- premise measures its own return, and shows it in its reports:
  1. minutes of people's attention spent;
  2. time from idea to running software;
  3. time from a reported problem to a running fix;
  4. how often something reported as working came back as a bug.
- The measures are per software, from recorded facts only ([0097](0097-reports-from-recorded-facts.md)); where a measure cannot be worked out, the report says so ([principle 7](../../VISION.md)).

## Reason

- Owner: "I agree on 1, 2, 3."
- Builders' note (not the owner's): premise's value is attention and time, and the owner agreed the question is return; these four are how to see it.

## Alternatives considered

| Alternative | Why rejected |
| --- | --- |
| Rely on cost alone | Cost does not show attention or time to a fix. |
| Measure only once other people use premise | The owner's use is the first test ([0175](0175-premise-is-used-for-real-as-soon-as-milestone-1-runs.md)). |

## Consequences

- The reporter gains these measures ([reporter spec](../specs/reporter.md)); built after thin intake and thin existing software ([roadmap](../product/roadmap.md)).
- Attention minutes are counted from the time people spend answering premise's questions; the cost figures stay mocked until usage-ledger exists ([0133](0133-usage-ledger-is-mocked-until-it-exists.md)).

## Related

[0016](0016-coarse-cost-tracking.md), [0027](0027-spend-least-of-peoples-attention.md), [0097](0097-reports-from-recorded-facts.md), [0169](0169-a-first-pass-need-not-be-perfect.md).
