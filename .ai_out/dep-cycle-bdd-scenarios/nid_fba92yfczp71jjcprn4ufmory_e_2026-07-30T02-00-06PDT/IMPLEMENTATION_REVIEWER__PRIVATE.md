# PRIVATE — IMPLEMENTATION_REVIEWER notes (nid_fba92yfczp71jjcprn4ufmory_e)

## Round 2 (confirmation pass on `aea4c27`) — appended 2026-07-30

Re-ran everything myself; verdict READY, all three round-1 items closed.

- `make test` exit 0 (215 scenarios, 1440 steps) `.tmp/rev2-make-test.log`; `make parity` exit 0,
  `bash bogus cycles=19` unchanged `.tmp/rev2-parity.log`.
- Fresh mutant of HEAD in `.tmp/rev2-mutant` via `.tmp/rev-mutate.py` (repointed to rev2-mutant),
  logs kept in `.tmp/rev2-mutant/log-*.txt`:
  - `bash-abort` → 3 unit fails + both target scenarios (`Expected 1 got 3`, `Expected 3 got 2`)
  - `no-dedup` → EXACTLY one unit failure, the new duplicate-dep test (my IMPORTANT 2 closed)
  - `numbering` → 1 scenario fails on `Expected cycles numbered [1, 2, 3] but got [1, 1, 1]`
  - TRAP I hit: my first rerun captured `DG_ORIG` from an already-mutated tree, so "clean"
    restored the mutant. Recreated the copy from HEAD before trusting any row.
- Read `order_check.py` line by line: permutes filenames `0.md`..`3.md` (real enumeration-order
  variation), drives `<root>/ticket dep cycle` (real CLI), asserts count + each member set + the
  `not contain` ids — i.e. the scenarios' own assertions, not a proxy. Ran it against a mutant I
  built MYSELF: 48/48 failures; clean 0/48. Logs `.tmp/rev2-ordercheck-{mutant,clean}.log`.
  It does NOT check numbering — fine, the step does.
- Structural argument (independent of the 24/24 numbers) for why IMPORTANT 1 is really closed:
  two in-pointers unreachable from each other means one DFS root can consume at most one, so the
  other always gets entered after the abort → bogus cycle in EVERY order; three-way overlap leaves
  the hub's remaining back edges unwalked in every order and pollutes member sets via the
  un-unwound stack. Neither argument mentions file names, so renames cannot un-discriminate.
- Accepted the BDD-is-wrong-layer rationale for the dedup test: `tk dep` is idempotent, duplicate
  deps only come from hand-edited files, and that is a `src/core/` property (same as the
  `TreeLayout` duplicate-dep guard).
- Count-0 rejection: only 1 and 3 are used in features; both no-cycle arms assert the exact
  `No dependency cycles found` text. Nothing weakened.
- NEW (non-blocking, reported): `parse_reported_cycles()` docstring still says "list of member-id
  sets" though it returns `ReportedCycle`; `scripts/parity/README.md:55` still says "two
  overlapping cycles (both found)" though the scenario is now a three-way overlap.
- Cleanup pending at write time: `.tmp/rev2-mutant` removed at end; `git status` clean; no source
  modified; `order-check-work/` scratch dir removed from OUT_DIR.

---

## Round 1 (on `b0f7f1b`)

## What I did (independent verification, nothing taken on faith)

1. Read commit `b0f7f1b` in full (`git diff b3914fe..HEAD`), plus `src/core/dep-graph.ts`,
   `src/cli/commands/dep-cycle.ts`, `test/dep-graph.test.ts`, `test/graph-commands.test.ts`,
   the whole cycle block of `features/ticket_dependencies.feature`, `parse_reported_cycles`,
   `scripts/parity/README.md` §1, `docs-internal/migration-to-ts-high-level.md`, CHANGELOG.
2. `make test` → exit 0 (`12 features, 215 scenarios, 1433 steps, 0 failed`), log
   `.tmp/rev-make-test.log`. `make parity` → exit 0 (graph/query/slug OK, whitelisted
   "bash bogus cycles=19"), log `.tmp/rev-parity.log`.
3. Built my OWN mutation matrix (`.tmp/rev-mutate.py`, throwaway copy in `.tmp/rev-mutant`,
   logs preserved in `.tmp/rev-logs/`) over four plausible mutations:

| mutation | unit tests | the 5 cycle BDD scenarios |
|---|---|---|
| clean | pass | 5 passed |
| `bash-abort` (visit returns bool, DFS aborts on first cycle, stack never unwound) | **fail 3** | **2 failed** (`Expected 1 cycles but got 2`, `Expected 2 cycles but got 1`) |
| `no-dedup` (drop the `seen` guard in `CycleFinder.record`) | pass | 5 passed → **SURVIVES** |
| `reverse-order` (iterate `tickets()` reversed) | fail 4 | 5 passed (fine, pinned at unit layer) |
| `numbering` (always emit `Cycle 1:`) | pass | 5 passed → **SURVIVES** |

   `bash-abort` unit failures: `reports a cycle once however many entry points reach it`,
   `finds both of two cycles overlapping in one ticket`,
   `does not invent a cycle for a node that merely points into a real cycle` — matches the
   implementation's claim exactly. Its mutation report is HONEST.

4. Proved the `no-dedup` gap is real, not theoretical: fixture `a deps [b]`, `b deps [a, a]`
   → clean prints one cycle, no-dedup mutant prints the SAME cycle twice. Nothing in the
   suite catches it.

5. Probed the ORDER-FRAGILITY of the two BDD scenarios by re-creating both shapes with
   filenames that make ticket-1 enumerate FIRST, under the bash-abort mutant:
   - points-into-cycle (`a→b, b→c, c→b`): mutant prints exactly `Cycle 1: t2 -> t3 -> t2`
     → the strengthened scenario would PASS against the bug.
   - overlapping (`1↔2, 2↔3`): mutant prints both correct cycles → the new scenario would
     PASS against the bug.
   So both scenarios discriminate ONLY because behave's Background titles slug to
   `another-task, dependency-task, main-task` (task-0003 first). Undocumented in the feature
   file.
6. Found order-ROBUST shapes empirically/analytically: adding a second in-pointer
   (`d→c` alongside `a→b, b→c, c→b`) makes the mutant emit a bogus `Cycle 2: t3 -> t4 -> t3`
   at the a-first entry order (and by the same argument at every other entry order, since the
   abort always leaves one in-pointer unvisited). A three-way overlap (`1↔2, 2↔3, 2↔4`) makes
   the mutant emit a wrong 3-member cycle `t2 -> t3 -> t4 -> t2` instead of `{t2,t4}`.

## Judgement

The change is real work, correctly scoped, all three ACs met, no functionality removed (the
two deleted assertions were replaced with strictly stronger ones; `Cycle 1:` literal is still
pinned in the two-ticket scenario and `features/nested_folders.feature:167`). Verdict READY
with two follow-ups (BDD order-fragility comment/hardening; missing dedup-by-member-set test).

## Cleanup
`.tmp/rev-mutant`, `.tmp/fx`, `.tmp/dupdeps` deleted; `git status` clean; no source modified.
