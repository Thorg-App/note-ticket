---
id: nid_em5zmsstl3kz85jp8n70aidbb_e
title: "Give ticket status a compile-time union type instead of bare strings"
status: open
deps: []
links: []
created_iso: 2026-07-30T10:51:49Z
status_updated_iso: 2026-07-30T10:51:49Z
type: chore
priority: 3
assignee: CC_WITH-nickolaykondratyev
tags: [ts-port]
---

`src/core/ticket.ts` exposes `VALID_TICKET_STATUSES: readonly string[]` and `TicketField` as a static class of `string`s, so every status-taking signature in the TS CLI is `status: string` -- e.g. `StatusUpdate.applied(ticket, status: string, now)` in src/cli/commands/status.ts and `TicketFilter`'s `--status` handling in src/cli/ticket-filter.ts. A typo in a status literal is a runtime error where CLAUDE.md asks for a compile-time one.

Raised in the T5 phase A implementation review (suggestion S3). Pre-existing, predates T5, and deliberately NOT fixed inside T5 phase A because it touches read commands too and would enlarge an already-large diff.

Proposed: `export type TicketStatus = "open" | "in_progress" | "closed"` (plus the legacy `done` where it is accepted on READ only -- note `isFinished` accepts `done`, `isClosed` does not, and that distinction must survive), `VALID_TICKET_STATUSES: readonly TicketStatus[]`, and a single parse function at the CLI boundary that turns user input into a `TicketStatus` or throws the existing `invalid status` CliError.

## Design

Do this WITH or AFTER T5 phase C, not before: phases B and C are in flight in the same files and this is a pure refactor with no user-visible behavior change, so it loses every merge race it enters. `make parity` and the BDD suite are the safety net -- no new tests should be needed, and if any test has to change, the refactor is doing more than it claims.

## Acceptance Criteria

No `status: string` parameter remains in src/cli or src/core; `make typecheck`, `make unit-test`, `make test`, `make parity` all green with no test-expectation changes.

