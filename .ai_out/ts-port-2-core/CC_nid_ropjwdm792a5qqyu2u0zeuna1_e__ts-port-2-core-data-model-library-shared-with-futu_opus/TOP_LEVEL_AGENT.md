# TOP_LEVEL_AGENT — ts-port T2: core data-model library

Ticket: `nid_ropjwdm792a5qqyu2u0zeuna1_e`
Branch: `CC_nid_ropjwdm792a5qqyu2u0zeuna1_e__ts-port-2-core-data-model-library-shared-with-futu_opus`

## Flow (straightforward-flow)
| Phase | Status |
|---|---|
| CLARIFICATION | SKIPPED — ticket carries full module-level spec |
| IMPLEMENTATION_WITH_SELF_PLAN | DONE (`cd5b657`) |
| IMPLEMENTATION_REVIEW | DONE (`a560104`) — NOT-READY: SF-1 non-atomic save, SF-2 dishonest byte-exact claim, SF-3 unlisted divergences |
| IMPLEMENTATION_ITERATION | CONVERGED in 1 round (`38ea6b0`) — reviewer signed off READY |

## Decisions made by TOP_LEVEL_AGENT
- Test framework: **node:test** (ticket allowed vitest or node:test). Rationale: repo posture is zero runtime deps + minimal devDeps; node:test needs none.
- No `TS_COMMANDS` flips in this ticket (per ticket text) — core lands unused by the CLI dispatcher.

## Commits
- `cd5b657` — src/core + node:test unit tests (154 tests)
- `a560104` — review artifacts
- `38ea6b0` — round-1 fixes: atomic save, byte-exact `text()` (167 tests)
- final — review sign-off, ticket close, change_log entry `bsag53muom6moo0hssxz318q9`

## Verified end state (reviewer re-ran independently)
`tsc --noEmit` clean · `npm test` 167/167 · `make test` 12 features / 180 scenarios / 1205 steps, 0 failed · `ticket`, `features/`, `CHANGELOG.md` untouched · `TS_COMMANDS` unchanged.

## Follow-ups filed
- `nid_mgfn04pyn3byxj72xxq0mggw5_e` — promote the differential parity harness into the repo (dep of T4)
- `nid_fba92yfczp71jjcprn4ufmory_e` — bash `dep cycle` is wrong; add BDD scenarios when T4 flips it
- `nid_5g3eta9cf7yi6iukmscxma6wc_e` — **decide**: ID-resolution error-path divergences (incl. empty-ID); wired as a dep of T4 and T5 so the human decision structurally gates cutover
