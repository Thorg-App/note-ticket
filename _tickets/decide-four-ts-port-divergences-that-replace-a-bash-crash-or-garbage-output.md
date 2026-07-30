---
id: nid_r3mp6uylht7t77iwxtuqvhxv2_e
title: "Decide: four TS-port divergences that replace a bash crash or garbage output"
status: open
deps: []
links: []
created_iso: 2026-07-30T10:51:35Z
status_updated_iso: 2026-07-30T10:51:35Z
type: chore
priority: 2
assignee: CC_WITH-nickolaykondratyev
tags: [decide, ts-port]
---

The TS port of the CLI (docs-internal/migration-to-ts-high-level.md) has four declared divergences from bash that all belong to ONE class: bash either crashed with a shell-level message or wrote garbage, and the TS port does something sane instead. They shipped without human sign-off because each looked individually harmless; bundled here so one decision covers all four.

All four are listed as whitelisted divergences in scripts/parity/README.md and are pinned by tests (check_write.py cases plus BDD scenarios), so nothing is unobserved -- what is missing is APPROVAL.

#6 `query <filter>` with no jq on PATH: bash printed the shell's own `./ticket: line NNN: jq: command not found`; TS prints `Error: jq: command not found` + `Install jq, or run 'query' without a filter`. Exit code 127 on both.

#10 `tk create x --design` (a value-taking flag at the end of the argument list): bash died with `./ticket: line 308: $2: unbound variable`; TS exits 1 with `Error: option '--design' requires a value`.

#11 A NEWLINE in a create title (`tk create $'line1\nline2'`): bash created a file literally named `line1<LF>line2.md` and printed a JSON line that does not parse (`"title":"\"line1","line2\"":""`); TS creates `line1line2.md` and valid JSON.

#12 `_tickets/<slug>.md` already exists as a DIRECTORY: bash tested `[[ -f ]]`, false for a directory, redirected create output into it and died with `Is a directory` at exit 1; TS treats the name as taken, picks `<slug>-1.md` and succeeds.

## Design

The decision is a single yes/no per item, and the expected answer is "yes, keep the TS behavior".

Say NO to any item and the fix is to reproduce bash: for #10 that means exiting with the shell wording (not reproducible without dying inside node), for #11 keeping the LF in the filename, for #12 asking `statSync().isFile()` instead of `existsSync()`. Each would be a deliberate re-introduction of broken behavior, which is why they were not done.

If approved, the README entries stay as documentation of what bash did (they are deleted at T6 with the harness) and this ticket closes.

## Acceptance Criteria

Human records approve/reject per item (#6, #10, #11, #12) in a comment on this ticket, and any rejected item gets a follow-up implementation ticket.

