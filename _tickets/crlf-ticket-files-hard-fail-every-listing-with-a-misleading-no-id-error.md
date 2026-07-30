---
id: nid_z10hpj927zqilxcpl9ycpe0ad_e
title: "CRLF ticket files hard-fail every listing with a misleading no-'id' error"
status: open
deps: [nid_zesi8c4t7lyw6jgmqqsjqd54k_e]
links: []
created_iso: 2026-07-30T02:24:10Z
status_updated_iso: 2026-07-30T02:24:10Z
type: bug
priority: 2
assignee: CC_WITH-nickolaykondratyev
tags: [ts-port, core, decide]
---

A ticket file with CRLF line endings (Windows editor, synced Obsidian vault, `git config core.autocrlf=true` checkout) is now a HARD failure for every command served by the TypeScript core.

Repro (verified 2026-07-29 on branch nid_zesi8c4t7lyw6jgmqqsjqd54k_e_2026-07-29T18-22-47PDT):

    printf -- '---\r\nid: aaa1\r\ntitle: "CR"\r\nstatus: open\r\n---\r\n' > $TICKETS_DIR/a.md
    tk ls
    # Error: /abs/path/a.md has no 'id' frontmatter field   (exit 1)

Bash (pre-port) listed nothing and exited 0, because its awk `/^---$/` never matches `---\r` either. So neither implementation ever handled CRLF; the difference is that TS now fails loudly.

The loud failure is DESIRABLE and pre-approved (nid_n6eavbm0h77twvna8k9nnpu2g_e). The DEFECT is the wording: the file visibly contains `id: aaa1`, so `has no 'id' frontmatter field` sends the user hunting for a field that is right there. POLS violation.

Root cause: /home/nickolaykondratyev/git_repos/note-ticket/src/core/frontmatter.ts matches the `---` fence and `key: value` lines without tolerating a trailing `\r`, so the whole block parses as absent and /home/nickolaykondratyev/git_repos/note-ticket/src/core/id.ts raises MissingTicketIdError.

Pick ONE (needs a human call, see Design):
(a) Tolerate a trailing `\r` on the fence and field lines in `frontmatter.ts`, i.e. actually support CRLF ticket files. Must keep the byte-exact round-trip property (TicketDocument re-serializes unchanged text identically) — that is the hard part, and it has unit tests in test/frontmatter.test.ts.
(b) Keep rejecting the file but distinguish the two causes: an unparseable/absent frontmatter block gets its own message (e.g. `Error: <path> has no YAML frontmatter block` / `... frontmatter block is not parseable (CRLF line endings?)`), separate from a block that parses but has no `id`.

Deliberately OUT of scope of the T3 read-commands ticket (nid_zesi8c4t7lyw6jgmqqsjqd54k_e): pre-existing core parsing, not caused by the port, and scope discipline mattered more than folding it in.

## Design

(a) is the user-friendly fix but touches the byte-exact round-trip guarantee of TicketDocument, which every write command depends on; (b) is cheap, safe, and honest but leaves CRLF files unusable.

Pareto suggests (b) now plus (a) only if CRLF files turn out to be real for a user. Human decision requested because it is a product call about which platforms are supported, not a technical one.

## Acceptance Criteria

- A failing unit test in test/frontmatter.test.ts (or test/id.test.ts) covering a CRLF ticket file exists and drives the fix.
- Whichever option is chosen, the error message for a CRLF file no longer claims the `id` field is missing when the file contains one, OR the file is parsed successfully.
- `make typecheck`, `make unit-test`, `make test`, `make parity` all green.
- CHANGELOG.md `[Unreleased]` updated if user-visible.

