---
closed_iso: 2026-07-29T23:17:00Z
id: nid_ropjwdm792a5qqyu2u0zeuna1_e
title: 'TS port 2: core data-model library (shared with future visualization)'
status: closed
deps: [nid_604l3jerigu3ikyq68958lxy7_e]
links: []
created_iso: '2026-07-29T21:57:24Z'
status_updated_iso: 2026-07-29T23:17:00Z
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

## Notes

**2026-07-29T23:17:00Z**

## Resolution — DONE

Built `src/core/` as the shared data-model layer (CLI + planned graph visualization). Zero CLI knowledge, verified by grep (no argv/console/stdout/exit).

Modules: `frontmatter.ts` (key-order-preserving block + `TicketDocument` byte-exact round trip), `ticket.ts` (`Ticket` entity, immutable `withField`/`withoutField`, `toJsonRecord()`), `ticket-store.ts` (`TicketsDirectory.resolve()` + `TicketStore`; `collectFiles()` is the single source of truth for "what is a ticket file"; `save()` = write-scratch + rename, parity with bash `_sed_i`), `id.ts` (`TicketId.generate()`, `IdResolver`), `slug.ts`, `dep-graph.ts` (ready/blocked with unknown-dep-blocks, cycles, dep-tree layout rows).

Tests: 167 `node:test` unit tests (`make unit-test` = `npm test`, esbuild-transpiled into `dist-test/`; no test framework dependency). `npx tsc --noEmit` clean. BDD suite untouched and green: 12 features / 180 scenarios / 1205 steps, 0 failed. `TS_COMMANDS` NOT flipped — core lands unused by the dispatcher, per ticket scope.

Parity was verified empirically against `./ticket` via a bash-vs-TS differential harness over generated graphs (caught a real dep-tree subtree-depth ordering bug), not by reading alone. 10 divergences from bash are documented.

Follow-ups filed: `nid_mgfn04pyn3byxj72xxq0mggw5_e` (promote the differential harness into the repo; now a dep of T4), `nid_fba92yfczp71jjcprn4ufmory_e` (bash `dep cycle` reports non-cycles and misses real ones — TS is deliberately correct; add BDD scenarios when T4 flips it), `nid_5g3eta9cf7yi6iukmscxma6wc_e` (**decide**: ID-resolution error-path divergences incl. empty-ID; wired as a dep of T4 and T5 so the human decision structurally gates cutover).

Agent artifacts: `.ai_out/ts-port-2-core/CC_nid_ropjwdm792a5qqyu2u0zeuna1_e__ts-port-2-core-data-model-library-shared-with-futu_opus/`
