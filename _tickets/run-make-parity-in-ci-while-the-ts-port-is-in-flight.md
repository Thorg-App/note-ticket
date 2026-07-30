---
closed_iso: 2026-07-30T06:14:53Z
id: nid_94f11043dhpk198dj9e6gr6pn_e
title: "Run make parity in CI while the TS port is in flight"
status: closed
deps: []
links: []
created_iso: 2026-07-30T01:48:02Z
status_updated_iso: 2026-07-30T06:14:53Z
type: task
priority: 1
assignee: CC_WITH-nickolaykondratyev
tags: [ts-port]
---

The bash-vs-TS differential harness (scripts/parity/, `make parity`) is the only check that the ported commands are byte-identical to bash, but .github/workflows/test.yml runs only `make test`. So parity is verified only when a human remembers to run it locally.

Add a step (or job) running `make parity` to .github/workflows/test.yml for the duration of the migration, and delete it at T6 together with scripts/parity/ (see scripts/parity/README.md "Lifetime").

Context: the harness now diffs against a pinned copy of ./ticket with TS_COMMANDS emptied, so it keeps working as more commands are flipped. Runtime is a few seconds at the default scenario count.


## Notes

**2026-07-30T04:38:57Z**

Evidence from the T3 Phase B review (measured, not estimated): of 14 mutations of dist/ticket.mjs that `make parity` catches, 6 are INVISIBLE to `make test` — the 100-file scan cap (100 -> 1e9 and -> 3), `--limit` applied before filtering instead of after, `full_path` moved to first in the JSONL, the closed mtime order/tie-break, and control-character escaping. Since CI runs only `make test`, a regression in any of those ships green. Two more pins added in the iteration round (a symlinked ticket's mtime, and the default `--limit=20`) are likewise parity-only. This raises the value of this ticket: T3's verification story now materially depends on parity running somewhere other than a developer's laptop.

**2026-07-30T06:14:53Z**

**Resolution**

`.github/workflows/test.yml` now runs `make parity` as a step in the existing `test` job (after `make test`), with `if: ${{ !cancelled() }}` so a test failure no longer hides the parity signal, plus `timeout-minutes: 20` on the job. No `continue-on-error`; `parity: build` in the Makefile means CI cannot diff a stale bundle.

Verified by MUTATION, not inspection (independently by implementer and reviewer): patching the built bundle (`SCANNED_FILE_LIMIT` 100 -> 3; `DEFAULT_ROW_LIMIT` 20 -> 21) makes the step exit non-zero. Suites green: `make parity` exit 0 (graph 69 scenarios, query 33 lines, slug 13 titles), `make test` 208/208.

Two harness holes found and closed along the way:
- `require_jq()` preflight in `scripts/parity/harness.py` — without jq every query sub-check fails with a message that never names jq (fixture drift / rc=127 vs 141 / control-character divergence), so the cause was undiagnosable.
- `QueryInvocation(args, min_lines)` in `scripts/parity/check_query.py` — query fixture drift used to report "identical" over fewer rows. Minima, not exact counts, so adding a fixture stays green.

T6 delete-set recorded in `scripts/parity/README.md` "Lifetime", `docs-internal/migration-to-ts-high-level.md`, the CI step comment, and the T6 cutover ticket itself. No CHANGELOG entry (CI-only, not user-facing).

Not verified from here: that `ubuntu-latest` actually provides jq/python3 — mitigated because a missing jq now fails loudly rather than passing vacuously. The first CI run on this branch is the real confirmation.
