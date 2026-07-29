---
id: nid_5g3eta9cf7yi6iukmscxma6wc_e
title: "Confirm intentional ID-resolution error-path changes before flipping read/write commands"
status: open
deps: [nid_ropjwdm792a5qqyu2u0zeuna1_e]
links: []
created_iso: 2026-07-29T23:05:25Z
status_updated_iso: 2026-07-29T23:05:25Z
type: task
priority: 1
assignee: CC_WITH-nickolaykondratyev
tags: [ts-port, decide]
---

The TS core (src/core/id.ts, IdResolver) intentionally differs from bash on TWO id-resolution error paths. Both are strict improvements, both are user-visible, neither is covered by any BDD scenario. A human should confirm them before T3 (nid_zesi8c4t7lyw6jgmqqsjqd54k_e) / T4 (nid_8cislepljqvv88ayndtjlw34k_e) / T5 (nid_2ziai8ka9l0yak2lxnwlu9lk2_e) flip the commands that resolve ids.

DECISION 1 - empty id resolves to nothing (RECOMMEND: keep the TS behavior).
awk index(s, "") returns 1, so bash `ticket_path ""` substring-matches every ticket. Verified live on this machine:
  - repo with exactly ONE ticket:  `tk show ""`  -> SUCCEEDS, shows that ticket
  - repo with two or more tickets: `tk show ""`  -> "Error: ambiguous ID '' matches multiple tickets"
So a script running `tk close "$MAYBE_UNSET"` against a single-ticket repo closes that ticket under bash. TS returns not-found for an empty search.
Risk of keeping TS behavior: a caller that relied on the one-ticket accident breaks. Judged negligible and desirable.

DECISION 2 - `dep tree <id>` gains an exact-match tier (RECOMMEND: keep the TS behavior).
bash cmd_dep_tree resolves its root with `index(id, root_pattern) > 0` only - no exact-match tier - so if one full id is a substring of another, `tk dep tree <full-id>` errors "ambiguous" while `tk show <full-id>` resolves it fine. TS uses the shared IdResolver everywhere (exact beats partial). This also removes an inconsistency between commands.
Note for T4: use IdResolver for the dep-tree root rather than reimplementing the substring scan.

## Acceptance Criteria

A human has recorded a yes/no on each decision in this ticket. For every decision kept, the porting ticket that flips the affected command adds a BDD scenario pinning the new behavior (empty-id -> not found; exact id wins over substring in dep tree). For any decision rejected, src/core/id.ts is changed to match bash and the code comment is updated.

