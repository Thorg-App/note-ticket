---
closed_iso: 2026-09-14T23:33:22Z
session_ids: [{"a": "claude", "type": "execution", "id": "696b908f-81da-4aa1-88ad-08bf64ca55df"}]
working_dir: note-ticket
id: nid_tal154ct9c0afwe3l8aacsar6_e
title: "epics are not ready but if all the dependencies of epic are closed we should auto close the epic"
status: closed
deps: []
links: []
created_iso: 2026-09-14T23:21:48Z
status_updated_iso: 2026-09-14T23:33:22Z
type: task
priority: 3
assignee: nickolaykondratyev
tags: []
---

`epic` should not be given out WHEN we call for ready tickets, since they are not tasks.

However, we should have ability to auto close all epics, through CLI and interface API. We should be able Auto close all the epics that have all of their dependencies complete.

This call, auto-close call should be explicitly triggered, and we should not do this implicitly. That means a new CLI function to auto-close epics that have finished, as well as to the interface that we can call this programmatically from apps that use Ticket programmatically.

## Resolution

Done in commit `b9684a7`. Both halves shipped: `ready` drops epics, and a new explicit
`auto-close-epics` exists on the CLI and on the library interface.

### What was built

**Core (`src/core/`)**
- `ticket.ts` — `TICKET_TYPE_EPIC`, plus `Ticket.type` (raw text, `""` when absent) and
  `Ticket.isEpic`. `type` stays free text; `epic` is the only value that changes behavior.
- `dep-graph.ts` — `DepGraph.ready()` now excludes epics; new `DepGraph.completedEpics()`
  returns ONE round of "active epic, >=1 dep, every dep closed", ordered priority-then-id
  like `ready`/`blocked`. The shared `hasEveryDepClosed` predicate backs both.
- `epic-auto-close.ts` (new) — `EpicAutoClose.closedEpics(tickets, nowIso)`: the whole run
  as a PURE function, returning the epics already moved to `closed` (via `StatusUpdate`).
  The caller saves them. Iterates `completedEpics` to a **fixed point**.

**CLI** — `src/cli/commands/auto-close-epics.ts`, dispatched from `main.ts` via
`StoreResolver.forWriteCommand()`. Takes no arguments. Prints one
`Updated <id> -> closed` per epic (`close`'s wording) or `No epics to auto-close`, exit 0
either way. Clock read once per run, so every epic a run closes shares one `closed_iso`.

**Library** — `TicketManager.autoCloseEpics(): readonly Ticket[]` +
`FileTicketManager`'s implementation. `src/index.ts` also exports `EpicAutoClose` and
`TICKET_TYPE_EPIC`, so a consumer can PREVIEW a run without writing anything.

### Decisions made without asking (non-interactive session)

1. **Only `ready` excludes epics; `blocked` still lists them.** The ticket named `ready`
   only. An epic with unresolved deps in `blocked` is informative (it shows the remaining
   ids), and the two lists still partition sensibly: a finished epic appears in neither,
   which is exactly when `auto-close-epics` should act on it.
2. **Only `type: epic`, not `feature`.** The ticket says epic. `feature` behaves as before.
3. **An epic with NO dependencies is never auto-closed.** "All deps closed" is vacuously
   true for an empty list, so the naive rule would close a freshly created epic the moment
   it exists. An epic that tracks nothing has nothing finished.
4. **A `punted` epic is left alone** — punting is a deliberate deferral; auto-close must not
   undo it. Same `activeTickets()` (open/in_progress) rule `ready`/`blocked` use.
5. **The run iterates to a fixed point** (epic-over-epic closes in the same invocation).
   Without it, running the command twice in a row would close more the second time, which
   the user cannot predict from the first run's output. A cycle of epics never closes.
6. **No `--dry-run`.** Unrequested scope; the op is undone one id at a time with
   `reopen <id>`, and every closed id is named on stdout. `DepGraph.completedEpics()` /
   `EpicAutoClose.closedEpics()` are the programmatic preview if one is ever wanted.
7. **Command name `auto-close-epics`**, matching the ticket's own vocabulary.

### Tests

- `test/epic-auto-close.test.ts` (new) — fixed point, idempotence, epic cycles, stamps.
- `test/auto-close-epics-command.test.ts` (new) — the command's stdout and on-disk effect.
- `test/dep-graph.test.ts` — `completedEpics` membership rules; `ready` excludes epics;
  `blocked` keeps them.
- `test/ticket-manager.test.ts` / `test/ticket.test.ts` / `test/package-exports.test.ts`.
- `features/ticket_epics.feature` (new, 15 scenarios) + a `ticket "X" has type "Y"` step in
  `features/steps/ticket_steps.py`.

`make test` (523 unit, 297 BDD scenarios) and `make package-smoke` both green.

### Docs

`docs/cli.md` gained an **Epics** section; `docs/npm-library.md` gained an **Epics**
subsection plus `autoCloseEpics`/`completedEpics`/`type`/`isEpic`/`EpicAutoClose` rows;
help text and CHANGELOG updated. The `ready` change is **divergence #23** in
`docs-internal/migration-to-ts-high-level.md`, approved on this ticket id.
