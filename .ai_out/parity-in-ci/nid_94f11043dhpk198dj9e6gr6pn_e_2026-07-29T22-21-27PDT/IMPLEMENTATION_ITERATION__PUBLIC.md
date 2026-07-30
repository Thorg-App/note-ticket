# ITERATION ROUND 1 — nid_94f11043dhpk198dj9e6gr6pn_e (`make parity` in CI)

Reviewer verdict was NEEDS-ITERATION with **no functional defect**. All findings worked below.
Nothing committed (TOP_LEVEL_AGENT owns commits, CHANGELOG and closing the ticket).

## Per-finding disposition

### 1. Wrong WHY rationale on `require_jq()` — **INCORPORATED**

I re-measured independently before touching the text (a PATH symlink farm identical to the real
PATH minus only `jq`, calling `check_query.run()` directly to bypass the guard). The reviewer's
numbers reproduce **exactly**:

```
(False, 'query identical over 8 invocations (16 lines); ...;
        query <filter> | head -1 rc=127 on both sides, expected 141; ...;
        control-character divergence changed: ...')
```
vs. `33 lines` with jq present. So a jq-less CI run goes **red** — my original "would pass
vacuously / invisible in CI" claim was wrong. What degrades silently is `_check_jsonl` alone
(4 of 8 invocations compare two empty 127s and it still says "identical", 33 → 16 lines).

