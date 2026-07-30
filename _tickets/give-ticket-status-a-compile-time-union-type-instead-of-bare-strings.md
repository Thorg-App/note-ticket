---
closed_iso: 2026-07-30T19:29:07Z
id: nid_em5zmsstl3kz85jp8n70aidbb_e
title: Give ticket status a compile-time union type instead of bare strings
status: closed
deps: []
links: []
created_iso: '2026-07-30T10:51:49Z'
status_updated_iso: 2026-07-30T19:29:07Z
type: chore
priority: 3
assignee: CC_WITH-nickolaykondratyev
tags: [ts-port]
pwd: /home/nickolaykondratyev/git_repos/note-ticket
---
`src/core/ticket.ts` exposes `VALID_TICKET_STATUSES: readonly string[]` and `TicketField` as a static class of `string`s, so every status-taking signature in the TS CLI is `status: string` -- e.g. `StatusUpdate.applied(ticket, status: string, now)` in src/cli/commands/status.ts and `TicketFilter`'s `--status` handling in src/cli/ticket-filter.ts. A typo in a status literal is a runtime error where CLAUDE.md asks for a compile-time one.

Raised in the T5 phase A implementation review (suggestion S3). Pre-existing, predates T5, and deliberately NOT fixed inside T5 phase A because it touches read commands too and would enlarge an already-large diff.

Proposed: `export type TicketStatus = "open" | "in_progress" | "closed"` (plus the legacy `done` where it is accepted on READ only -- note `isFinished` accepts `done`, `isClosed` does not, and that distinction must survive), `VALID_TICKET_STATUSES: readonly TicketStatus[]`, and a single parse function at the CLI boundary that turns user input into a `TicketStatus` or throws the existing `invalid status` CliError.

## Design

Do this WITH or AFTER T5 phase C, not before: phases B and C are in flight in the same files and this is a pure refactor with no user-visible behavior change, so it loses every merge race it enters. `make parity` and the BDD suite are the safety net -- no new tests should be needed, and if any test has to change, the refactor is doing more than it claims.

## Acceptance Criteria

No `status: string` parameter remains in src/cli or src/core; `make typecheck`, `make unit-test`, `make test`, `make parity` all green with no test-expectation changes.

## Resolution (2026-07-30)

Done as specified. `VALID_TICKET_STATUSES` is now `as const` and `TicketStatus` is derived from
it (`(typeof VALID_TICKET_STATUSES)[number]`), so the list and the type cannot drift apart.

- `src/cli/commands/status.ts`: new `TicketStatusArgument.parsed(text): TicketStatus` — the ONE
  boundary where user text becomes a status; it throws the same `invalid status '<x>'. Must be
  one of: ...` CliError the old private `validate` did, so `StatusCommand.validate` is gone.
  `StatusUpdate.applied`, `StatusCommand.apply` and `StatusWrapper.status` are now `TicketStatus`.
  Bash's order of operations survives: `run` parses BEFORE `apply` resolves the id, so an invalid
  status still mutates nothing.
- `src/cli/ticket-filter.ts` / `list-options.ts`: `--status=` is renamed `statusFilter: string` and
  documented as deliberately NOT a `TicketStatus` — bash never validates it, so `--status=bogus`
  and `--status=done` must list nothing rather than fail.
- `src/core/ticket.ts`: `Ticket.status` stays `string` on purpose (disk text is hand-editable and
  may be `done`, a typo, or absent); the WHY is now in a doc comment. `isClosed`/`isFinished`
  keep their distinction untouched.
- `TicketField` was left alone: its members are already inferred as string literals, so a mistyped
  `TicketField.X` is already a compile error — the 80/20 line.

Verified: the guarantee bites (a temporary `const _x: TicketStatus = "in_progres"` produced
`error TS2820 ... Did you mean '"in_progress"'?`, then removed). `make typecheck`,
`make unit-test` (408 pass), `make test` (248 scenarios), `make parity` (graph/query/slug/write,
0 failures) all green with **zero** test-expectation changes. CLAUDE.md's `ticket.ts` bullet
records the type and the parse boundary. No CHANGELOG entry: no user-visible behavior change.
