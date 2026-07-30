# IMPLEMENTATION_WITH_SELF_PLAN — PRIVATE memory (ticket nid_8cislepljqvv88ayndtjlw34k_e, T4)

Status: **DONE**. `make build && make unit-test && make test && make parity` all green
(exit 0). Two commits on branch `nid_8cislepljqvv88ayndtjlw34k_e_2026-07-29T23-32-59PDT`:
`94242f2` (implementation) and `e934523` (mutation-driven test strengthening + docs).

## The single most important discovery

**`src/core/dep-graph.ts` already contained everything.** T2 had built `tree()`,
`cycles()`, `children()`, `activeDependents()` AND had them byte-verified against bash by
the parity harness (via `scripts/parity/dump.ts`). T4 was therefore ~90% CLI wiring, not
algorithm work. The only core addition was `blockerIdsOf(id)` (deps that are not closed,
in `deps` order) — extracted so `blocked()` and `show`'s `## Blockers` share one rule.

Do NOT rewrite the graph algorithms. `TreeLayout.measureSubtreeDepths`'s "snapshot the
pending list" comment is load-bearing and was verified against bash on generated graphs.

## Plan I followed

1. Read bash `cmd_dep_tree` / `cmd_dep_cycle` / `cmd_dep` / `cmd_show` / `ticket_path`.
2. **Measure** every edge case against a copy of `ticket` with the delegation lists emptied
   (`.tmp/exp/mkrepo.py` builds it, mirroring `scripts/parity/harness.BashReference`).
3. Wire CLI commands; keep bash implementations in place (rollback path).
4. Update parity harness (it was comparing TS-vs-TS risk again) + BDD + unit tests.
5. Mutation-test every guard; fix the vacuous ones.
6. Docs.

## Measured bash behavior (all verified, not read off the source)

`awk` here is **mawk**, and `index("abc", "") == 1` — that is the root of the empty-id bug.

| Invocation | bash |
|---|---|
| `dep tree` (no id) | `Usage: ticket dep tree [--full] <id>` on stderr, rc 1, **before** reading any file |
| `dep tree --full` | same usage error (no id) |
| `dep tree ""` | same usage error (`root_id` is empty ⇒ never reaches resolution) |
| `dep tree b a` | root is **`a`** — the arg loop assigns every non-flag arg, last wins |
| `dep tree a --full` | flag may follow the id |
| `dep tree ghost` in an **empty** tickets dir | rc 0, no output (the file-collection guard returns first) |
| `dep cycle` in an empty dir | rc 0, **no output at all** (not "No dependency cycles found") |
| `dep cycle junk` | extra args ignored |
| `dep tree <ambiguous>` | `Error: ambiguous ID abc` — **unquoted**, unlike `ticket_path`'s `Error: ambiguous ID 'abc' matches multiple tickets` |
| `dep tree " a "` | not found — `cmd_dep_tree` does NOT trim, `ticket_path` does |
| `show` (no id) | `Usage: ticket show <id>`, rc 1 |
| `show ""` in a 1-ticket repo | **succeeds**, prints that ticket (`index(id,"")==1`) |
| `show ""` in a 2-ticket repo | `Error: ambiguous ID '' matches multiple tickets` |
| `show` dangling dep/link | `- ghost [] ` — trailing space, empty status and title |
| `show` Blocking/Children order | awk `for (id in arr)` **hash order**; measured `zz_blk, aa_blk, mm_blk` for files `aa,cl,mm,zz` — neither path nor id order |
| `show` when a ticket lists the target twice in `deps` | prints that Blocking row **twice** |
| `show` on a file with no final newline | awk `getline` adds one |
| `show` parent line | `parent: par  # Parent` (two spaces, `#`, one space) only inside the FIRST frontmatter block and only when the parent id is a known ticket |

Usage strings hardcode the word `ticket`, they do NOT interpolate `$0` (unlike `cmd_help`).

## Design decisions and why

- **`TS_DEP_SUBCOMMANDS="tree cycle"`, a second list.** `dep` cannot go into `TS_COMMANDS`
  (its default form is a write). Rejected alternative: pseudo-entries like `dep-tree` in
  `TS_COMMANDS` — the top-level dispatcher would then route a literal `tk dep-tree` to node,
  and `dep tree` (with a space) would make `" dep "` a substring of the list and hijack the
  whole `dep` command. Two explicit lists, both consumed by `_ts_serves`/`_exec_ts`.
- **`_ts_serves` needs `[[ -n "$2" && … ]]`.** With an EMPTY list (how the harness disables
  delegation) `" " == *" "*` is true, so a bare `tk dep` matched and the pinned bash copy
  tried to exec a nonexistent bundle. Found by the comparison run, not by reading.