Fixed in three places, all now stating only what was measured:
- `scripts/parity/harness.py` `require_jq()` docstring + the `SystemExit` message.
- `scripts/parity/README.md` "Requirements" (it said "the filter comparisons would pass while
  measuring nothing" — true of `_check_jsonl` but it implied the run stayed green).
- `IMPLEMENTATION_WITH_SELF_PLAN__PUBLIC.md` (marked CORRECTED IN ROUND 1, old claim retained
  so the correction is auditable).

The guard itself stays: its value is a message that names the real cause instead of leaving the
next maintainer to chase `rc=127, expected 141`.

**Re-proved by mutation:** `PATH=<farm-without-jq> python3 scripts/parity/run.py` → exit **1**
with `jq is not on PATH -- 'query <filter>' would exit 127 on both sides: the filter comparisons
would measure nothing and the rest would fail confusingly. Install jq and re-run.`

### 1b. Bonus suggestion: assert non-zero filter line count — **INCORPORATED** (on merit)

Taken because it is the environment-independent form of the guard, ~8 lines, and vacuity is this
repo's recurring failure mode. Implemented as a **per-invocation minimum**, not a single total:
`QUERY_INVOCATIONS` entries are now `QueryInvocation(args, min_lines)` namedtuples (no bare
tuples), and `_check_jsonl` fails if an invocation matches fewer rows than its minimum. `0` is
declared explicitly for the two deliberately-empty cases (`.nosuchfield`, `syntax(((`) and for
`query .id --pretty` (bash treats the LAST arg as the filter, so this is a jq syntax error);
`8` = every fixture (7 `CREATE_ARGS` + 1 `EDGE_FILES`), `1` for the tags filter. They are
**minima**, so adding a fixture never breaks them (robust-test rule).

WHY-NOT a single aggregate `lines > 0`: it cannot distinguish "the tags filter stopped matching"
from "the bare query still returns 8 rows", which is precisely the drift being guarded.

**Proved by mutation, both arms** (and proved the guard is not vacuous by running the *same*
mutation against `git show HEAD:scripts/parity/check_query.py`):

| Mutation | pre-change (HEAD) | with the guard |
|---|---|---|
| drop the `Tagged` fixture's `--tags` (ticket count unchanged) | `ok=True`, "query identical over 8 invocations (32 lines)" | `ok=False`, `query ['query', '.tags | length > 0'] matched 0 rows, expected at least 1 -- fixture drift, the comparison is measuring (almost) nothing` |
| drop the `Tagged` fixture entirely | (not run) | `ok=False`, `query ['query'] matched 7 rows, expected at least 8 ...` |

That first row is the whole point: the drift used to report green.

### 2. T6 breadcrumb missing from the actual work order — **INCORPORATED**

Added a scope bullet to `_tickets/ts-port-6-cutover-delete-bash-packaging-docs.md` listing the
full delete-set (`scripts/parity/`, the `parity` make target, the `build:parity` npm script, the
`dist-parity/` ignore entry, the workflow step) and one thing the reviewer did not mention but
that matters: **fold any still-relevant declared divergence from `scripts/parity/README.md` into
the BDD suite before deleting it**, so deleting the harness does not silently drop pinned
knowledge. Ticket frontmatter untouched (body edit only).

### 3. `if: ${{ !cancelled() }}` on the parity step — **INCORPORATED**

One line, real signal (a BDD failure no longer hides a simultaneous parity divergence for a whole
push), and it is deleted at T6 with the rest of the step. Comment states explicitly that this is
NOT `continue-on-error` — a parity diff still fails the job. Verified by parsing the workflow:
the step is `{"name": "Run bash-vs-TS parity harness", "if": "${{ !cancelled() }}", "run": "make parity"}`
and has no `continue-on-error`.

### 4. `timeout-minutes` on the job — **INCORPORATED** as `timeout-minutes: 20`

The reviewer suggested 15; both suites together run in ~30s locally, so 20 keeps a large margin
against a slow runner while still failing in minutes rather than on the 6-hour default. WHY is in
the comment (thousands of subprocesses, no per-call timeout, known "awk reads stdin and hangs"
class). Unlike everything else here this is **not** migration-only, so it is on the job, outside
the T6 delete-set.

### 5. CLAUDE.md parity line mentions CI — **INCORPORATED**

`make parity` line now reads "... runs in CI alongside `make test`; delete at T6".

### 6. Close the ticket — **NOT MINE.** Left `status: open`; TOP_LEVEL_AGENT owns closing.

### 7. `rg`-vs-`grep` on CI runners — **REJECTED (no action), as the reviewer intended.**

Informational and pre-existing: `ticket:45-49` prefers `rg`, `ubuntu-latest` generally lacks it,
so CI exercises the `grep` arm. No behavior difference is measured today. Fixing or ticketing it
now would be scope creep on a CI-wiring ticket; it is naturally revisited when T5 lands
`create`/`show` comparisons, which is where it would first matter.

## Stale commit message (flagged, cannot be fixed)

Commit **ed71586**'s message repeats the wrong jq rationale ("every jq-filter comparison would
match while measuring nothing … invisible in CI"). It was not amended, per instruction. The
corrected, measured rationale now lives in the code (`require_jq()` docstring + its error
message), in `scripts/parity/README.md`, and in this report — i.e. in every place a maintainer
would actually look. **Anyone reading ed71586's message should treat its jq paragraph as
superseded by this file and by the docstring.** If the branch is squash-merged, the merge commit
message is the place to state the corrected version.

## Verification (actual results, this working tree)

| Check | Result |
|---|---|
| `make parity` | exit **0** — `graph OK scenarios=69 failures=0`, `query OK ... (33 lines)`, `slug OK titles=13` (`.tmp/iter-parity.log`) |
| `make test` | exit **0** — 12 features, **208 scenarios passed, 0 failed**, 1368 steps (`.tmp/iter-test.log`) |
| Workflow YAML | parses (pyyaml); `timeout-minutes=20`; steps = checkout, setup-uv, setup-node, `Run tests`, `Run bash-vs-TS parity harness` (`if: ${{ !cancelled() }}`, `run: make parity`) |
| `min_lines` guard is not a no-op | mutation table above, including the pre-change baseline that reported green |
| `require_jq` guard is not a no-op | jq-less PATH → exit 1 naming jq |

Files modified this round: `.github/workflows/test.yml`, `CLAUDE.md`,
`scripts/parity/check_query.py`, `scripts/parity/harness.py`, `scripts/parity/README.md`,
`_tickets/ts-port-6-cutover-delete-bash-packaging-docs.md`. Scratch (`.tmp/nojq-bin`, measurement
script) deleted; only logs left under the gitignored `.tmp/`. Still **no CHANGELOG entry** —
CI/workflow + migration-only test tooling.
