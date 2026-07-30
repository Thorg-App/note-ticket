# IMPLEMENTATION REVIEW — dep cycle BDD scenarios (nid_fba92yfczp71jjcprn4ufmory_e)

## Summary

Commit `b0f7f1b` adds a BDD-level pin for the fixed `dep cycle` algorithm: one strengthened
scenario (points-into-a-cycle ⇒ exactly one cycle) and one new scenario (two overlapping
cycles ⇒ both found), backed by a `parse_reported_cycles()` helper and two `@then` steps that
compare member-id SETS; plus one new unit test, one unit fixture reorder, and two doc edits.

All three acceptance criteria are met. I re-ran everything and rebuilt the mutation proof
myself rather than trusting the report:

- `make test` → exit 0 (`12 features, 215 scenarios, 1433 steps, 0 failed`) — `.tmp/rev-make-test.log`
- `make parity` → exit 0 (graph/query/slug OK; whitelisted `bash bogus cycles=19`) — `.tmp/rev-parity.log`
- Independent mutation of `CycleFinder.visit` to bash's abort-on-first-cycle in a throwaway
  `.tmp/` copy: **3 unit tests fail and both target scenarios fail** (`Expected 1 cycles but
  got 2`, `Expected 2 cycles but got 1`). The implementation's mutation report is accurate and
  honest, including its self-reported vacuity catch.

Assessment: good, substantive test work with a genuine (self-found) vacuity fix. Two real
test-strength gaps found with fresh eyes, both cheap to close, neither blocking.

## 🚨 CRITICAL Issues

None. No security surface, no functionality or use-case-focused test removed. The two deleted
assertions (`contain "Cycle 1:"`, `not contain "Cycle 2:"`) were replaced by strictly stronger
ones, and the `Cycle 1:` literal format is still pinned by
`features/ticket_dependencies.feature:158` and `features/nested_folders.feature:167`.

## ⚠️ IMPORTANT Issues

### 1. Both new BDD scenarios are non-vacuous only by accident of slug ordering — undocumented

**Claim.** The discriminating power of BOTH scenarios depends on `_tickets/` enumeration order
(`another-task.md, dependency-task.md, main-task.md`, i.e. task-0003 first). A future,
unrelated rename of a Background title silently turns both scenarios back into passing-against-
the-bug tests. This is precisely the failure mode the repo's memory documents (`fixture named
aaa-newer.md let a path tie-break supply the expected answer`).

**Evidence.** I rebuilt both graph shapes with filenames making ticket-1 enumerate first and
ran them against the bash-abort mutant:

```
=== points-into-cycle, entry at t1 [MUTANT] ===   Cycle 1: t2 -> t3 -> t2        (correct → scenario PASSES against the bug)
=== overlapping 1<->2,2<->3, entry at t1 [MUTANT] ===
Cycle 1: t1 -> t2 -> t1
Cycle 2: t2 -> t3 -> t2                            (both correct → scenario PASSES against the bug)
```

The unit tests do NOT have this problem — their order is explicit in the fixture literal and
carries WHY comments (`test/dep-graph.test.ts`, the `c, b, a` ordering). Only the feature file
is silently order-dependent.

**Suggested fix (pick one).**
- Cheap: a WHY comment on the two scenarios stating that the Background titles' slug order puts
  `task-0003` first, which is what makes the shape discriminate, so renaming those titles
  weakens the scenario. (`features/ticket_dependencies.feature`, around lines 162 and 177.)
- Robust (preferred, still small): make the shapes discriminate at EVERY entry order.
  - points-into-a-cycle: add a second in-pointer, `And ticket "task-0004" depends on "task-0003"`
    — verified, the mutant then emits a bogus `Cycle 2: t3 -> t4 -> t3` even entering at t1.
  - overlapping: use a three-way overlap (`task-0001↔task-0002`, `task-0002↔task-0003`,
    `task-0002↔task-0004`) — verified, the mutant then emits a wrong 3-member cycle
    `t2 -> t3 -> t4 -> t2` instead of `{task-0002, task-0004}` at the t1 entry order.

### 2. The "each cycle reported once" dedup is entirely untested — a plausible mutation survives the full suite

**Claim.** `CycleFinder.record`'s `seen` guard (dedup by normalized member set) — the behavior
the README and CHANGELOG advertise as "each reported once" — is not covered by any unit test,
any scenario, or the parity harness.

**Evidence.** Mutation `no-dedup` (delete the `if (!this.seen.has(key))` guard): **all 294 unit
tests and all cycle scenarios still pass.** The guard is nevertheless load-bearing on a live
input class (hand-edited duplicate `deps`, the same class that already produced a shipped
`dep tree` regression). With `a deps [b]`, `b deps [a, a]`:

```
CLEAN                       NO-DEDUP MUTANT
Cycle 1: aaa -> bbb -> aaa  Cycle 1: aaa -> bbb -> aaa
                            Cycle 2: aaa -> bbb -> aaa   <- same cycle twice
