---
closed_iso: 2026-07-30T17:46:29Z
id: nid_r3mp6uylht7t77iwxtuqvhxv2_e
title: "Decide: TS-port divergences that replace a bash crash, garbage output or useless data"
status: closed
deps: []
links: []
created_iso: 2026-07-30T10:51:35Z
status_updated_iso: 2026-07-30T17:46:29Z
type: chore
priority: 2
assignee: CC_WITH-nickolaykondratyev
tags: [ts-port]
---

(A fifth item, #17, was appended as a note at the bottom after this ticket was written; it is a
judgement call rather than a crash fix, and it needs a decision of its own.)

The TS port of the CLI (docs-internal/migration-to-ts-high-level.md) has four declared divergences from bash that all belong to ONE class: bash either crashed with a shell-level message or wrote garbage, and the TS port does something sane instead. They shipped without human sign-off because each looked individually harmless; bundled here so one decision covers all four.

All four are listed as whitelisted divergences in scripts/parity/README.md and are pinned by tests (check_write.py cases plus BDD scenarios), so nothing is unobserved -- what is missing is APPROVAL.

#6 `query <filter>` with no jq on PATH: bash printed the shell's own `./ticket: line NNN: jq: command not found`; TS prints `Error: jq: command not found` + `Install jq, or run 'query' without a filter`. Exit code 127 on both.
HD: YES fine to have different error message on this.

#10 `tk create x --design` (a value-taking flag at the end of the argument list): bash died with `./ticket: line 308: $2: unbound variable`; TS exits 1 with `Error: option '--design' requires a value`.
HD: YES fine to have different error message on this.


#11 A NEWLINE in a create title (`tk create $'line1\nline2'`): bash created a file literally named `line1<LF>line2.md` and printed a JSON line that does not parse (`"title":"\"line1","line2\"":""`); TS creates `line1line2.md` and valid JSON.
HD: YES fine. 

#12 `_tickets/<slug>.md` already exists as a DIRECTORY: bash tested `[[ -f ]]`, false for a directory, redirected create output into it and died with `Is a directory` at exit 1; TS treats the name as taken, picks `<slug>-1.md` and succeeds.
HD: Yes that is fine.

(HD -- Human decision)

## Design

The decision is a single yes/no per item, and the expected answer is "yes, keep the TS behavior".

Say NO to any item and the fix is to reproduce bash: for #10 that means exiting with the shell wording (not reproducible without dying inside node), for #11 keeping the LF in the filename, for #12 asking `statSync().isFile()` instead of `existsSync()`. Each would be a deliberate re-introduction of broken behavior, which is why they were not done.

If approved, the README entries stay as documentation of what bash did (they are deleted at T6 with the harness) and this ticket closes.

## Acceptance Criteria

Human records approve/reject per item (#6, #10, #11, #12, and #17 in the appended note) in a comment on this ticket, and any rejected item gets a follow-up implementation ticket.


## Notes

**2026-07-30T12:41:08Z**

#17 `tk link a a` (an argument list that names one ticket twice, so the whole set collapses to a single ticket).

bash: recorded the ticket in its OWN `links` and printed `Added 1 link(s) between 2 tickets`.
TS: refuses the command with a NEW message, `Error: nothing to link: every id resolves to ticket <id>`, exit 1, nothing written.

This one is NOT in the same class as #6/#10/#11/#12 above: bash neither crashed nor wrote garbage, it did something merely useless. It is therefore a genuine judgement call, and it invents a user-visible error string.

Consequence of the asymmetry you are being asked to accept: `tk dep a a` is UNCHANGED and still records a ticket as its own dependency (bash parity, verified). The reasoning: a `deps` self-edge is part of a graph the tool reasons about, so `dep cycle` reports it and `ready`/`blocked` act on it -- more useful to the user than a refusal at write time. A `links` entry carries no graph semantics, so a self-link is inert data no reader can act on. If you disagree, the two commands should be made to agree.

Options:
  (a) APPROVE as shipped: `link` refuses a collapsing set, `dep` records a self-dependency. WHY comments in src/cli/commands/link.ts and dep.ts already state this rationale; nothing to do.
  (b) Revert `link` to bash behavior: drop the de-duplication in `LinkCommand.resolve` (~6 lines), delete whitelist divergence #17 and the two scenarios in features/ticket_links.feature. Also re-legitimises `tk link a a b` reporting `Added 3 link(s) between 3 tickets`.
  (c) Extend the refusal to `dep`: `tk dep a a` would also fail, a SECOND new error string and a change to a command whose bash behavior is currently reproduced exactly.

Pinned by: one `diverges=True` case in scripts/parity/check_write.py, and the scenarios "Linking a ticket to itself is refused" and "A repeated id is counted once when other tickets remain".

HD: (a) APPROVE as shipped — `link` refuses a collapsing set, `dep a a` keeps recording a self-dependency.

**2026-07-30T17:46:29Z**

All five items approved as shipped (#6, #10, #11, #12 inline above; #17 option (a)). No implementation follow-ups. Docs adjusted to record the approval instead of pending sign-off: scripts/parity/README.md (whitelist preamble + #17), docs-internal/migration-to-ts-high-level.md, and the WHY comments in src/cli/commands/dep.ts and link.ts. Still open and NOT covered here: divergence #8's duplicate-row removal, ticket nid_qxt3z5unr9k220aqttbw84a6a_e.
