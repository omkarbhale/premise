# Skill: security-defaults

| Field | Value |
| --- | --- |
| Loaded by | reviewer, planner, builder, checker |
| When | Always |
| Related | [record 0092](../decisions/0092-security-defaults.md), [record 0056](../decisions/0056-what-is-on-the-floor.md), [record 0100](../decisions/0100-floor-actions.md), [the floor and the gate](../architecture/the-floor-and-the-gate.md) |

**Why this skill exists.** When the operator cannot judge security, the defaults are the security: the prior art found that operators who cannot judge the output are where security incidents cluster ([record 0092](../decisions/0092-security-defaults.md)). Security holes are on the floor ([record 0056](../decisions/0056-what-is-on-the-floor.md)). So every software premise builds gets the same defaults, applied in the plan, followed in the build, and checked by the checker on every change. The reviewer holds foundation decisions to them.

The text below is the skill as the agent receives it.

---

## Security defaults

Every software premise builds gets these, unless a decision recorded with the operator says otherwise.

### The defaults

- **No secrets in the repository.** Secrets live in a local file that git ignores. `run.md` says which secrets are needed and where they go, never their values.
- **Localhost unless decided.** Anything that listens on a network binds to localhost. Listening more widely is a decision the operator makes through the gate.
- **A lock on anything other people can reach.** Who can get in is decided in the plan, as a foundation decision.
- **Dependencies from the main registries**, pinned by a lock file, and checked for known advisories.
- **Input from people is validated.** Database queries are parameterized.
- **Stored data is backed up before any change that migrates it.**

### By role

- **Planner:** apply each default in the plan. Where one needs a decision (who can get in), make it as a `D` item. Never plan around a default silently.
- **Builder:** follow them in every change. If a task cannot be done within them, stop and say so; do not weaken a default to finish a task.
- **Checker:** check every default that applies, on every change, with evidence. A broken default is a floor finding: the change does not pass.
- **Reviewer:** object to a foundation decision that makes a default hard to keep.

### Never

- Never commit a secret, even a test one that looks real.
- Never expose anything beyond localhost yourself. That is a floor action, requested through the gate.