- **`dep tree` resolves against `graph.tickets()`, not `store.loadAll()`.** Three BDD
  scenarios create a second file with an id the Background already used; bash collapsed
  duplicates in its awk array so there was no ambiguity, and `IdResolver` over raw files
  reported `ambiguous ID task-0001`. Resolving over the graph (id-keyed, last file wins) is
  exactly bash's population. This cost me one red BDD run — do not "fix" the fixtures.
- **`UsageError extends CliError`** overriding `stderrText`: bash's `Usage:` lines carry no
  `Error: ` prefix, and `main.ts` must keep exactly one rendering path.
- **Two error wordings kept** in `src/cli/ticket-lookup.ts`. Unifying them would be a
  second, unasked-for divergence.
- **`ChildExit`** extracted from `Jq` and reused by the new `Pager` (adopt status, else
  128+signal, else "never ran").
- **`show` echoes the file line-by-line** from `Ticket.text()` rather than re-serialising,
  reproducing awk's `getline` newline-termination.

## Mutation testing (`.tmp/exp/mutate.py`, 16 mutations — ALL now caught)

Round 1: 13/16. **Three were vacuous**, all fixed:

1. `inverse-children-parent` (`ticket.parent === id` → `ticket.parent !== ""`) — the
   `DepGraph relationships` fixture had no ticket with a *different* parent. Added
   `other-child`.
2. `show-parent-annotation-parity` (drop the `# <title>` suffix) — `harness.write_scenario`
   emits **no `parent:` field at all**, so parity never saw one.
3. `show-section-order` (swap Blocking/Children) — same root cause: with no parents there is
   never a Children section, so no section ORDER exists to compare.

