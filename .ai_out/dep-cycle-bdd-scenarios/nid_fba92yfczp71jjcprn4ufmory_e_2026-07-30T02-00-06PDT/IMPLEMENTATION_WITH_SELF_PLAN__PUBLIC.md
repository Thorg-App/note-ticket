# PUBLIC — dep cycle BDD scenarios (nid_fba92yfczp71jjcprn4ufmory_e)

## Iteration 1 (post-review, on top of b0f7f1b)

All three reviewer items ACCEPTED and implemented; none rejected.

**1. Order-robust shapes (was: non-vacuous only by accident of slug order).** Took the
reviewer's preferred robust fix, not the comment-only one, plus a WHY comment on each:
- points-into-a-cycle now has TWO in-pointers (`task-0001 -> task-0002`, `task-0004 ->
  task-0003`). After the buggy abort there is always an in-pointer left to be entered,
  whichever file is enumerated first.
- the overlapping scenario is now a THREE-way overlap on `task-0002`
  (`task-0001↔task-0002`, `task-0002↔task-0003`, `task-0002↔task-0004`), renamed to
  `Cycle detection finds every cycle overlapping in one ticket`, asserting 3 cycles and all
  three member sets.

Proof of order-independence: `order_check.py` (kept next to this file) rebuilds both shapes
under **all 24 filename permutations** each — the file name decides enumeration order — and
applies the scenarios' own assertions:

```
python3 .tmp/order_check.py .            # clean:  scenario-assertion failures: 0 / 48
cd .tmp/mutant && python3 ../order_check.py .   # mutant (a): failures: 48 / 48
```

So the shapes discriminate at EVERY entry order; a Background title rename cannot
un-discriminate them.

**2. Dedup guard now covered.** New unit test `reports a cycle once when a duplicated dep
walks the same back edge twice` — `a deps [b]`, `b deps [a, a]` ⇒ exactly one cycle
`["a","b"]`, with a WHY comment tying it to `depsOf()` returning `deps` verbatim. (BDD would
be the wrong layer: `tk dep` is idempotent and cannot create the duplicate.)

**3. Cycle numbering pinned.** `parse_reported_cycles()` now returns `ReportedCycle` objects
(number + members) and `step_cycle_count` asserts the headings are numbered `1..N`. It also
now REJECTS an expected count of 0 (empty output would satisfy it) and says to use
`the output should be "No dependency cycles found"` for that arm — the reviewer's second
blind spot.

### Mutation matrix (iteration 1) — each mutation produces a failure

| Mutation (in `$PWD/.tmp/mutant`, rebuilt) | Unit tests | BDD | 24×2 order check |
|---|---|---|---|
| (a) `CycleFinder.visit` aborts DFS on first cycle (bash) | `fail 3` | both target scenarios fail (`Expected 1 cycles but got 3`, `Expected 3 cycles but got 2`) | 48/48 fail |
| (b) `seen` dedup guard deleted from `record` | `fail 1` — the new dedup test, and ONLY it | full suite still green (as the reviewer found) | n/a |
| (c) renderer always prints `Cycle 1:` | `fail 0` | 1 scenario fails: `Expected cycles numbered [1, 2, 3] but got [1, 1, 1]` | n/a |

Unmutated: `make test` exit 0 (`215 scenarios, 0 failed`; unit `pass 295, fail 0`),
`make parity` exit 0 (graph/query/slug OK, whitelisted `bash bogus cycles=19` unchanged).
Logs: `.tmp/mut-{a,b,c}-{unit,bdd}.log`, `.tmp/order-{clean,…}.log`, `.tmp/make-test-r2.log`,
`.tmp/parity-r2.log`. The mutant tree was deleted afterwards.

Unit fixture reorders from iteration 0 left alone, as the reviewer advised. Docs unchanged in
this iteration (both edits were reviewed as accurate); CHANGELOG still needs nothing.

---

## Iteration 0

## Result
All three acceptance criteria met. `make test` (215 BDD scenarios, 294 unit tests) and
`make parity` are green. Nothing committed; ticket left open.

## What was done

1. **Two new behave steps** (`features/steps/ticket_steps.py`) + parser
   `parse_reported_cycles()` that turns `dep cycle` output into one member-id SET per
   reported cycle:
   - `the output should report exactly N dependency cycle(s)`
   - `the output should report a dependency cycle with members "a, b"`
   WHY sets: assertions stay independent of which member a cycle's walk starts at, while
   still being exact about count and membership (a plain `not contain "Cycle 2:"` says
   nothing about WHICH cycles were found).

2. **AC1 — strengthened the existing scenario** (`Cycle detection does not report a ticket
   that only points into a cycle`, a->b, b->c, c->b). It already asserted `not contain
   "Cycle 2:"` / `not contain "task-0001"`, i.e. it was NOT vacuous against the old bash
   behavior; it now asserts *exactly 1* cycle with members `task-0002, task-0003`.

