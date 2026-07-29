# TOP_LEVEL_AGENT — ts-port T2: core data-model library

Ticket: `nid_ropjwdm792a5qqyu2u0zeuna1_e`
Branch: `CC_nid_ropjwdm792a5qqyu2u0zeuna1_e__ts-port-2-core-data-model-library-shared-with-futu_opus`

## Flow (straightforward-flow)
| Phase | Status |
|---|---|
| CLARIFICATION | SKIPPED — ticket carries full module-level spec |
| IMPLEMENTATION_WITH_SELF_PLAN | RUNNING |
| IMPLEMENTATION_REVIEW | pending |
| IMPLEMENTATION_ITERATION | pending |

## Decisions made by TOP_LEVEL_AGENT
- Test framework: **node:test** (ticket allowed vitest or node:test). Rationale: repo posture is zero runtime deps + minimal devDeps; node:test needs none.
- No `TS_COMMANDS` flips in this ticket (per ticket text) — core lands unused by the CLI dispatcher.

## Commits
- (to be recorded per phase)
