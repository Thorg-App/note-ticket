# T4 — graph commands (`dep tree`, `dep cycle`, `show`) ported to TypeScript

Ticket `nid_8cislepljqvv88ayndtjlw34k_e`. Branch
`nid_8cislepljqvv88ayndtjlw34k_e_2026-07-29T23-32-59PDT`, commits `94242f2` and `e934523`.
Working tree clean.

## Verification (actual results)

| Command | Result |
|---|---|
| `make build` | exit 0 |
| `make unit-test` | exit 0 — 289 tests, 289 pass, 0 fail |
| `make test` | exit 0 — 12 features, **214 scenarios**, 1420 steps, 0 failed |
| `make parity` | exit 0 — graph OK (69 scenarios, 0 failures), query OK, slug OK |

## What was implemented

`dep tree [--full] <id>`, `dep cycle` and `show <id>` are now served by the TS bundle.

**Delegation.** `show` flips normally via `TS_COMMANDS`. `dep` does **not**: it is one bash
command whose `tree`/`cycle` subcommands are reads while its default `dep <id> <dep-id>`
form is a write (T5). Bash `cmd_dep` therefore delegates only those two branches, driven by
a second list, `TS_DEP_SUBCOMMANDS="tree cycle"`. Both lists are consumed by two new bash
helpers, `_ts_serves` and `_exec_ts`, so there is one delegation mechanism, not two.
Rollback is still "remove the name from the list". The bash implementations of all three
commands are deliberately kept — they are both the rollback path and the other side of the
parity diff.

**Core.** Only one addition: `DepGraph.blockerIdsOf(id)` (dependencies that are not closed,
in `deps` order, dangling ids kept), now shared by `blocked()` and `show`'s `## Blockers`.
Everything else — tree layout, cycle detection, `children`, `activeDependents` — already
existed from T2 and is unchanged.

## Files changed (repo-relative)

New:
- `src/cli/commands/dep.ts` — `tree`/`cycle` subcommand dispatch
- `src/cli/commands/dep-tree.ts`, `src/cli/commands/dep-cycle.ts`, `src/cli/commands/show.ts`
- `src/cli/ticket-lookup.ts` — the one place an `IdResolution` becomes a user-facing failure
- `src/cli/pager.ts` — `$TICKET_PAGER`/`$PAGER`, TTY only
- `src/cli/child-exit.ts` — "adopt the child's exit code", shared by `jq.ts` and `pager.ts`
- `test/graph-commands.test.ts` — 30 tests over the three commands and the lookup

Changed: `src/core/dep-graph.ts`, `src/cli/ticket-row.ts` (+`identified()`, the
`<id> [<status>] <title>` shape all three commands share), `src/cli/cli-error.ts`
(+`UsageError`), `src/cli/jq.ts`, `src/cli/main.ts`, `ticket`,
`scripts/parity/{harness.py,check_graph.py,dump.ts,README.md}`,
`features/{id_resolution,ticket_dependencies}.feature`, `test/dep-graph.test.ts`,
`README.md`, `CLAUDE.md`, `docs-internal/migration-to-ts-high-level.md`.

**No CHANGELOG entry was written** — TOP_LEVEL_AGENT owns that. The ticket was left open for
the review stage.

## Design decisions (and why)

- **A second delegation list rather than pseudo-command names.** Putting `dep tree` in
  `TS_COMMANDS` would make `" dep "` a substring of the list and hijack the whole `dep`
  command; putting `dep-tree` there would route a literal `tk dep-tree` into node.
- **`_ts_serves` rejects an empty name.** With an emptied list (how the parity harness
  disables delegation) a substring match otherwise accepts `""`, so a bare `tk dep` was
  delegated. Caught empirically.
- **`dep tree` resolves its root against the id-keyed graph, not the file list.** Two files
  carrying the same id collapse into one node (last wins), which is exactly the population
  bash's awk array held — so a duplicated id is not an "ambiguous" search. Three existing
  BDD scenarios depend on this; no test was modified to accommodate the port.
- **bash's two different error wordings are both preserved** (`ticket_path`'s quoted
  `ambiguous ID 'x' matches multiple tickets` vs `dep tree`'s bare `ambiguous ID x`).
  Unifying them would have been a second, unrequested divergence.
- **`UsageError`** subclasses `CliError` and overrides the rendering, because bash prints
  `Usage:` lines without the `Error: ` prefix and `main.ts` must keep one error path.
- **`show` echoes the file line by line** (reproducing awk `getline`, which terminates a
  file that lacks a final newline) instead of re-serialising the parsed document.

## Declared divergences from bash (both human-approved)

Recorded as **#8** and **#9** in `scripts/parity/README.md` (alongside the existing seven)
and in `docs-internal/migration-to-ts-high-level.md`.