3. **AC2 — new scenario** `Cycle detection finds both of two overlapping cycles`:
   task-0001 <-> task-0002 and task-0002 <-> task-0003, the two cycles sharing task-0002.
   Asserts exactly 2 cycles and both member sets. This is the half bash MISSED (its DFS
   aborted at the first cycle, so task-0002's second back edge was never walked).

4. **Unit tests** (`test/dep-graph.test.ts`): added `finds both of two cycles overlapping in
   one ticket`; the existing `does not invent a cycle for a node that merely points into a
   real cycle` had its fixture reordered (same assertion) because in its original order the
   buggy algorithm answers correctly — see mutation evidence.

5. **Docs**: parity README divergence #1 now names both pinned halves; migration doc gained
   the missing `dep cycle` bullet in its behavior-change list. CHANGELOG needed nothing —
   `dep cycle now reports every cycle exactly once` is already under Unreleased/Fixed.

## AC3 — search for scenarios encoding the buggy bash output
`grep -in cycle features/*.feature` — every hit reviewed:
- `features/ticket_dependencies.feature`: 77 (`dep tree` handles cycles), 147 (acyclic ⇒
  `No dependency cycles found`), 153 (real 2-ticket cycle), 165 (points-into-cycle — already
  asserted the bogus `Cycle 2:` must NOT appear), 175 (closed tickets ignored).
- `features/nested_folders.feature:159`: a genuine 2-ticket cycle across folders, asserts
  `Cycle 1:` plus both ids.
- `features/ticket_status.feature:98` — unrelated ("close-reopen-close cycle").
- `test/dep-graph.test.ts` `DepGraph.cycles` — all expectations are correct-algorithm ones.
**No scenario or unit test encoded the buggy output.**

## Mutation evidence (non-vacuity)
Repo tree copied to `$PWD/.tmp/mutant` (`tar` pipe, excluding `.git`/`.tmp`/`.ai_out`), then
`.tmp/mutant/src/core/dep-graph.ts` `CycleFinder.visit` mutated to the bash algorithm:
`visit` returns a boolean and the DFS ABORTS on the first cycle (`if (this.visit(dep)) return
true;`), so the stack is never unwound and entered nodes stay marked `on-stack` forever.

```
tar --exclude=./.git --exclude=./.tmp --exclude=./.ai_out -cf - . | tar -xf - -C .tmp/mutant
# edit .tmp/mutant/src/core/dep-graph.ts (abort-on-first-cycle)
cd .tmp/mutant && make build && uv run --with behave behave features/ticket_dependencies.feature \
  -n "Cycle detection does not report a ticket that only points into a cycle" \
  -n "Cycle detection finds both of two overlapping cycles"
```

Observed (mutant, exit 1 — `0 scenarios passed, 2 failed`):

```
Scenario: ... only points into a cycle
  ASSERT FAILED: Expected 1 cycles but got 2
  Cycle 1: task-0003 -> task-0002 -> task-0003
  Cycle 2: task-0002 -> task-0001 -> task-0002      <- bogus, task-0001 is not in a cycle

Scenario: ... finds both of two overlapping cycles
  ASSERT FAILED: Expected 2 cycles but got 1
  Cycle 1: task-0002 -> task-0001 -> task-0002      <- the {task-0002,task-0003} cycle missed
```

Unmutated, both scenarios pass (`2 scenarios passed, 0 failed`).

Unit tests, same mutant (`cd .tmp/mutant && make unit-test`): `fail 3` — the two dep-graph
tests above plus the pre-existing `reports a cycle once however many entry points reach it`.
Unmutated: `pass 294, fail 0`.

**A real vacuity caught by this procedure:** my first spelling of the overlapping unit test
listed the graph as `a, b, c` and PASSED under the mutation — entering at `a`, the aborting
algorithm stumbles onto the second cycle through the stack it failed to unwind. The same was
true of the pre-existing points-into-a-cycle unit test. Both were reordered so the entry
point is the one that discriminates, and both now fail under the mutation. (The BDD scenarios
were unaffected: the tickets' file order there is `another-task, dependency-task, main-task`,
i.e. already the discriminating order.) WHY comments in the test file record this.

`.tmp/mutant` was deleted afterwards; logs remain in `.tmp/` (`mutant-scenarios.log`,
`mutant-unit3.log`, `make-test-final.log`, `parity.log`).

## Files modified
- `features/ticket_dependencies.feature` — strengthened one scenario, added one
- `features/steps/ticket_steps.py` — `parse_reported_cycles()` + 2 `@then` steps
- `test/dep-graph.test.ts` — 1 new test, 1 fixture reorder (assertion unchanged)
- `scripts/parity/README.md` — divergence #1 wording
- `docs-internal/migration-to-ts-high-level.md` — `dep cycle` behavior-change bullet

## Test results (honest)
- `make test` → exit 0: `12 features passed, 215 scenarios passed, 0 failed`; unit
  `tests 294, pass 294, fail 0`
- `make parity` → exit 0 (graph/query/slug OK; whitelisted "bash bogus cycles=19" unchanged)

## Notes / follow-ups
- No divergence entry needed removal: bash `dep cycle` is still on the other side of the
  parity diff until T6, so whitelist #1 stays.
- The ticket is NOT closed and nothing is committed, per instructions.
