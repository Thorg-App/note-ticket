---
id: nid_94f11043dhpk198dj9e6gr6pn_e
title: "Run make parity in CI while the TS port is in flight"
status: open
deps: []
links: []
created_iso: 2026-07-30T01:48:02Z
status_updated_iso: 2026-07-30T01:48:02Z
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
