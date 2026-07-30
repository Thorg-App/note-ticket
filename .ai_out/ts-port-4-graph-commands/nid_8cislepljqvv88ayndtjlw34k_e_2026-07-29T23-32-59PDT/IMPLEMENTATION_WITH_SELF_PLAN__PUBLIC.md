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

## Declared divergences from bash (approval status differs per divergence)

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
   **Approval:** the ORDER half needs none (bash's order is unspecified). The
   DUPLICATE-ROW REMOVAL is shipped but **PENDING human sign-off** —
   `nid_qxt3z5unr9k220aqttbw84a6a_e` (tagged `decide`). The closed decision ticket
   `nid_5g3eta9cf7yi6iukmscxma6wc_e` covers #9 ONLY; the round-1 report's claim that both
   divergences were human-approved was wrong and is corrected here and in
   `scripts/parity/README.md` + `docs-internal/migration-to-ts-high-level.md`.

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

---

# Round 2 — review follow-up (cleanup only, no behavior change)

All four gates re-run after the changes below. **Actual results:**

| Command | Result |
|---|---|
| `make build` | exit 0 — `dist/ticket.mjs` 61.4kb |
| `make unit-test` | exit 0 — 289 tests, 289 pass, 0 fail |
| `make test` | exit 0 — 12 features, 214 scenarios, 1420 steps, 0 failed |
| `make parity` | exit 0 — graph OK (69 scenarios, 0 failures), query OK, slug OK |

No shipped behavior changed this round. Tree is clean.

## Per review item

### IMPORTANT #2 — "both human-approved" mislabelling — **INCORPORATED**

The reviewer is right and the round-1 wording was a real accuracy failure. Corrected in
three places: `scripts/parity/README.md` (divergence #8 now carries an explicit
"**Approval status**" paragraph), `docs-internal/migration-to-ts-high-level.md` (the `show`
bullet), and the "Declared divergences" heading + #8 entry of this file. All three now say:
the ORDER half needs no approval (awk hash order is unspecified, any implementation must
pick one); the DUPLICATE-ROW REMOVAL is shipped but **pending human sign-off** in
`nid_qxt3z5unr9k220aqttbw84a6a_e` (tagged `decide`), and the closed decision ticket
`nid_5g3eta9cf7yi6iukmscxma6wc_e` covers **#9 only**. The fix itself was NOT reverted.

### IMPORTANT #3 — misleading test name — **INCORPORATED**

`test/graph-commands.test.ts` — renamed to *"omits a dangling dependency from the tree, even
in `--full` mode"*, and the misplaced awk-array comment moved down to the `show` test that
actually asserts `- ghost [] `. The tree test now carries a WHY comment naming bash's
`build_children` `!(child in max_depth)` skip. The assertion is an exact string equality, so
it cannot go vacuous from a rename.

### Suggestion 1 — stale pointer in `src/core/id.ts` — **INCORPORATED**

"Needs human confirmation before the write commands are flipped" replaced with "Confirmed as
a bug by the owner in `nid_5g3eta9cf7yi6iukmscxma6wc_e` (closed); whitelisted divergence #9".

### Suggestion 2 — padded id passed to `TicketRow.identified` — **INCORPORATED**

Added `TicketRow.paddedIdentified(id, ticket)`; `dep-cycle.ts:51` uses it, and `idColumn`
went back to **private** (it had been made public only for that one call site). The padding
knowledge is now entirely inside `TicketRow`.

### Suggestion 3 — unreachable re-check in `src/core/dep-graph.ts` — **INCORPORATED (deleted)**

**Decision: delete the dead guard**, keeping the reasoning as a WHY-NOT comment. Rationale:
the reviewer proved it unreachable both by mutation (removal left unit tests *and* parity
green) and analytically, and I re-derived the argument — a child is listed only when
`maxDepth[child] === depth + 1`, while an earlier sibling's subtree can only print at depths
`>= depth + 2`, so `printed` cannot have gained it in between; in `--full` mode `isPrintable`
is state-independent anyway. CLAUDE.md forbids unused code, and a dead branch whose comment
claims a scenario that cannot occur is worse than no branch. The comment now records that
bash re-checks at pop time and *why* we do not need to. Parity (69 scenarios, byte-compared
`dep tree` and `dep tree --full` for every ticket) is green after the deletion.

### Suggestion 4 — `CLAUDE.md` "TS_COMMANDS emptied" — **INCORPORATED**

Now reads "with BOTH delegation lists (`TS_COMMANDS` and `TS_DEP_SUBCOMMANDS`) emptied".

### IMPORTANT #1 — CHANGELOG — **not touched, by instruction** (owned by TOP_LEVEL_AGENT)

## CHANGELOG content (item 4) — verified by me, not copied

I re-measured each claim against the built bundle in a throwaway repo under `$PWD/.tmp/`
rather than trusting the review. Six user-visible changes belong in the entry:

1. **`dep tree`, `dep cycle` and `show` are now served by the TypeScript core.**
2. **An empty id no longer resolves.** `tk show ""` (i.e. `tk show "$UNSET_VAR"`) used to
   print an arbitrary ticket in a one-ticket repo — awk's `index(s, "")` is 1. **Measured
   now:** `Error: ticket '' not found`, exit 1. This is the one a user can be bitten by.
3. **`dep tree <full-id>` resolves where it used to report "ambiguous"** — the root now goes
   through the shared `IdResolver` (exact beats partial, input trimmed) instead of a
   substring scan, so a full id contained in another ticket's id is reachable.
4. **`dep cycle` reports every cycle once** — it no longer aborts its DFS at the first cycle,
   so it stops printing walks that are not cycles and stops missing real ones.
5. **`show` lists a duplicate dependent once** under `## Blocking` (bash printed one row per
   matching `deps` entry). Flag it as pending sign-off (`nid_qxt3z5unr9k220aqttbw84a6a_e`).
6. **`dep tree`, `dep cycle` and `show` now hard-error on a `.md` with no `id`.** **Measured
   now:** all three print
   `Error: <path> has no 'id' frontmatter field`, exit 1. The existing `Changed` bullet at
   `CHANGELOG.md:13` enumerates `ls`/`list`, `ready`, `blocked`, `closed`, `query` — **that
   list is what needs extending** with these three. (Correction to the brief: `README.md`
   does *not* carry a per-command list — its paragraph says "commands fail with …" with no
   enumeration — so README needs no change here.)
7. **A missing pager binary now reports `Error: <pager>: command not found`** (exit 127)
   instead of the shell's `./ticket: line NNN: …`. **Measured now** under a real TTY via
   `script -qec "TICKET_PAGER=nosuchpager ticket show <id>"`: `Error: nosuchpager: command
   not found`. Same shape as the `jq` change, which was CHANGELOG'd. (This also closes part
   of round 1's "pager path is unmeasured" caveat — the missing-binary arm is now measured,
   though still not covered by an automated test, since neither BDD nor parity has a TTY.)

