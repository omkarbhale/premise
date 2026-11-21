# 0033. Answers to the ten assumptions

- Status: Partly superseded by [0049](0049-any-kind-of-software.md): item 8's "The first version proves itself on one kind the owner chooses"; and by [0178](0178-hosting-for-others-accounts-and-public-deployment-pushed-later.md): item 7's "sooner than fully deferred"
- Scope: The product
- Date: 2026-11-20
- Decided by: The owner, answering the assistant's ten assumptions: "1. I agree. 2. I don't understand. ... 3. I agree. 4, 5, 6, I agree. 7. I agree, but sooner than fully deferred. 8, 9, 10, I agree."
- Source: [Conversation record](../record/conversation-2026-11-20.md); [shaping notes](../record/shaping-notes-2026-11-20.md); old docs/decisions.md entry 33.

## Context

- After the review page was dropped ([0032](0032-drop-the-review-page.md)), the assistant listed ten assumptions on what the owner had not yet said, for the owner to strike out.
- The owner agreed to 1, 3, 4, 5, 6, 8, 9 and 10, changed 7, and questioned 2.

## Decision

1. **Keeping the software live for its real users** (hosting, staying up, incidents): later. For the first version, "running" means a place the people working with the product can open and try. Agreed.
2. **Finding out whether real people want the software:** see [0036](0036-finding-out-if-people-want-it-is-out.md).
3. **Real-world acts** (opening accounts, paying, licences, signatures): out. The product names the person and tells them exactly what is needed. Agreed.
4. **What the software's users read** (help text, user guide, release notes): in. Agreed.
5. **Selling and supporting the software** (marketing, pricing, customer support): out. Agreed.
6. **Looking after several softwares at once:** later. Agreed.
7. **Other people setting the product up themselves:** the assistant proposed later, "designed for that from the start but proven on your work first". Owner: "I agree, but sooner than fully deferred." Recorded as sooner than the other later items.
8. **Any kind of software:** in. The first version proves itself on one kind the owner chooses. Agreed. Changed later: there is no first kind ([0049](0049-any-kind-of-software.md)).
9. **Taste:** see [0022](0022-people-can-put-in-their-taste.md). Agreed.
10. **First proof:** see [0034](0034-first-proof-new-software.md). Agreed.

## Reason

- No reasons were recorded for 1, 3, 4, 5, 6 and 8 beyond the assumption text itself.

## Alternatives considered

| Alternative | Why rejected |
| --- | --- |
| Item 7 as fully deferred, like the other later items | The owner: "I agree, but sooner than fully deferred." |

## Consequences

- Items 3, 4 and 5 are in the vision ("What the product does not do"; "It writes what the software's users read").
- Items 1, 6 and 7 are in the build order ([roadmap](../product/roadmap.md)): keeping software live and several softwares at once are milestone 7; other people setting premise up is milestone 5, sooner ([0043](0043-runs-on-the-owners-machine-first.md)).
- Item 8's first kind was replaced by [0049](0049-any-kind-of-software.md); "any kind of software: in" stands.

## Related

[0032](0032-drop-the-review-page.md), [0035](0035-the-vision-states-the-vision-only.md), [scope](../product/scope.md).
