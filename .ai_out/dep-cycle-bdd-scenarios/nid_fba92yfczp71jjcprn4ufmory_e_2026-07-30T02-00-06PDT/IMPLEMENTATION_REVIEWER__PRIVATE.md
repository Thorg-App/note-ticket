# PRIVATE — IMPLEMENTATION_REVIEWER notes (nid_fba92yfczp71jjcprn4ufmory_e)

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