1. **#9 — id resolution, ticket `nid_5g3eta9cf7yi6iukmscxma6wc_e`.** `dep tree` used its own
   awk scan matching by SUBSTRING, so a full id contained in another ticket's id came back
   "ambiguous" and that tree was unreachable, and untrimmed input matched nothing.
   Separately, mawk's `index(s, "")` is 1, so an **empty** id matched every ticket and
   resolved to the only one in a single-ticket repo — `tk show "$UNSET_VAR"` printed an
   arbitrary ticket. `dep tree` now uses the shared `IdResolver` (exact beats partial, input
   trimmed) and an empty id matches nothing. Partial matching is retained.
   Pinned by two new BDD scenarios *and* by `check_graph._check_id_resolution_divergences`,
   which asserts bash still behaves the old way.
2. **#8 — `show`'s computed sections.** bash built Blocking and Children by iterating an awk
   associative array, whose order is unspecified (measured: neither path nor id order), and
   appended one Blocking row per matching `deps` *entry*, so a ticket naming the target
   twice was printed twice. TS uses enumeration (path) order and lists each ticket once.
   The parity harness byte-compares the echoed file and the section headings **in order**,
   and compares the rows inside a section as sorted sets;
   `_check_show_duplicate_blocking` pins the duplicate-row difference.

Divergence **#1** (`dep cycle`: bash aborts its DFS on the first cycle, printing walks that
are not cycles and missing real ones — 19 bogus cycles over the default scenario set) is now
*fixed in the shipped command*; the whitelist stays until T6 because bash's buggy version is
still what the harness diffs against.

## Test coverage added, with mutation results

All 16 mutations below were applied to the real source and the named command was required to
go red; every one does. Round 1 found **three vacuously-green guards**, which were fixed and
re-verified (round 2: 3/3 caught).

BDD (`make test`), 6 new scenarios:
- `dep tree <full-id>` resolves when that id is a substring of another (divergence #9)
- an empty id matches nothing (divergence #9)
- `dep cycle`: no cycles / a two-ticket cycle / **a ticket that only points into a cycle is
  not reported** (the bash bug) / closed tickets ignored

Unit (`make unit-test`), `test/graph-commands.test.ts` + additions to `test/dep-graph.test.ts`:
tree dedup at the deepest placement (including that the whole subtree moves with it),
sibling ordering by subtree depth then id, cycle rotation when the smallest id is not the
entry point, walk order, one-cycle-per-member-set, `blockerIdsOf`, `activeDependents`,
`children`, the three rendered output formats, the `parent:` annotation (frontmatter only),
section presence/order, dangling-id rendering, and `TicketLookup`'s wordings.

Parity (`make parity`): `dep tree[ --full]` is now byte-compared through the **real CLI**
for every ticket of all 69 scenarios; `dep cycle` is checked semantically through the real
CLI; `show` is compared for every ticket of every scenario; plus the new
`_check_show_relations` fixture (all four sections at once, one row each — byte-compared).
`scripts/parity/dump.ts` lost its `tree`/`cycle` modes, so no output format is described
twice.

| Mutation | Caught by |
|---|---|
| tree: print a node at its first, not deepest, placement | unit + parity |
| tree: drop the sibling id tie-break | unit |
| tree: drop the subtree-depth sort key | unit |
| cycle: drop the rotation in normalization | unit |
| cycle: leave nodes "on stack" like bash | BDD |
| `activeDependents`: keep closed tickets | unit |
| `children`: "has any parent" instead of "parent == id" | unit *(was vacuous — fixture fixed)* |
| `blockerIdsOf`: keep closed dependencies | unit |
| `show`: drop the parent-title annotation | unit + parity *(parity was vacuous — fixture added)* |
| `show`: change the row format | parity |
| `show`: swap the Blocking and Children sections | parity *(was vacuous — fixture added)* |
| `IdResolver`: partial no longer loses to exact | BDD |
| `IdResolver`: empty search matches everything again | BDD |
| `TS_DEP_SUBCOMMANDS=""` (rollback path) | BDD |

## Open / uncertain

- **The pager path is untested by any automated test** (it only runs when stdout is a TTY,
  which neither BDD nor parity can produce). It was written to mirror bash's `pipefail`
  behavior — the pager's exit code becomes the command's, and a missing pager binary exits
  127 — but that is reasoned, not measured. bash had no test for it either.
- `tk dep-tree`/`tk dep-cycle` are not real commands and never were; nothing changed there.
- Running `node dist/ticket.mjs dep <id> <dep-id>` directly (bypassing bash) prints bash's
  `dep` usage block and exits 1, because the write form is still bash's. Unreachable through
  `./ticket`; documented in `src/cli/commands/dep.ts`. It disappears at T5.
