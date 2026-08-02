---
id: nid_t9w0uv9z3eytl974830ke884n_e
title: Add supported for punted status
status: in_progress
deps: []
links: []
created_iso: '2026-08-02T18:41:27Z'
status_updated_iso: '2026-08-02T18:44:56Z'
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