## Readiness

**READY.** All SHOULD-FIX and NICE-TO-HAVE items are addressed, no shipped behavior changed,
all four gates green. Remaining, both owned elsewhere: the CHANGELOG entry
(TOP_LEVEL_AGENT, content above) and human sign-off on divergence #8's dedup
(`nid_qxt3z5unr9k220aqttbw84a6a_e`).

---

# Round 3 — the blocking regression, fixed

The confirmation review was RIGHT and my round-2 reasoning was WRONG. I reproduced the
break myself before changing anything.

## What broke, measured

Round 2 deleted the `isPrintable` re-check in `TreeLayout.layoutChildren` on an argument
that it was unreachable. It is not. `deps` is **never deduplicated** — `DepGraph.depsOf()`
returns `Ticket.deps` verbatim and `printableChildren()` only filters and sorts — so
frontmatter `deps: [b, b]` puts `b` in the children list twice. The first push marks it
printed; the deleted re-check was what suppressed the second.

Fixture: `id: aaa, deps: [bbb, bbb]` + `id: bbb`. Reference: a copy of `ticket` with both
delegation lists emptied.

| | `dep tree aaa` | `dep tree --full aaa` |
|---|---|---|
| bash | `aaa` / `├── bbb` | `aaa` / `├── bbb` / `└── bbb` |
| HEAD `4604477` | `aaa` / `├── bbb` / `└── bbb` — **extra row** | matches bash |
| after this fix | **byte-identical to bash** | **byte-identical to bash** |

(The surviving row keeps the `├──` branch connector because `isLast` is computed against
the unfiltered children list — bash behaves the same way, and the test asserts it.)

## The fix — three parts, each mutation-verified

1. **Guard restored** in `src/core/dep-graph.ts`, with a comment naming the real reason
   (duplicate `deps` entries), not the old misleading one.
2. **Unit tests** in `test/dep-graph.test.ts`: duplicate dep printed once in default mode,
   twice in `--full`. **Mutation:** deleting the guard again ⇒ `make unit-test` rc=2 with
   exactly the default-mode test red. Restored ⇒ 291/291.
3. **Harness gap closed — I took the preferred option, not a follow-up ticket.**
   `scripts/parity/harness.py` gains two `FIXED_SCENARIOS`: `duplicate-dep` and
   `duplicate-dep-with-subtree`. Reason for choosing this over a ticket: `random_scenarios`
   builds `deps` from distinct ids and structurally *cannot* emit a duplicate, so the shape
   has to be a fixed fixture — and that is two tuples of work. **Mutation:** with the guard
   deleted, `make parity PARITY_ARGS="--random 0"` now FAILS with
   `MISMATCH … check=[dep tree a]` on both new scenarios. Previously it stayed green through
   a real break; that is exactly the hole that let this ship.

   One consequence, measured not guessed: the new scenarios first tripped the *generic*
   `show` comparator on whitelisted divergence #8 (bash emits one `## Blocking` row per
   matching `deps` entry, TS one per ticket). `_show_mismatches` now compares rows within a
   section as a true set rather than a sorted list. The divergence itself stays pinned by
   COUNT in `_check_show_duplicate_blocking` (bash 2, TS 1), and a genuinely missing row
   still fails. Recorded in `scripts/parity/README.md` #8.