Fix for 2+3: `check_graph._check_show_relations`, a hand-written fixture where all four
sections appear with exactly one row each (so bash's hash order cannot make it flaky), plus
a non-vacuity assertion that the fixture still produces all four headings and the
annotation. Re-ran: 3/3 caught.

Caught mutations: tree dedup-at-max-depth (unit + parity), sibling id tie-break, sibling
subtree-depth sort, cycle normalization rotation, cycle "abort like bash" (BDD), blocking
excludes closed, children by parent, blockers drop-closed filter, show parent annotation
(unit + parity), show row format (parity), show section order (parity), exact-beats-partial
(BDD), empty-id-matches-nothing (BDD), `TS_DEP_SUBCOMMANDS=""` rollback (BDD).

## Dead ends / traps for the next run

- Do not byte-compare `show` over generated scenarios — bash's section row order is awk hash
  order. `_show_mismatches` compares the echoed file and the heading SEQUENCE byte-wise and
  the rows within a section as sorted sets.
- `grep`-ing a long-running command's output buffers it; the mutation run looked hung.
- The mutation script restores files with `git checkout -- <path>`; never edit a file while
  it runs.
- `make parity` must stay dependent on `make build`, and `BashReference` must empty BOTH
  delegation variables (it now raises if either assignment is missing).

## File-by-file state

New: `src/cli/commands/dep.ts`, `dep-tree.ts`, `dep-cycle.ts`, `show.ts`;
`src/cli/ticket-lookup.ts`, `src/cli/pager.ts`, `src/cli/child-exit.ts`;
`test/graph-commands.test.ts`.
Changed: `src/core/dep-graph.ts` (+`blockerIdsOf`), `src/cli/ticket-row.ts`
(+`identified`, `idColumn` public and string-typed), `src/cli/cli-error.ts` (+`UsageError`),
`src/cli/jq.ts` (uses `ChildExit`), `src/cli/main.ts` (+`dep`, `show`), `ticket`
(`_ts_serves`/`_exec_ts`, `show` in `TS_COMMANDS`, `TS_DEP_SUBCOMMANDS`, `cmd_dep` delegates),
`scripts/parity/{harness.py,check_graph.py,dump.ts,README.md}`,
`features/{id_resolution,ticket_dependencies}.feature`, `test/dep-graph.test.ts`,
`README.md`, `CLAUDE.md`, `docs-internal/migration-to-ts-high-level.md`.
Bash `cmd_dep_tree`/`cmd_dep_cycle`/`cmd_show` are **deliberately kept** — they are the
rollback path and the parity harness's other side.

Not done here (owned elsewhere): CHANGELOG entry (TOP_LEVEL_AGENT), closing the ticket.
`.tmp/exp/` is scratch and is gitignored-by-convention (untracked, left in place).

---

## Round 2 (review follow-up) — DONE, all four gates green

Cleanup only, zero shipped behavior change. `make build && make unit-test && make test &&
make parity` → exit 0 (289/289 unit, 214 scenarios, parity graph/query/slug all OK).

What changed:
- **Divergence #8 labelling.** Round 1 said "both human-approved" — WRONG. The closed
  decision ticket `nid_5g3eta9cf7yi6iukmscxma6wc_e` covers #9 (id resolution) only. #8's
  duplicate-row removal is pending sign-off in `nid_qxt3z5unr9k220aqttbw84a6a_e` (`decide`).
  Corrected in `scripts/parity/README.md`, `docs-internal/migration-to-ts-high-level.md`
  and the PUBLIC file. **If that ticket is approved, flip the wording in all three.**
- `test/graph-commands.test.ts` — the dangling-dep tree test was named for the opposite of
  its assertion; renamed to "omits a dangling dependency…"; the awk-array comment moved to
  the `show` test that really asserts `- ghost [] `.
- `src/core/id.ts` — stale "needs human confirmation" pointer replaced with the closed
  ticket + divergence #9 reference.
- `TicketRow.paddedIdentified()` added; `dep-cycle.ts` uses it; `idColumn` is **private
  again** (it had only been made public for that one call site).
- **`TreeLayout.layoutChildren`'s re-check DELETED** (was dead). Argument, re-derived: a
  child is listed only when `maxDepth[child] === depth + 1`, an earlier sibling's subtree
  prints only at depths `>= depth + 2`, so `printed` cannot gain it in between; `--full`
  makes `isPrintable` state-independent anyway. A WHY-NOT comment records this and that
  bash re-checks at pop time. Parity byte-compares `dep tree`/`--full` for every ticket of
  69 scenarios and stayed green. Do NOT re-add it without a failing case.
- `CLAUDE.md` — harness copy now described as emptying BOTH delegation lists.

Measured this round (throwaway repo under `.tmp/vrepo`, built bundle):
- `dep tree`/`dep cycle`/`show` on a repo containing an id-less `.md` → `Error: <path> has
  no 'id' frontmatter field`, rc 1 (all three).
- `show ""` → `Error: ticket '' not found`, rc 1.
- Pager missing-binary arm, **under a real TTY** via `script -qec "TICKET_PAGER=nosuchpager
  ticket show <id>"` → `Error: nosuchpager: command not found`. Round 1 called this
  unmeasured; it is measured now (still no automated test — no TTY in BDD/parity).

CHANGELOG is still NOT written here (TOP_LEVEL_AGENT owns it); the exact seven-item content
list is in the PUBLIC file. Note the reviewer misattributed the missing-`id` command list to
README — it is `CHANGELOG.md:13`; README has no per-command enumeration.

---

## Round 3 — REGRESSION FIX. The round-2 deletion was WRONG.

**Do not delete `TreeLayout.layoutChildren`'s `isPrintable` re-check. Ever.**

Round 2 removed it on a REASONED unreachability argument. The argument only covered the
cross-sibling-subtree case. It missed the one that matters: **`deps` is not deduplicated.**
`DepGraph.depsOf()` returns `Ticket.deps` verbatim and `printableChildren()` only filters
and sorts, so `deps: [b, b]` puts `b` in `children` TWICE; the first push marks it printed
and the re-check is what drops the second.

Measured myself before touching anything (fixture `.tmp/duptest`, bash = `.tmp/ticket_bash`
with both delegation lists emptied):

| | `dep tree aaa` | `dep tree --full aaa` |
|---|---|---|
| bash | `aaa`, `├── bbb` | `aaa`, `├── bbb`, `└── bbb` |
| HEAD `4604477` | `aaa`, `├── bbb`, `└── bbb` ← EXTRA ROW | same as bash |
| after fix | byte-identical to bash | byte-identical to bash |

Note the `├──` on the surviving row: `isLast` is computed against the UNFILTERED children
list, so the only child still gets a branch connector. bash does the same. That quirk is
asserted in the unit test — do not "clean it up".

Restored with a comment naming the real reason (duplicate `deps` entries), not the old
"an earlier sibling's subtree may have printed it".

### Guards added, each MUTATION-verified

1. `test/dep-graph.test.ts` — two tests: duplicate dep printed once (default, `├──`) and
   twice (`--full`). Deleting the guard ⇒ `make unit-test` rc=2, exactly the default-mode
   test red (291 tests, 1 fail). Restored ⇒ 291/291.
2. `scripts/parity/harness.py` — TWO new `FIXED_SCENARIOS`: `duplicate-dep` and
   `duplicate-dep-with-subtree`. This is item 3 of the brief and I took the PREFERRED
   option (teach the generator) rather than filing a follow-up: `random_scenarios` builds
   `deps` by a set-like comprehension over distinct ids, so it structurally cannot emit a
   duplicate — the shape has to be a fixed fixture, and adding two tuples costs nothing.
   Verified by mutation: with the guard deleted, `make parity PARITY_ARGS="--random 0"`
   FAILS with `MISMATCH ... check=[dep tree a]` on both new scenarios. **That is the proof
   the earlier mutation runs never had.**
3. `scripts/parity/check_graph._show_mismatches` — the new scenarios first tripped the
   generic `show` comparator on whitelisted divergence #8 (bash emits one `## Blocking`
   row per matching `deps` ENTRY, so `deps: [b, b]` gives two identical rows; TS gives
   one). Measured, not guessed. Rows within a section are now compared as a true SET
   (`sorted(set(...))`) instead of a sorted list. This does NOT weaken the pin: the count
   difference is still pinned exactly by `_check_show_duplicate_blocking` (bash 2, TS 1),
   and a genuinely missing row still fails. Documented in `scripts/parity/README.md` #8.

