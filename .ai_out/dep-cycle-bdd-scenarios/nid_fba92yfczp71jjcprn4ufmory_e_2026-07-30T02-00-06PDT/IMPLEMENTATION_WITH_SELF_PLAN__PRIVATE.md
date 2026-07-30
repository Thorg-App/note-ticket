# PRIVATE — dep cycle BDD scenarios (nid_fba92yfczp71jjcprn4ufmory_e)

## Task
Ticket: `_tickets/dep-cycle-bash-reports-non-cycles-add-bdd-scenario-when-t4-flips-it.md`.
T4 is merged, `dep cycle` is served by TS (`TS_DEP_SUBCOMMANDS="tree cycle"`).
AC1: scenario for a->b, b->c, c->b asserting EXACTLY ONE cycle.
AC2: scenario for TWO OVERLAPPING cycles, both found.
AC3: confirm no scenario anywhere encoded the buggy bash output.
Must prove non-vacuity by MUTATION under `$PWD/.tmp/` copy.

## Recon findings
- `features/ticket_dependencies.feature` Background creates task-0001 "Main task",
  task-0002 "Dependency task", task-0003 "Another task".
- Existing cycle scenarios: lines 147 (acyclic), 153 (two-ticket cycle), 165
  (points-into-cycle: already asserts `not contain "Cycle 2:"` and `not contain
  "task-0001"` — AC1 largely covered, needs verification/strengthening), 175 (closed
  ignored). `features/nested_folders.feature:159` asserts `Cycle 1:` across folders.
- TS impl: `src/core/dep-graph.ts` `CycleFinder` (records every back edge, dedups by
  normalized member set); rendering in `src/cli/commands/dep-cycle.ts`
  (`Cycle N: a -> b -> a` + one indented `paddedIdentified` row per member, blank line
  between cycles).
- Parity README divergence #1 already says "T4 flipped `dep cycle` to TS and BDD
  scenarios now pin the TS behavior". Migration doc's behavior-change list has NO
  `dep cycle` bullet → add one succinct bullet.

## Plan
1. Add two behave steps (strict, order-independent assertions on the cycle blocks):
   `the output should report exactly N dependency cycles` and
   `the output should report a dependency cycle with members "a, b"`.
2. Strengthen the line-165 scenario with the exact-count + member-set assertions.
3. Add the two-overlapping-cycles scenario (0001<->0002 and 0002<->0003, sharing 0002).
4. Mutation-verify in `$PWD/.tmp/mutant/` (copy of repo): make `CycleFinder` behave like
   bash (abort DFS on first cycle, leave nodes "on-stack"), rebuild, run the two
   scenarios, show FAIL; revert mutation → PASS.
5. Docs: one bullet in `docs-internal/migration-to-ts-high-level.md`; touch parity
   README #1 only if wording needs it. CHANGELOG: tests-only → skip (repo says doc/CI
   changes need no entry; BDD-only additions are not user-facing).
6. `make test` full run, output to `.tmp/`.

## Status log
- [x] Recon
- [x] Steps + scenarios (`parse_reported_cycles` + 2 `@then`; strengthened line-165
      scenario; added `Cycle detection finds both of two overlapping cycles`)
- [x] Mutation proof (see PUBLIC.md for exact commands/output). Mutant = `CycleFinder.visit`
      returns bool and aborts the DFS on the first cycle, stack never unwound.
- [x] Docs (parity README #1 wording; migration doc `dep cycle` bullet). CHANGELOG already
      had the Fixed entry — nothing added.
- [x] `make test` exit 0 (215 scenarios, 294 unit tests), `make parity` exit 0.

## Key learning (for a clone)
The mutation is order-sensitive: the abort-on-first-cycle bug leaves the stack populated, so
entering the graph at the WRONG node makes the buggy algorithm produce the right answer. My
first overlapping unit test (graph listed `a, b, c`) passed under the mutation, as did the
pre-existing points-into-a-cycle unit test. Fixtures must be listed so the discriminating
entry point comes first (`c, b, a`). The BDD scenarios were fine because behave's ticket
titles slug to `another-task, dependency-task, main-task`, i.e. task-0003 is enumerated first.

## Deviations from plan
- Also touched `test/dep-graph.test.ts` (not in the original plan): the unit layer had no
  overlapping-cycle test, and the existing points-into-a-cycle test was vacuous under the
  mutation. Only a fixture reorder, no assertion weakened.

## Not done (deliberate)
- No commit, no branch switch, ticket left `open` (TOP_LEVEL_AGENT owns those).
