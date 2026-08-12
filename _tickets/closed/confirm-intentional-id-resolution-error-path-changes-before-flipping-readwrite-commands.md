---
closed_iso: 2026-07-29T23:59:54Z
id: nid_5g3eta9cf7yi6iukmscxma6wc_e
title: "Confirm intentional ID-resolution error-path changes before flipping read/write commands"
status: closed
deps: [nid_ropjwdm792a5qqyu2u0zeuna1_e]
links: []
created_iso: 2026-07-29T23:05:25Z
status_updated_iso: 2026-07-29T23:59:54Z
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


## Notes

**2026-07-29T23:59:54Z**

## HUMAN DECISIONS RECORDED — 2026-07-29

**DECISION 1 — empty id resolves to nothing: YES, keep the TS behavior.**
Rationale given: resolution is to be based on **exact id**. An empty string is not an id, so it resolves to nothing. Bash's accident (`index(s, "") == 1`, so `tk show ""` succeeds in a one-ticket repo and `tk close "$UNSET"` can mutate it) is not preserved. `src/core/id.ts` already implements this — no code change needed. T4/T5 add the BDD scenario pinning empty-id -> not found.

**DECISION 2 — `dep tree` gains the exact-match tier: YES, keep the TS behavior.**
Rationale given: exact id wins, always, and consistently across commands. `src/core/id.ts` `IdResolver` already implements this. T4 note stands: use `IdResolver` for the dep-tree root rather than reimplementing the substring scan. T4 adds the BDD scenario pinning exact-beats-substring.

**RELATED ASK — "we shouldn't do partial id matches": SCOPED DOWN, partial matching is RETAINED.**
The human's framing was exact-id-first. Removing partial matching entirely was raised as a distinct, larger change and explicitly declined after the blast radius was surfaced: it is documented (`ORIGINAL_README.md:89`) and pinned by ~10 BDD scenarios (`features/id_resolution.feature` plus partial-ID scenarios in `ticket_show`, `ticket_status`, `ticket_notes`, `ticket_edit`, `ticket_links`, `nested_folders`). Decision: **keep partial matching as a convenience tier**; exact match always wins over it, and ambiguity at the winning tier is an error. No test deletions, no doc changes. The TS core needs no change for this.

**NEW RULE — every ticket file must carry an `id` field.**
The human stated the expectation that every file under `_tickets/` has an `id`. Bash currently ignores id-less files silently; the chosen behavior is a **hard error naming the offending path** (chosen over skip-with-warning, accepting that one malformed file breaks every command including `ls`). Filed as `nid_n6eavbm0h77twvna8k9nnpu2g_e` and wired as a dep of T3 (`nid_zesi8c4t7lyw6jgmqqsjqd54k_e`). No BDD scenario covers id-less files today, so nothing is un-pinned.

Acceptance criteria met: a yes/no is recorded for both decisions, both kept, and the BDD-pinning obligations are carried by T4/T5 (and T3 for the new rule). Closing.
