# TOP_LEVEL_AGENT — dep cycle BDD scenarios

Ticket: `nid_fba92yfczp71jjcprn4ufmory_e` — dep cycle: bash reports non-cycles; add BDD
scenario when T4 flips it.

Precondition check (done by TOP_LEVEL_AGENT): T4 `nid_8cislepljqvv88ayndtjlw34k_e` is
merged at `b3914fe`, so `dep tree`/`dep cycle` already delegate to TS via
`TS_DEP_SUBCOMMANDS`. The ticket is actionable now.

Flow (straightforward-flow — focused task, sufficient context in the ticket body):

| Phase | Role | Status |
|-------|------|--------|
| 1 | IMPLEMENTATION_WITH_SELF_PLAN | spawned |
| 2 | IMPLEMENTATION_REVIEWER | pending |
| 3 | IMPLEMENTATION_ITERATION | pending |

Key direction given to phase 1: the new scenarios MUST be verified by MUTATION (mutate
`src/core/dep-graph.ts` to reproduce the old bash abort-on-first-cycle behavior and show
the scenarios fail), because this repo has a documented history of green-but-vacuous
guards.
