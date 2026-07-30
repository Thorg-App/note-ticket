---
id: nid_xioefs6t2rcs1gyl2mpcb1oyf_e
title: Unwritable ticket file surfaces a raw node stack trace
status: in_progress
deps: []
links: []
created_iso: '2026-07-30T14:06:38Z'
status_updated_iso: '2026-07-30T20:18:35Z'
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
