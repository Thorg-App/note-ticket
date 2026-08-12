---
closed_iso: 2026-07-30T20:29:17Z
id: nid_xioefs6t2rcs1gyl2mpcb1oyf_e
title: Unwritable ticket file surfaces a raw node stack trace
status: closed
deps: []
links: []
created_iso: '2026-07-30T14:06:38Z'
status_updated_iso: 2026-07-30T20:29:17Z
type: bug
priority: 3
assignee: CC_WITH-nickolaykondratyev
pwd: /home/nickolaykondratyev/git_repos/note-ticket
---
A ticket file that cannot be written (e.g. `chmod 444 _tickets/foo.md`) makes the TypeScript CLI
print a raw node stack trace (`Error: EACCES ... at Object.writeFileSync`) instead of the
`Error: <message>` + exit 1 shape every other failure uses.

NOT a regression: the pre-existing `close`/`TicketStore.save` path behaves identically, so this
predates the T5 add-note/edit port. Found during the T5 phase C review
(.ai_out/ts-port-5-write-commands/, IMPLEMENTATION_REVIEW_PHASE_C__PUBLIC.md NIT #5).

Scope: every write in src/core/ticket-store.ts (`save`, `appendTo`, `ensureDir`) plus whatever
else can throw a node system error out of a command. Turn the errno into a CliError with a
human message naming the path.

## Acceptance Criteria

`chmod 444` on a ticket then `tk close <id>` prints `Error: ...` naming the path and exits 1,
with no stack trace; covered by a unit test.

## Resolution (2026-07-30)

New `src/core/file-system-error.ts`: `FileSystemError.guarding(operation, path, body)` is the
ONE place an OS-level failure becomes a user-facing message. It maps the errno to `strerror`
wording (`cannot write <path>: permission denied (EACCES)`), falls back to the bare code for an
unmapped errno, and RETHROWS anything without an `errno`/`code` pair so a real defect keeps its
stack trace.

Every `node:fs` call in `TicketStore` now goes through it: `save` (reporting the TICKET path, not
its internal `.tmp.<pid>` scratch file, which was what node's own message named), `appendTo`,
`ensureDir`, `load`'s `readFileSync` and `collectInto`'s `readdirSync`. `main.ts` adopts
`FileSystemError` into a `CliError` exactly as it already did `CorruptTicketFileError`, so the
shape is `Error: <message>` + exit 1.

Note on the repro: `chmod 444` on the FILE does not break `close` — `save` writes a sibling temp
file and renames over it, which only needs directory write permission. `chmod 555 _tickets` is the
`close` repro; `chmod 444 <file>` is the `add-note` (append) repro. Both verified by hand and
covered.

Tests: `test/file-system-error.test.ts` (errno wording, unmapped errno, non-errno rethrow, no-chmod
so it is root-independent), `TicketStore permission failures` in `test/ticket-store.test.ts`
(save/append/read/mkdir/readdir, skipped with a stated reason under root, which bypasses permission
bits), an assertion that a failed `save` names the ticket and not the scratch file, and a BDD
scenario in `features/ticket_status.feature` ("A ticket file that cannot be rewritten fails with a
message, not a stack trace"). `features/environment.py` now restores directory permissions before
`rmtree`.

`make test` (419 unit + 249 BDD scenarios), `npm run typecheck` and `make parity` all green.