Nothing else was touched: CHANGELOG.md untouched, divergence #8 labelling untouched, no
other round-1/2 cleanup revisited.

## Verification (actual exit codes)

| Gate | rc | Result |
|---|---|---|
| `make build` | **0** | `dist/ticket.mjs` 61.5 kb |
| `make unit-test` | **0** | **291** pass, 0 fail, 0 skipped (289 before; +2) |
| `make test` | **0** | 12 features, 214 scenarios, 1420 steps, 0 failed |
| `make parity` | **0** | graph OK **scenarios=71** (69 before), failures=0; query OK; slug OK |

`.tmp/` is gitignored, so the reproduction fixtures are not stray tracked files; nothing
needed removing from the tree. Working tree clean after commit.

## Readiness

**READY.** The regression is fixed and byte-verified against bash, and it is now guarded at
two levels (unit + parity), both proven by mutation rather than by argument.

---

# Round 4 — the `show` row-comparison dedup, narrowed (harness-only)

The confirmation review was right and my round-3 judgement call was wrong. I loosened
`_show_mismatches` to compare rows as a SET for all four headings, when only `## Blocking`
carries divergence #8. `deps` and `links` are never deduplicated and **both** bash and TS
repeat the row under `## Blockers` / `## Linked`, so that parity had become invisible.

## I confirmed the hole myself before changing the harness

Mutation: `src/cli/commands/show.ts:109` → `[...new Set(ids)].map(...)`, the exact "list each
ticket once" cleanup #8's own comment invites; `section()` is shared by all four sections.

| State | `make parity` | What it printed |
|---|---|---|
| mutation + round-3 harness | **rc=0** | `graph OK scenarios=71 failures=0` — a real `show` regression ships green |
| mutation + this fix | **rc=2** | `failures=2`; `MISMATCH scenario=[duplicate-dep] check=[show a (## Blockers rows)]`, likewise `duplicate-dep-with-subtree` |
| clean sources + this fix | **rc=0** | no false positive from divergence #8 |

## The fix

`scripts/parity/check_graph.py::_show_mismatches` picks the comparison per heading:

    dedupe = (lambda rows: sorted(set(rows))) if heading == BLOCKING_HEADING else sorted

`## Blocking` stays a sorted SET (its row COUNT legitimately differs, and that difference is
still pinned exactly by `_check_show_duplicate_blocking`: bash 2, TS 1). Every other section
is a sorted MULTISET again, so duplicate rows must match one-for-one. `BLOCKING_HEADING` is a
new module constant, also replacing the two `"## Blocking"` literals in
`_check_show_duplicate_blocking`.

Narrowed wording: the `check_graph.py` module docstring, the comment at the comparison,
`_check_show_duplicate_blocking`'s docstring, and `scripts/parity/README.md` divergence #8 —
all now say the dedup applies to `## Blocking` only, and #8 records *why* (the measured
regression) so nobody widens it again. The migration doc does not describe the harness's
comparison mechanism, so it needed no edit.

## Unit fixture — ADDED, mutation-verified

The reviewer left this to my judgement; I added it rather than relying on parity alone. Six
lines in `test/graph-commands.test.ts` ("repeats a dependency listed twice under Blockers",
"repeats a link listed twice under Linked") move the failure to the 2-second gate instead of
the multi-minute one. Under the same `new Set` mutation: `make unit-test` **rc=2, tests 293,
pass 291, fail 2**, and the two failures are exactly these tests. Clean: 293/293.

## Verification (actual exit codes)

| Gate | rc | Result |
|---|---|---|
| `make build` | **0** | `dist/ticket.mjs` built |
| `make unit-test` | **0** | tests 293 / pass 293 / fail 0 / skipped 0 (291 before; +2) |
| `make test` | **0** | 12 features, 214 scenarios, 1420 steps, 0 failed |
| `make parity` | **0** | graph OK scenarios=71 failures=0 (19 whitelisted); query OK; slug OK |

No shipped behaviour changed: `src/cli/commands/show.ts` and `src/core/dep-graph.ts` are
byte-identical to the reviewed commit (the mutation was reverted with `git checkout --` and
re-verified absent before the final run). CHANGELOG.md untouched. Working tree clean.

## Readiness

**READY.** The one blocking item is fixed, and — unlike the two rounds before it — the
loosened-vs-narrow comparison is settled by measurement in both directions, at two gate
levels.
