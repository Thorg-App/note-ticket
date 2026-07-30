---
id: nid_z10hpj927zqilxcpl9ycpe0ad_e
title: CRLF ticket files hard-fail every listing with a misleading no-'id' error
status: in_progress
deps: [nid_zesi8c4t7lyw6jgmqqsjqd54k_e]
links: []
created_iso: '2026-07-30T02:24:10Z'
status_updated_iso: '2026-07-30T18:11:51Z'
type: bug
priority: 2
assignee: CC_WITH-nickolaykondratyev
tags: [ts-port, core]
pwd: /home/nickolaykondratyev/git_repos/note-ticket
---
A ticket file with CRLF line endings (Windows editor, synced Obsidian vault, `git config core.autocrlf=true` checkout) is now a HARD failure for every command served by the TypeScript core.

Repro (verified 2026-07-29 on branch nid_zesi8c4t7lyw6jgmqqsjqd54k_e_2026-07-29T18-22-47PDT):

    printf -- '---\r\nid: aaa1\r\ntitle: "CR"\r\nstatus: open\r\n---\r\n' > $TICKETS_DIR/a.md
    tk ls
    # Error: /abs/path/a.md has no 'id' frontmatter field   (exit 1)

Bash (pre-port) listed nothing and exited 0, because its awk `/^---$/` never matches `---\r` either. So neither implementation ever handled CRLF; the difference is that TS now fails loudly.

The loud failure is DESIRABLE and pre-approved (nid_n6eavbm0h77twvna8k9nnpu2g_e). The DEFECT is the wording: the file visibly contains `id: aaa1`, so `has no 'id' frontmatter field` sends the user hunting for a field that is right there. POLS violation.

Root cause: /home/nickolaykondratyev/git_repos/note-ticket/src/core/frontmatter.ts matches the `---` fence and `key: value` lines without tolerating a trailing `\r`, so the whole block parses as absent and /home/nickolaykondratyev/git_repos/note-ticket/src/core/id.ts raises MissingTicketIdError.

DECIDED (see HUMAN_DECISION at the end of this file): option (b). CRLF ticket files stay UNSUPPORTED;
only the misleading message is fixed.

(b) Keep rejecting the file but distinguish the two causes: an unparseable/absent frontmatter block gets its own message (e.g. `Error: <path> has no YAML frontmatter block` / `... frontmatter block is not parseable (CRLF line endings?)`), separate from a block that parses but has no `id`.

NOT doing (rejected for now): tolerating a trailing `\r` on the fence and field lines in `frontmatter.ts`, i.e.
actually supporting CRLF ticket files. It touches the byte-exact round-trip guarantee of `TicketDocument`
(re-serializes unchanged text identically), which every write command depends on. Revisit only if a real user
hits a CRLF ticket file; no ticket is filed for it, on purpose — it is speculative until then.

Deliberately OUT of scope of the T3 read-commands ticket (nid_zesi8c4t7lyw6jgmqqsjqd54k_e): pre-existing core parsing, not caused by the port, and scope discipline mattered more than folding it in.

## Design

The message must not name a field the file visibly contains. Two distinct causes, two distinct messages:
no frontmatter block could be parsed at all vs a block that parsed and has no `id`. Naming CRLF as the likely
cause in the first message is the whole value of the fix — it turns a dead end into a one-line diagnosis.

WHY-NOT support CRLF: a product call about which platforms are supported, and the round-trip guarantee makes
it the expensive half of the problem while the cheap half removes the actual user-facing harm.

## Acceptance Criteria

- A failing unit test in test/frontmatter.test.ts (or test/id.test.ts) covering a CRLF ticket file exists and drives the fix.
- A CRLF ticket file still fails loudly (exit 1, pre-approved by nid_n6eavbm0h77twvna8k9nnpu2g_e) but the error no longer claims the `id` field is missing; it reports an unparseable frontmatter block and points at CRLF.
- A file that genuinely has a parseable block without `id` keeps the existing `has no 'id' frontmatter field` message — the two causes stay distinguishable.
- `make typecheck`, `make unit-test`, `make test`, `make parity` all green.
- CHANGELOG.md `[Unreleased]` updated if user-visible.

--------------------------------------------------------------------------------

HUMAN_DECISION: lets go with cheap B dont support CRLF for now.
