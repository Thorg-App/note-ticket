---
id: nid_2ziai8ka9l0yak2lxnwlu9lk2_e
title: "TS port 5: write commands (create, status, dep/undep, link/unlink, add-note, edit)"
status: open
deps: [nid_ropjwdm792a5qqyu2u0zeuna1_e, nid_8cislepljqvv88ayndtjlw34k_e, nid_5g3eta9cf7yi6iukmscxma6wc_e]
links: []
created_iso: 2026-07-29T21:57:25Z
status_updated_iso: 2026-07-29T21:57:25Z
type: task
priority: 2
assignee: CC_WITH-nickolaykondratyev
tags: [ts-port]
---

Read docs-internal/migration-to-ts-high-level.md first. Reference: cmd_create, cmd_status (+start/close/reopen), cmd_dep, cmd_undep, cmd_link, cmd_unlink, cmd_add_note, cmd_edit in ./ticket. Port onto src/core/ mutation APIs, flip via TS_COMMANDS, keep make test green per flip.

Parity notes:
- create: only command allowed to mkdir -p the tickets dir; always writes to the TOP level of _tickets/; assignee defaults to git config user.name; title double-quoted in frontmatter with inner quotes escaped; emits the new ticket as JSONL (key order, full_path last); --parent resolved+validated; --tags comma list to [a, b]; slug collision suffixes.
- status/start/close/reopen: validate against open|in_progress|closed; bump status_updated_iso (UTC, seconds, Z); closed sets closed_iso, any other status REMOVES closed_iso; output Updated <full-id> -> <status>.
- dep/undep: resolve both ids (partial ok) to full ids; dedupe (Dependency already exists); undep on missing dep errors with Dependency not found and exit 1; frontmatter edits must not disturb other fields.
- link/unlink: link is symmetric across 2+ tickets (adds each to the others, reports Added N link(s) between M tickets or All links already exist); unlink removes from both sides.
- add-note: appends ## Notes section if missing, then a **<iso>** timestamped entry; note text from args or stdin when stdin is not a TTY; no args and TTY stdin errors.
- edit: launches $EDITOR (vi fallback) only when stdin AND stdout are TTYs, else prints Edit ticket file: <path>.
- Finish the dep dispatch: with tree/cycle already in TS (previous ticket), flip the entire dep name into TS_COMMANDS and remove the partial delegation hooks inside bash cmd_dep.

Acceptance: every remaining command served by TS; bash ./ticket reduced to a pure delegating shim; full BDD suite green.


## Notes

**2026-07-30T00:00:13Z**

### Carry-over from the closed ID-resolution decision ticket (nid_5g3eta9cf7yi6iukmscxma6wc_e)

Human confirmed the empty-id change; this ticket owns pinning it on the **write** path, which is where it actually bites:
- Add a BDD scenario: a write command given an empty id (e.g. `tk close ""`, as an unset shell var expands to) fails as not-found and mutates NOTHING. Under bash, in a one-ticket repo, it silently closes that ticket.
- Partial-ID matching is **retained** — exact match wins over it. Do not remove the partial tier.
