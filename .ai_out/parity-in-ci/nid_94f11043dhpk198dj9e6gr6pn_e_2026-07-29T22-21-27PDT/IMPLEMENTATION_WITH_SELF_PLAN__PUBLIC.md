# PUBLIC — nid_94f11043dhpk198dj9e6gr6pn_e: run `make parity` in CI

## What changed

1. **`.github/workflows/test.yml`** — one new step, `Run bash-vs-TS parity harness` (`make parity`),
   after `Run tests`, in the existing `test` job. Header comment marks it MIGRATION-ONLY, points at
   `scripts/parity/README.md`, and states the T6 deletion + the measured 6-of-14 justification.
2. **`scripts/parity/harness.py` + `run.py`** — new `require_jq()` preflight, called next to
   `require_dump()`. **This closed a real vacuous-pass hole**: `check_query` compares stdout +
   exit code of `query <filter>` on both sides, and with no `jq` on PATH both sides exit 127 with
   empty stdout, so every jq-filter comparison would report OK while measuring nothing. Exactly the
   green-when-broken outcome the ticket warns about, and it would have been invisible in CI.
3. **`scripts/parity/README.md`** — new "Requirements" section (node, python3, git, GNU coreutils,
   jq + why jq is mandatory); "Lifetime" is now an explicit delete-list that includes the CI step.
4. **`docs-internal/migration-to-ts-high-level.md`** — the parity paragraph says it runs in CI, and
   the T6 table row now enumerates deleting `scripts/parity/` + its make/npm targets + its CI step.

## Decisions

- **Step, not a separate job.** Node is already set up in the `test` job and parity takes ~10s; a
  second job would duplicate checkout/setup for no signal that matters while the port is in flight.
  A single step is also the smallest thing to delete at T6. Placed after `make test` so the primary
  acceptance suite reports first.
- **No apt install step.** `python3`, `git` and `jq` are preinstalled on `ubuntu-latest`, and `uv`
  is not needed by parity at all. Rather than adding install noise, the harness now *asserts* jq is
  present and aborts non-zero if it is not — so if the runner image ever drops jq, CI goes red with
  a clear message instead of quietly measuring nothing.
- **No `continue-on-error`, no `if:` guard** — a parity diff must fail the build.

## How verified (actual results, locally)

| Check | Result |
|---|---|
| `make parity` | exit **0**; graph (69 scenarios) / query / slug all OK — `.tmp/parity.log` |
| `make test` | exit **0**; 12 features, **208 scenarios passed, 0 failed**, 1368 steps — `.tmp/make-test.log` |
| Workflow YAML valid | parsed with pyyaml; steps = checkout, setup-uv, setup-node, `Run tests`, `Run bash-vs-TS parity harness` (`run: make parity`) |
| Step is not a no-op | mutated `DEFAULT_ROW_LIMIT` 20→21 in `src/cli/row-limit.ts` → `make parity` exit **2**, "closed default limit differs". Reverted, re-ran green. |
| jq guard is not a no-op | ran `run.py` with a PATH symlink farm excluding only `jq` → exit **1**, "jq is not on PATH -- the query filter checks would compare two 127s and pass vacuously" |

Working tree: only the 4 files above modified, plus this `.ai_out/` dir. Scratch cleaned. Not committed.

## Changelog recommendation

**No CHANGELOG entry.** Per CLAUDE.md, CI/workflow changes are explicitly in "What Doesn't Need
Logging", and nothing here is user-facing (the harness change is migration-only test tooling).

## Risks / open questions

- **Un-provable locally:** that `jq`/`python3` really are on the GitHub runner. Mitigated, not
  eliminated — if either is missing the build fails loudly (jq via the new guard, python3 via
  `make parity` erroring), never silently passes. First CI run on this branch confirms it.
- Parity adds a second `make build` invocation; make's stamp/deps make it a near no-op. Runtime
  cost measured locally at ~10s.
- Reviewed for flakiness: the one racy bash behavior (`closed --limit=0` exiting 0 *or* 141) is
  already pinned as a `(0, 141)` tuple in `check_graph.py`, so it will not flap in CI.
