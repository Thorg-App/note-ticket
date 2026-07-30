# IMPLEMENTATION REVIEW — dep cycle BDD scenarios (nid_fba92yfczp71jjcprn4ufmory_e)

Round 1 reviewed `b0f7f1b`. Round 2 (this pass) reviews the iteration `aea4c27`
(`git diff b0f7f1b..HEAD`). Round-1 findings are kept below with their resolution status.

## Round 2 — confirmation pass

### Green state, re-run by me

- `make test` → exit 0: `12 features, 215 scenarios, 1440 steps, 0 failed` (`.tmp/rev2-make-test.log`)
- `make parity` → exit 0: `graph OK scenarios=71 failures=0 (whitelisted: bash bogus cycles=19)`,
  `query OK`, `slug OK` (`.tmp/rev2-parity.log`) — the whitelisted bogus-cycle count is unchanged.

### Independent mutation matrix (my own mutant, fresh copy of HEAD in `.tmp/rev2-mutant`)

| mutation | unit | the 5 cycle scenarios |
|---|---|---|
| clean | pass | 5 passed |
| `bash-abort` (DFS aborts on first cycle, stack never unwound) | fail 3 | **2 failed** (`Expected 1 cycles but got 3`, `Expected 3 cycles but got 2`) |
| `no-dedup` (drop the `seen` guard) | **fail 1** — exactly `reports a cycle once when a duplicated dep walks the same back edge twice` | 5 passed |
| `numbering` (renderer always emits `Cycle 1:`) | pass | **1 failed** (`Expected cycles numbered [1, 2, 3] but got [1, 1, 1]`) |

Every claim in the implementation's report reproduces. Nothing was taken on faith.

### `order_check.py` — audited, not trusted

Read in full. It is a genuine check, not a proxy:

- It really varies enumeration order: files are written as `0.md`..`3.md` in permutation order, so
  the byte-wise path sort the ticket store relies on yields exactly the requested order. All 24
  permutations per shape.
- It really drives the shipped CLI (`<root>/ticket dep cycle` with `TICKETS_DIR`), not a helper.
- It really applies the scenarios' own assertions: cycle COUNT, each expected MEMBER SET, and the
  `should not contain <id>` clauses. (It re-implements the small parser instead of importing the
  step helper and does not check cycle numbering — acceptable for a throwaway script, and numbering
  is covered by the step itself.)

I re-ran it against a bash-abort mutant **I built myself**, and against clean HEAD:

```
scenario-assertion failures: 48 / 48   (bash-abort mutant)
scenario-assertion failures:  0 / 48   (clean)
```

### Is IMPORTANT 1 structurally closed? Yes.

Not just the 24/24 numbers — the shapes are robust by construction:

- **Two in-pointers** (`1→2`, `2↔3`, `4→3`): the buggy DFS stops at the first back edge and never
  unwinds, so everything it entered stays `on-stack`. Tickets 1 and 4 are unreachable from each
  other and from the cycle, so a single DFS root can consume at most ONE of them; the other is still
  unvisited when `find()` continues, is entered, walks into an `on-stack` node and records a cycle
  naming an in-pointer. That argument never mentions enumeration order, so no rename or slug change
  can weaken it.
