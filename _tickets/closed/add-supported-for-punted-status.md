---
closed_iso: 2026-08-02T18:49:06Z
id: nid_t9w0uv9z3eytl974830ke884n_e
title: Add supported for punted status
status: closed
deps: []
links: []
created_iso: '2026-08-02T18:41:27Z'
status_updated_iso: 2026-08-02T18:49:06Z
type: task
priority: 3
assignee: nickolaykondratyev
pwd: /home/nickolaykondratyev/git_repos/note-ticket
---
Add support for 'punted' in the list of valid statuses

```ts file=[$(git.repo_root)/src/core/ticket.ts] Lines=[19-24]
/** The statuses `TicketStatus` is the union of — the argument `setStatus`/`ticket status` take. */
export const VALID_TICKET_STATUSES = [
    TICKET_STATUS_OPEN,
    TICKET_STATUS_IN_PROGRESS,
    TICKET_STATUS_CLOSED,
] as const;
```

What does 'punted' mean? It means the ticket has been punted to do in the future.
- The punted ticket should NOT show up as ready.
- The ticket should show up queries that do not filter by status (already does).

Key parts: 
- If T1(open) -depends> T2(punted)
  - THEN T1 must NOT show up as ready either. We should respect punted tickets as blocking other open tickets.

Include necessary BDD tests to proove the above behaviors.

## Resolution (2026-08-02)

Implemented. `punted` is now a valid status (`ticket status <id> punted`).

- `src/core/ticket.ts`: added `TICKET_STATUS_PUNTED` and appended it to `VALID_TICKET_STATUSES` (so `TicketStatus` now includes `"punted"`); exported from `src/index.ts` (library surface).
- The required semantics fell out of existing code with NO graph changes:
  - `DepGraph.ready()`/`blocked()` only list open/in_progress tickets, so a punted ticket is never ready (nor listed as blocked).
  - A punted dependency is not `closed`, so it keeps blocking dependents — T1(open) -depends-> T2(punted) means T1 is NOT ready and shows in `blocked` with T2 as blocker.
  - Status-unfiltered listings (`ls`, `query`) already show every status.
  - `StatusUpdate` drops `closed_iso` for any non-closed status, punted included.
- Docs: `docs/cli.md` + `help` usage now say `(open|in_progress|closed|punted)`; `docs/npm-library.md` `TicketStatus` union updated; CHANGELOG entry added.
- Tests (all green via `make test`, 268 scenarios):
  - BDD `features/ticket_status.feature`: set-to-punted, punting removes `closed_iso`, valid-status lists updated.
  - BDD `features/ticket_listing.feature`: ready excludes punted; ready excludes open ticket with punted dep; blocked shows open ticket blocked by punted dep; blocked excludes punted tickets; `ls` without status filter shows punted.
  - Unit `test/dep-graph.test.ts`: punted-not-ready, punted-dep-blocks, punted-excluded-from-blocked.