### Round-3 verification (actual)

| Gate | rc | Result |
|---|---|---|
| `make build` | 0 | `dist/ticket.mjs` 61.5 kb |
| `make unit-test` | 0 | 291 pass, 0 fail, 0 skipped (was 289; +2) |
| `make test` | 0 | 12 features, 214 scenarios, 1420 steps, 0 failed |
| `make parity` | 0 | graph OK **scenarios=71** (was 69), failures=0; query OK; slug OK |

`.tmp/` is gitignored, so the reproduction fixtures were left in place (nothing stray is
tracked). Logs: `.tmp/f_{build,unit,test,parity}.log`, mutation logs
`.tmp/r2_unit_mutated.log` and `.tmp/f_parity_mut.log`.

### Lesson to carry
An unreachability proof about tree layout is only worth what it is measured against. The
input class was already staring at us — divergence #8 exists *because* duplicate `deps`
entries are real.

---

## Round 4 — narrow the `show` row dedup in the parity harness (harness-only)

The round-3 judgement call was WRONG in the same shape as round 2: I widened
`_show_mismatches` to `sorted(set(...))` for ALL FOUR headings by reasoning, when only
`## Blocking` has the divergence. `deps`/`links` are not deduplicated and BOTH sides repeat
the row for `## Blockers` / `## Linked`, so multiplicity there is real parity that went
unguarded.

### Fix
`scripts/parity/check_graph.py::_show_mismatches`:

    dedupe = (lambda rows: sorted(set(rows))) if heading == BLOCKING_HEADING else sorted
    if dedupe(bash_rows) != dedupe(ts_sections[heading]):

`BLOCKING_HEADING = "## Blocking"` is a new module constant next to `SHOW_ROW_PREFIX`, also
used by `_check_show_duplicate_blocking` (it had the literal twice). Comments narrowed in
the module docstring, at the comparison, in `_check_show_duplicate_blocking`'s docstring, and
in `scripts/parity/README.md` #8. The migration doc says nothing about the harness's
comparison mechanism, so it needed no change.

### BOTH mutation directions, reproduced by ME (not taken on trust)
Mutation = `src/cli/commands/show.ts:109` → `[...new Set(ids)].map(...)` (the plausible
"list each ticket once" cleanup; `section()` is shared by all four sections).

| State | `make parity` | Evidence |
|---|---|---|
| mutation + OLD harness | **rc=0**, `graph OK scenarios=71 failures=0` | the hole, confirmed first |
| mutation + NEW harness | **rc=2**, `failures=2` | `MISMATCH scenario=[duplicate-dep] check=[show a (## Blockers rows)]` and the same for `duplicate-dep-with-subtree` |
| clean sources + NEW harness | **rc=0** | no false positive from divergence #8 |

### Unit fixture decision: ADDED (not deferred)
The reviewer left it optional. Two tests in `test/graph-commands.test.ts`
("repeats a dependency listed twice under Blockers" / "…link… under Linked") — six lines,
and they make the regression fail at the fast gate instead of only in the 3-minute parity
run. Mutation-verified: with the `new Set` mutation `make unit-test` → **rc=2, tests 293,
pass 291, fail 2**, and the two red ones are exactly the new ones. Clean → 293/293.

### Round-4 verification (actual)
| Gate | rc | Result |
|---|---|---|
| `make build` | 0 | `dist/ticket.mjs` built |
| `make unit-test` | 0 | tests 293 / pass 293 / fail 0 / skipped 0 (291 before; +2) |
| `make test` | 0 | 12 features, 214 scenarios, 1420 steps, 0 failed |
| `make parity` | 0 | graph OK scenarios=71 failures=0; query OK; slug OK |

Logs: `.tmp/r3_f_{build,unit,test,parity}.log`; mutation logs `.tmp/r3_parity_mutA.log`
(hole), `.tmp/r3_parity_mutB.log` (caught), `.tmp/r3_unit_mut.log`.

### Lesson (third time, same shape)
Twice now a guard was widened/removed on an argument and shipped a hole. Rule for this
repo: **any comparison that is loosened must be accompanied, in the same change, by the
mutation that proves it still bites.** If the mutation cannot be constructed, the loosening
is too broad.
