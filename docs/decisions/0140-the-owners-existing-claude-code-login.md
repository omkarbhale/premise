# 0140. premise uses the owner's existing Claude Code login; the configuration folder is a setting

- Status: Accepted, chosen for the owner; open to the owner's correction
- Supersedes: [0076](0076-own-claude-code-configuration.md)
- Scope: The plan
- Date: 2026-11-21
- Decided by: The assistant, for the owner, on the owner's instruction "choose for me" ([0136](0136-open-questions-chosen-for-the-owner.md)). Open to the owner's correction.
- Source: [The owner's instruction of 2026-11-21 that started the build](../record/instruction-2026-11-21-build-starts.md); [open questions](../open-questions.md) as they stood before it.

## Context

- [0076](0076-own-claude-code-configuration.md) gave premise its own Claude Code configuration folder, logged in once by the owner, so the owner's personal hooks, skills, memory and settings would not load into agents.
- Using that folder was still untested ([test record](../record/subscription-sandbox-test-2026-11-21.md)); the test used the default login.

## Decision

- By default premise runs Claude Code with the owner's existing login and configuration folder.
- The folder is a setting (`agents.claude_config_folder`): set it, and premise uses that folder instead.

## Reason

- One login less to set up and keep for someone who has not read the guide ([0135](0135-the-experience-works-without-the-guide.md)).
- Real agent runs are rare while premise is built ([0134](0134-the-owners-claude-login-only-when-strictly-necessary.md)), so the owner's settings loading into them matters less than one more login.
- The tested path is the default login.

## Alternatives considered

| Alternative | Why rejected |
| --- | --- |
| premise's own folder by default ([0076](0076-own-claude-code-configuration.md)) | One more login for the owner to make; kept as a setting. |

## Consequences

- **Supersedes** [0076](0076-own-claude-code-configuration.md).
- The agent runner still keeps agents from reading Claude Code's login ([0087](0087-agents-run-confined.md)).
- premise tells usage-ledger where its sessions are recorded: whichever folder is in use.

## Related

[0071](0071-headless-claude-code-agents.md), [0103](0103-subscription-only-for-the-owner.md), [0132](0132-sensible-things-are-configurable.md).