```

Note the pre-existing test `reports a cycle once however many entry points reach it` does NOT
exercise dedup — the `done` marking means a second entry point never re-records; only a
duplicated `deps` entry does.

**Suggested fix.** One unit test in `test/dep-graph.test.ts`:
`graphOf([{ id: "a", deps: ["b"] }, { id: "b", deps: ["a", "a"] }]).cycles()` ⇒ one cycle
`["a","b"]`, with a WHY comment tying it to `depsOf()` returning `deps` verbatim (mirroring the
existing `TreeLayout` duplicate-dep comment). Cheaper and stronger than a BDD scenario, since
`tk dep` is idempotent and cannot create the duplicate.

## 💡 Suggestions

1. **`parse_reported_cycles()` is robust enough, with two known blind spots.** It is not
   silently swallowing anything material: a header that stops matching `^Cycle \d+: ` yields
   count 0 and a loud failure, empty output yields 0, the blank separator is truly empty so it
   cannot be mistaken for a member row, and member rows are keyed off the 2-space indent. Blind
   spots worth closing while it is cheap:
   - Cycle NUMBERING is unpinned: mutating the renderer to always print `Cycle 1:` survives the
     whole suite. Capturing the digits and asserting they are `1..N` in `step_cycle_count` makes
     the step strictly stronger for ~2 lines.
   - `the output should report exactly 0 dependency cycles` would pass on completely empty
     output (missing `No dependency cycles found`). No scenario uses 0 today; either reject 0 in
     the step or keep using `the output should be "No dependency cycles found"` for that arm.
2. **BDD convention:** GIVEN/WHEN/THEN shape is correct and the scenario titles match what they
   assert. The overlapping scenario carries three assertions (count + two member sets), which is
   the right trade here — one-assert-per-test would need three near-duplicate scenarios; no
   change requested.
3. `test/dep-graph.test.ts` fixture reorder is fine and NOT brittle: `graphOf` documents that
   spec order is enumeration order, the order is visible in the literal, and both tests now
   carry WHY comments explaining why the order is the discriminating one. Good.

## Documentation Updates Needed

None blocking. Both doc edits are accurate and succinct:
- `scripts/parity/README.md` §1 correctly states both pinned halves and correctly keeps the
  whitelist until T6 (a buggy bash implementation is still on the other side of the diff) — the
  reasoning is sound.
- `docs-internal/migration-to-ts-high-level.md` bullet matches the code and the
  `DepCycleCommand.render` divergence comment.
- CHANGELOG needed nothing: `dep cycle now reports every cycle exactly once` already exists
  under Unreleased/Fixed (line 29).

## Verdict

**READY.** All three ACs are met, the state is genuinely green, and the mutation proof holds up
under independent reproduction. The two IMPORTANT items are test-strength hardening, not defects
in the shipped behavior — either fold them into a short follow-up pass on this ticket (both are
a handful of lines) or file one `ticket` for them; do not let #2 (dedup untested) be dropped
silently, given this repo's history with exactly that input class.
