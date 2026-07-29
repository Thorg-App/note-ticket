---
id: nid_ropjwdm792a5qqyu2u0zeuna1_e
title: 'TS port 2: core data-model library (shared with future visualization)'
status: in_progress
deps: [nid_604l3jerigu3ikyq68958lxy7_e]
links: []
created_iso: '2026-07-29T21:57:24Z'
status_updated_iso: '2026-07-29T22:22:40Z'
type: task
priority: 2
assignee: CC_WITH-nickolaykondratyev
tags: [ts-port]
pwd: /home/nickolaykondratyev/git_repos/note-ticket
---
Read docs-internal/migration-to-ts-high-level.md first. Reference implementation is the bash script ./ticket.

Build src/core/ - the data-model layer that both the CLI and the future graph visualization will import. HARD RULE: core has zero CLI knowledge (no process.argv, no output formatting).

Modules:
- src/core/frontmatter.ts - line-based parse/serialize of the YAML subset (key: value, inline [a, b] arrays, double-quoted titles). WHY-NOT js-yaml: real YAML parsers differ on edge cases and would silently change the on-disk contract the BDD suite pins. Mirror yaml_field / update_yaml_field / _file_to_jsonl semantics in ./ticket, including frontmatter key order preservation.
- src/core/ticket-store.ts - discovery matching _collect_ticket_files in ./ticket: recursive under tickets dir, follow symlinks, prune hidden DIRECTORIES (whole subtree), hidden FILES are tickets, only .md files, deterministic BYTE-WISE path order (compare Buffers, not JS UTF-16 strings - parity with LC_ALL=C sort). Plus load/save of a single ticket. Tickets-dir resolution: TICKETS_DIR env override, else git rev-parse --show-toplevel + /_tickets.
- src/core/id.ts - generate nid_<25-char a-z0-9>_e; partial-ID resolution over frontmatter ids: exact match beats partial, more than one match at the winning tier is an ambiguity error, input whitespace-trimmed.
- src/core/slug.ts - title_to_filename parity: lowercase, spaces to hyphens, strip non-alnum, collapse hyphens, trim, 200-char truncate, untitled fallback, -1/-2 collision suffixes.
- src/core/dep-graph.ts - graph build from tickets; ready/blocked computation (unknown dep ids count as NOT closed, i.e. blocking); cycle detection; dependency tree layout primitives.

Unit tests for all of the above (vitest or node:test - pick one, keep it simple). BDD suite untouched and green (no delegation flips in this ticket).