- **Three-way overlap** (hub `task-0002` with `1↔2`, `2↔3`, `2↔4`): the abort walks only one of the
  hub's three back edges; each leaf entered afterwards either yields a member set polluted by the
  un-unwound stack or collapses into an already-seen set, so either the count or one member-set
  assertion fails in every order. The three leaves are structurally interchangeable, so reordering
  the `Given` lines (i.e. the hub's `deps` order) cannot weaken it either.

The only way to lose the property is to DELETE an in-pointer or an overlap arm — and the feature file
now carries WHY comments saying exactly that. That is the right mitigation.

### The "BDD is the wrong layer for the dedup test" rationale — ACCEPTED

`tk dep` is idempotent (`Dependency already exists`), so no sequence of CLI commands can produce
`deps: [a, a]`. The only producer is a hand-edited file, and "`depsOf()` returns `deps` verbatim" is
a `src/core/` data-model property — the same layer and the same reasoning as the existing
`TreeLayout` duplicate-dep guard. A BDD scenario would need a new step that writes raw frontmatter
to fabricate a state no user path reaches: more machinery, no additional coverage of anything
user-reachable. The unit test is the correct 80/20 layer, and it is demonstrably non-vacuous — it is
the *only* thing that fails under `no-dedup`.

### Count-of-0 rejection — safe, nothing weakened

`grep` over `features/` shows the step is used only with 1 and 3
(`ticket_dependencies.feature:180,202`). Both legitimate no-cycle arms (`:151`, `:213`) assert
`the output should be "No dependency cycles found"`, which is strictly stronger than a count of 0 and
is untouched by this diff. The guard is a step-usage assertion that fails loudly if a future author
reaches for `exactly 0`.

### New in this diff

1. **`parse_reported_cycles()` docstring is now stale** (`features/steps/ticket_steps.py:126`): it
   still says "Parse `dep cycle` output into a list of member-id sets", but it returns
   `ReportedCycle` objects (number + members). One-line fix; worth doing because that docstring is
   the contract for two step functions.
2. **`scripts/parity/README.md:55` is now stale**: it still says the pinned half is "two overlapping
   cycles (both found)" — the scenario became a three-way overlap (`Cycle detection finds every
   cycle overlapping in one ticket`, asserting 3 cycles). One word to fix ("three overlapping
   cycles (all found)"). `docs-internal/migration-to-ts-high-level.md:119` is still accurate.

Neither is blocking; both are trivial and should be swept up rather than left to rot.

Nothing else new. `ReportedCycle` as a small named class rather than a tuple matches the repo's
"no `Pair`/`Triple`" rule; the scenario titles match what they assert; no pre-existing scenario or
assertion was removed or weakened anywhere in the diff.

## Round 1 findings — resolution status

| # | Finding | Status |
|---|---|---|
| CRITICAL | none | — |
| IMPORTANT 1 | Both new BDD scenarios were non-vacuous only by accident of slug ordering (verified: under a bash-abort mutant with ticket-1 enumerated first, both scenarios PASSED against the bug) | **CLOSED** — robust shapes adopted (two in-pointers / three-way overlap), verified structurally and 48/48 by mutation over all orderings, with WHY comments |
| IMPORTANT 2 | "each cycle reported once" dedup guard untested; the `no-dedup` mutation survived the whole suite (`b deps [a, a]` printed the same cycle twice) | **CLOSED** — the new unit test is the exact and only failure under that mutation |
| Suggestion | `Cycle N:` numbering unpinned (renderer always emitting `Cycle 1:` survived the suite) | **CLOSED** — `step_cycle_count` asserts `1..N`; mutation now caught |
| Suggestion | `exactly 0 dependency cycles` would pass on empty output | **CLOSED** — 0 is rejected with a message pointing at the right step |
| Suggestion | unit fixture reorder was NOT brittle (order explicit in the literal + WHY comments) | unchanged, still fine |

Round-1 verification for the record: `make test` exit 0 (215 scenarios), `make parity` exit 0, and
the bash-abort mutation reproduced 3 unit + 2 scenario failures — the implementation's original
mutation report was honest, including its self-reported vacuity catch.

## Documentation Updates Needed

Only the two stale strings listed under "New in this diff" (`parse_reported_cycles` docstring,
`scripts/parity/README.md:55`). CHANGELOG needs nothing — `dep cycle now reports every cycle exactly
once` is already under Unreleased/Fixed. No CLAUDE.md change required.

## Verdict

**READY.** All three round-1 items are genuinely closed — verified by independent mutation and by
structural reasoning, not by trusting the report. `make test` and `make parity` are green here, and
the order-independence proof holds when run against a mutant I built myself (48/48). The two stale
doc strings are the only outstanding items and are one-liners; fix them on the way out rather than
opening a follow-up ticket.
