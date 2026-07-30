# IMPLEMENTATION REVIEW — nid_94f11043dhpk198dj9e6gr6pn_e (`make parity` in CI), commit ed71586

## Summary

One CI step (`make parity`) added to the existing `test` job, plus a `require_jq()` preflight in
the harness and T6 deletion breadcrumbs in three places. Small, in scope, and the crux question —
**does the step actually fail the build on a parity divergence?** — answers YES, verified by
mutation, not inspection.

What I verified empirically (logs in `.tmp/rev-*.log`):

- `make parity` → exit 0 (graph 69 scenarios / query / slug); `make test` → exit 0 (208 scenarios,
  0 failed). No `sanity_check.sh` in this repo.
- **Step is not vacuous**: patched the built bundle (`dist/ticket.mjs`, `var SCANNED_FILE_LIMIT =
  100;` → `= 3;`) and ran `scripts/parity/run.py` → exit **1**, `graph FAIL`. Restored; tree clean.
- **No stale-bundle hole**: `Makefile:29` `parity: build`, and `build` is `.PHONY` and runs
  `npm run build` unconditionally, so a `src/` regression in CI is compiled before it is measured.
- **Nothing suppresses the failure**: parsed `.github/workflows/test.yml` with pyyaml — the parity
  step has no `if:`, no `continue-on-error:`; `run:` is exactly `make parity`; GitHub's default
  `bash -e` propagates make's non-zero exit.
- **CI-environment realism is fine**: `make parity` needs node (setup-node@v4), python3, git, GNU
  coreutils and jq — all present on `ubuntu-latest`; `uv` is not needed by parity. Nothing depends
  on git history, so `actions/checkout` at fetch-depth 1 is safe: the harness only `git init`s
  throwaway repos (no `user.email` needed), and `BashReference` writes its own 0755 copy of
  `./ticket` with `TS_COMMANDS=""` into `$REPO/.tmp` (asserting exactly one assignment matched), so
  the TS-vs-TS trap is closed. All mtimes are set with `os.utime`, so no sleep/timing flakiness; the
  one racy bash case is pinned as a tuple.
- `require_jq()` is correctly placed next to `require_dump()` in `run.py:30-31`, uses the same
  `SystemExit(str)` → exit 1 convention, and `shutil.which` sees the same PATH the subprocesses get
  (`harness.py:168` copies `os.environ`). With a PATH stripped of only `jq`, `run.py` exits 1 with a
  clear message.

## 🚨 BLOCKING

None.

## ⚠️ SHOULD-FIX

### 1. The "vacuous pass" justification is overstated — measured, it is not what happens
`scripts/parity/harness.py:180-183` (docstring), and the same claim in the commit message and in
`IMPLEMENTATION_WITH_SELF_PLAN__PUBLIC.md` lines 9-12 / 26-27.

Claim: without jq, "every jq-filter comparison in check_query 'matches' while measuring nothing …
especially in CI, where nobody is watching the summary line."

Measured (full PATH minus only `jq`, calling `check_query.run()` directly to bypass the new guard):

```
(False, 'query identical over 8 invocations (16 lines); ...;
         query <filter> | head -1 rc=127 on both sides, expected 141; ...;
         control-character divergence changed: TS `query .id` now fails on a control character')
```

So a jq-less CI run would have gone **red**, not green — `_check_broken_pipe` and the control-char
sub-check both catch it. What *does* silently degrade is `_check_jsonl` alone: 4 of its 8
invocations compare two empty 127s and the reported line count drops 33 → 16.

Why it matters: this repo's standard is that verification claims match measurement, and the
inaccurate rationale is now baked into a shipped code comment that the next agent will trust.
The guard itself is still the right call (fail fast with an actionable message beats a confusing
`rc=127, expected 141`) — only the WHY is wrong.

Suggested fix (docstring, ~2 lines): "Without jq both sides exit 127 with empty stdout: the
filter comparisons in `_check_jsonl` stop measuring anything (33 → 16 lines), while other checks
fail for unrelated-looking reasons (127 vs the expected 141). Refuse to start instead, so the
message names the real cause." And correct the sentence in the PUBLIC report (the commit message
can stay; a note in the report is enough).

Bonus, and the environment-independent version of the same guard: assert `lines > 0` for the
filter invocations in `scripts/parity/check_query.py:198` (or a per-invocation minimum). That
catches the vacuity class even when jq is present but the fixtures stop matching — the failure
mode this repo has hit repeatedly.

### 2. T6 breadcrumb missing from the actual work order
`_tickets/ts-port-6-cutover-delete-bash-packaging-docs.md` (Scope bullets, incl. its `CI:` bullet).

`scripts/parity/README.md` "Lifetime" and the migration doc's T6 row now both list the CI step —
good — but the T6 **ticket** does not mention `scripts/parity/` at all. The T6 agent's entry point
is the ticket (it does say "read the migration doc first", so the chain is intact but indirect).
Add one bullet to T6's scope: "Delete `scripts/parity/`, the `parity` make target, `build:parity`,
the `dist-parity/` ignore entry, and the `Run bash-vs-TS parity harness` step in
`.github/workflows/test.yml`." One line, removes the last hop.

## 💡 NICE-TO-HAVE

3. **Parity signal is lost whenever `make test` fails** (`.github/workflows/test.yml:30`). Steps are
   sequential, so any BDD failure hides a simultaneous parity divergence until the next push.
   `if: ${{ !cancelled() }}` on the parity step gives both signals in one run (this is not
   `continue-on-error` — the step still fails the job).
4. **No `timeout-minutes` on the job.** The harness runs thousands of subprocesses with no
   `subprocess.run(timeout=…)`; a hang (this repo has a known "awk reads stdin and hangs" class)
   burns the 6-hour default. `timeout-minutes: 15` on the `test` job is cheap insurance.
5. **CLAUDE.md** still says parity "is verified empirically via `make parity` … delete at T6" without
   noting it now runs in CI. The migration doc covers it; adding "(runs in CI)" keeps the primary
   agent-facing doc honest. Low priority, one clause.
6. **Ticket still `status: open`** (`_tickets/run-make-parity-in-ci-while-the-ts-port-is-in-flight.md:4`)
   — close it when this lands.
7. Informational, pre-existing, no action: `ticket:45-49` prefers `rg` over `grep`. Dev machines
   here have ripgrep, `ubuntu-latest` generally does not, so CI exercises the `grep` arm. Harmless
   today (`_grep` is only used by `yaml_field`/write paths, none of which parity compares yet), but
   worth knowing when T5 lands `create`/`show` comparisons.

## Scope / Pareto

Right-sized: a step rather than a job (node/uv already set up), no apt installs, no
`continue-on-error`, no `if:` guard. Nothing over-engineered, nothing from the ticket left undone.
Agreed on no CHANGELOG entry — CLAUDE.md lists CI/workflow changes as not needing one and the
harness is migration-only tooling.

## Documentation Updates Needed

- `scripts/parity/harness.py` `require_jq()` docstring — correct the rationale (finding 1).
- `_tickets/ts-port-6-cutover-delete-bash-packaging-docs.md` — parity deletion bullet (finding 2).
- Optional: CLAUDE.md parity line mentions CI (finding 5).

## Verdict

**NEEDS-ITERATION** — no functional change required and no blocking defect; the CI step does what
the ticket asked and I proved it fails on a real divergence. Iteration is for finding 1 (a shipped
code comment whose stated rationale contradicts measurement) and finding 2 (the T6 work-order
breadcrumb). Both are text edits.
