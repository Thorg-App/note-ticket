---
id: nid_qxt3z5unr9k220aqttbw84a6a_e
title: "Human sign-off: show's ## Blocking duplicate-row removal (TS port divergence #8)"
status: open
deps: []
links: []
created_iso: 2026-07-30T07:47:06Z
status_updated_iso: 2026-07-30T07:47:06Z
type: task
priority: 2
assignee: CC_WITH-nickolaykondratyev
tags: [decide, ts-port]
---

Raised by the IMPLEMENTATION_REVIEW of `nid_8cislepljqvv88ayndtjlw34k_e` (TS port 4: graph commands).
Landed and shipped; this ticket only seeks retroactive sign-off, or a revert if you disagree.

## Decision needed

`show`'s `## Blocking` section is declared divergence #8 in `scripts/parity/README.md`. It has two halves:

1. **Row ORDER changed** — unavoidable. Bash emitted rows in awk hash order, which is unspecified,
   so there was no stable behavior to preserve. Not a decision.
2. **Duplicate rows removed** — a real behavior change. Bash printed the same blocking ticket more
   than once in some inputs; the TS port prints it once. This is clearly a bug fix, but it was NOT
   covered by the closed ID-resolution decision ticket (`nid_5g3eta9cf7yi6iukmscxma6wc_e`), and
   CLAUDE.md requires human approval before removing previous behavior.

Divergence #9 (`dep tree` root resolution via `IdResolver`; empty id resolves to nothing) IS covered
by that closed decision ticket and needs no further approval.

## What to decide

Approve the dedup (expected: yes, duplicated rows are not a feature), or ask for bash's duplicates
to be reproduced.

## If approved

Update the "pending human sign-off" wording for divergence #8 in `scripts/parity/README.md` and
`docs-internal/migration-to-ts-high-level.md` to "approved", then close this ticket.
