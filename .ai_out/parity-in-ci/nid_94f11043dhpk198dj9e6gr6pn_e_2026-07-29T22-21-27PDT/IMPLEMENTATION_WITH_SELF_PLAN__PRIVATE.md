# PRIVATE memory — nid_94f11043dhpk198dj9e6gr6pn_e (parity in CI)

## Goal
Add `make parity` to `.github/workflows/test.yml` for the duration of the TS migration,
with an obvious T6 deletion trail, and make sure it cannot pass vacuously in CI.

## Recon findings (2026-07-30)
- `make parity` = `build` (npm/esbuild) + `npm run build:parity` + `python3 scripts/parity/run.py`.
  Tool deps: node/npm, python3, bash, git, GNU coreutils (`ls -t` inside bash `closed`), **jq**.
  `uv` is NOT needed by parity (only by `make test`/behave).
- ubuntu-latest ships python3, git, jq preinstalled; existing job already sets up node 22 + uv.
- **Vacuous-pass hazard found**: `check_query.py` compares bash-vs-TS `query <filter>` stdout +
  returncode. With no `jq` on PATH both sides exit 127 with empty stdout, so every jq-filter
  comparison would "pass" while measuring nothing. Fixed by a loud `require_jq()` preflight in
  `harness.py`, called from `run.py` alongside `require_dump()`.
- No flaky assertions: the racy `closed --limit=0` bash exit code is already accepted as a
  `(0, 141)` tuple in `check_graph.py:138`.
- Step vs job: chose a **step in the existing `test` job** (Pareto — node is already set up,
  one line to delete at T6). Placed after `make test` so the primary suite reports first.

## Steps
1. [x] `require_jq()` in `scripts/parity/harness.py`; called in `run.py`.
2. [x] Parity step in `.github/workflows/test.yml` with MIGRATION-ONLY / T6 comment.
3. [x] `scripts/parity/README.md` "Lifetime" lists the CI step.
4. [x] `docs-internal/migration-to-ts-high-level.md`: T6 row + parity paragraph mention CI step.
5. [x] Verify: `make parity`, `make test`, YAML parse, mutation proof (parity exits non-zero).

## Verification results
- `make parity` → exit 0; graph/query/slug all OK (.tmp/parity.log).
- `make test` → exit 0, 12 features / 208 scenarios / 1368 steps passed, 0 failed (.tmp/make-test.log).
- YAML valid via `uv run --with pyyaml python3 -c yaml.safe_load` (no system pyyaml here);
  parsed steps = [checkout, setup-uv, setup-node, "Run tests", "Run bash-vs-TS parity harness"].
- Mutation proof: temporarily changed `DEFAULT_ROW_LIMIT` 20→21 in `src/cli/row-limit.ts`
  → `make parity` exited **2** (make's failed-recipe code) with "closed default limit differs".
  Reverted via `git checkout --`; re-ran `make parity` green.
- jq guard proof: ran `run.py` with a PATH lacking jq → exits 1 with
  `jq is not on PATH -- the query filter checks would compare two 127s and pass vacuously`.

## Round 1 iteration (2026-07-30, after review of ed71586)
Review verdict: NEEDS-ITERATION, no functional defect. All 7 findings dispositioned in
`IMPLEMENTATION_ITERATION__PUBLIC.md` (6 incorporated, 1 informational/no-action).

**My round-0 jq rationale was WRONG and I shipped it in a code comment.** Measured truth
(reproduced independently, PATH minus only jq): `check_query.run()` → **False**, so CI goes RED.
Only `_check_jsonl` degrades silently (33 → 16 lines, still says "identical"); the broken-pipe
sub-check reports `rc=127, expected 141`. Corrected in `require_jq()` docstring + message,
`scripts/parity/README.md`, and the PUBLIC report. ed71586's commit message is stale — cannot
amend, noted in the iteration report.

Added `QueryInvocation(args, min_lines)` namedtuples in `check_query.py`: per-invocation minimum
row counts (8 / 8 / 8 / 1 / 0 / 0 / 8 / 0). Minima, not exact, so adding a fixture never breaks
them. Proven by mutation AND against `git show HEAD:...check_query.py` (same drift = green
before, red now). Note `query .id --pretty` legitimately yields 0 rows: bash's arg loop takes the
LAST arg as the filter, so `--pretty` is a jq syntax error (rc=3).

Also: `if: ${{ !cancelled() }}` on the parity step (NOT continue-on-error), `timeout-minutes: 20`
on the `test` job (this one is NOT in the T6 delete-set), CLAUDE.md parity line says "runs in CI",
T6 ticket got the parity delete-list bullet.

Re-verified: `make parity` exit 0, `make test` exit 0 (208/0), workflow YAML parses.

## Round 2 iteration (2026-07-30, after review of 9f01f5e) — ONE blocker, text only
R2-1: my round-1 jq rationale was ALSO wrong, for a subtle reason worth remembering:
**it was measured against `ed71586`, but the `min_lines` guard (finding 1b) shipped in the SAME
commit (`9f01f5e`) and changed the very behavior the comment described.** Lesson: when a commit
adds a guard AND a comment about pre-guard behavior, re-measure the POST-guard tree.

Measured myself (PATH farm = real PATH minus only jq, sub-checks called directly):
- `_check_jsonl` → False: `query ['query', '.status == "open"'] matched 0 rows, expected at least 8
  -- fixture drift, ...` (3rd invocation; no "16 lines", no "identical")
- `_check_query_broken_pipe` → False: `rc=127 on both sides, expected 141`
- `_check_control_character_divergence` → False: `TS query .id now fails on a control character`
=> THREE misdiagnoses, none naming jq. That, not vacuity, is the guard's WHY.

Rewrote: `require_jq()` docstring, its `SystemExit` message, `scripts/parity/README.md`
"Requirements". Audit trail: CORRECTED-IN-ROUND-2 banner on §1 of the iteration report (round-1
text kept verbatim) + item 2 of `..._SELF_PLAN__PUBLIC.md`. No logic/workflow/fixture change.

Re-verified: `make parity` exit 0 (33 lines, 69 graph scenarios), `make test` exit 0 (208/0/1368),
jq-less `run.py` exit 1 with the new message. Logs: `.tmp/r2-parity.log`, `.tmp/r2-test.log`.

## State
ROUND 2 COMPLETE. Not committed (TOP_LEVEL_AGENT commits, closes the ticket, owns CHANGELOG).
No CHANGELOG entry written (CI + migration-only tooling).
