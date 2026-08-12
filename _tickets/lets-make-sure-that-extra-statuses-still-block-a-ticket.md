---
closed_iso: 2026-08-12T23:46:00Z
session_ids: [{"a": "claude", "type": "execution", "id": "3a8762b6-b170-42a8-a789-8d94ad69414c"}, {"a": "claude", "type": "review", "id": "619801ad-4fe0-4574-be1d-0f489ad9108b"}]
working_dir: note-ticket
id: nid_y97pkv7n102f9wklmlhhesr6e_e
title: "Lets make sure that extra statuses still block a ticket"
status: closed
deps: []
links: []
created_iso: 2026-08-12T23:39:04Z
status_updated_iso: 2026-08-12T23:46:00Z
type: task
priority: 3
assignee: nickolaykondratyev
tags: []
---

Let's make sure that a different status than 'closed' still is treated as a blocker for the ticket if the status is not explicitly stated in the known statuses.

So that we can support 

`t1 --deps> t2`
t2 has `status: some-other-status` then `t1` is NOT treated as ready. It will be seen as blocked on t2 getting to `closed` status. 

As i understand this behavior should already be the case and we just need testing for this.

---

## Resolution

The behavior was already correct and is now locked in by tests. No production code changed.

**Why it already works:** dependency resolution only special-cases the literal `closed`.
`DepGraph.isClosed(id)` (`src/core/dep-graph.ts`) is `Ticket.isClosed` (`status === "closed"`),
so `ready()`/`blocked()`/`blockerIdsOf()` treat *any* non-`closed` status — including a custom
one this CLI never writes — as still blocking. "Active" (whether the ticket itself shows up in
`ready`/`blocked`) is a separate check for `open`/`in_progress` only, so an odd-status ticket is
also correctly excluded from those listings itself.

Note: `punted` is now a *known* status (in `VALID_TICKET_STATUSES`), so the pre-existing
punted tests no longer exercise the "unknown status" case. The new tests use an arbitrary
unrecognized status (`in_review`) to cover exactly the ticket's example (`t1 --deps> t2`,
`t2: some-other-status` ⇒ `t1` blocked, not ready).

**Tests added:**
- `test/dep-graph.test.ts` — `isClosed` false for an unrecognized status; `ready` excludes an
  open ticket with a dependency in an unrecognized status; `blocked` counts such a dependency
  as a blocker.
- `features/ticket_listing.feature` — "Ready excludes an open ticket whose dependency has an
  unrecognized status" and "Blocked shows an open ticket whose dependency has an unrecognized
  status".

All 473 unit tests and the `ticket_listing.feature` suite (50 scenarios) pass.