# PRIVATE — IMPLEMENTATION_REVIEWER notes (nid_94f11043dhpk198dj9e6gr6pn_e)

Reviewed commit ed71586 (CI runs `make parity`). Read-only; working tree left clean
(`git status --porcelain` empty after each mutation, dist/ is gitignored anyway).

## Empirical checks run (logs under .tmp/, all deleted scratch except logs)

| Check | Command | Result |
|---|---|---|
| Baseline parity | `make parity` → `.tmp/rev-parity.log` | exit 0; graph 69 scenarios / query / slug OK |
| Baseline BDD | `make test` → `.tmp/rev-make-test.log` | exit 0; 12 features, 208 scenarios, 1368 steps |
| Step non-vacuous (mutation) | patched `dist/ticket.mjs` `var SCANNED_FILE_LIMIT = 100;` → `= 3;`, ran `python3 scripts/parity/run.py --random 1` | exit **1**, `graph FAIL`; restored from backup |
| jq preflight fires | built a symlink farm of every PATH binary except `jq`, ran `run.py` | exit **1**, clear message |
| **Vacuity claim** | same farm, called `check_query.run()` directly (bypassing the guard) | returned **False**: `query <filter> \| head -1 rc=127 ... expected 141`, `control-character divergence changed`, and `query identical over 8 invocations (**16** lines)` vs 33 with jq |
| Workflow YAML | pyyaml via `uv run --with pyyaml` | valid; 5 steps; no `if:`, no `continue-on-error` on the parity step; job keys only `runs-on`,`steps` |
| Stale-bundle risk | Makefile `parity: build`, `build` is in `.PHONY` and runs `npm run build` unconditionally | no stale-bundle path |

Note: first mutation attempt replaced `loadRecent(100)` — 0 occurrences (esbuild keeps
`SCANNED_FILE_LIMIT` as a var), so MUT_EXIT=0 was meaningless. Re-ran correctly. Reminder to
self: always assert the replacement count before trusting a mutation result.

## Key conclusion

The important one: the "without jq the query-filter checks pass vacuously" justification is
**overstated**. Without jq the whole `query` check FAILS (broken-pipe 127-vs-141 and the
control-char sub-check), so CI would go red, not green. What silently degrades is
`_check_jsonl` alone: 4 of 8 invocations compare two empty 127s (33 → 16 lines). The guard is
still worth having (fail fast, clear message) but the recorded rationale in harness.py's
docstring, the commit message and the PUBLIC report is not what I measured.

Other: T6 ticket body (`_tickets/ts-port-6-cutover-delete-bash-packaging-docs.md`) does not
mention deleting `scripts/parity/` or the CI step — only the migration doc's T6 row and the
parity README do. Ticket nid_94f11043… still `status: open`.

Verdict written: NEEDS-ITERATION (docs/comment accuracy + T6 breadcrumb only; no functional
change required).
