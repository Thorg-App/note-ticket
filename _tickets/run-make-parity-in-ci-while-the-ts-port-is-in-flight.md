---
id: nid_94f11043dhpk198dj9e6gr6pn_e
title: "Run make parity in CI while the TS port is in flight"
status: open
deps: []
links: []
created_iso: 2026-07-30T01:48:02Z
status_updated_iso: 2026-07-30T01:48:02Z
type: task
priority: 2
assignee: CC_WITH-nickolaykondratyev
tags: [ts-port]
---

The bash-vs-TS differential harness (scripts/parity/, `make parity`) is the only check that the ported commands are byte-identical to bash, but .github/workflows/test.yml runs only `make test`. So parity is verified only when a human remembers to run it locally.

Add a step (or job) running `make parity` to .github/workflows/test.yml for the duration of the migration, and delete it at T6 together with scripts/parity/ (see scripts/parity/README.md "Lifetime").

Context: the harness now diffs against a pinned copy of ./ticket with TS_COMMANDS emptied, so it keeps working as more commands are flipped. Runtime is a few seconds at the default scenario count.

