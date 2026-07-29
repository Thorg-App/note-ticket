# T2 core data-model library — PRIVATE working memory

## Plan

**Goal**: `src/core/` — CLI-agnostic data model shared by the CLI and the future graph viz.

**Steps** — ALL DONE
1. [x] Empirical parity probes against bash `./ticket` in `.tmp/parity/` (see Findings)
2. [x] `src/core/frontmatter.ts` — Frontmatter value object + TicketDocument
3. [x] `src/core/ticket.ts`
4. [x] `src/core/slug.ts`
5. [x] `src/core/id.ts`
6. [x] `src/core/ticket-store.ts`
7. [x] `src/core/dep-graph.ts`
8. [x] unit tests in `test/*.test.ts` (FLAT dir — the npm script glob `test/*.test.ts` is
       single-level; adding a subdirectory would silently stop building those tests)
9. [x] `npm test` + `make unit-test`; typecheck clean; `make test` green

**Files touched**: src/core/*.ts, test/core/*, package.json, Makefile, tsconfig.json, CLAUDE.md

## Empirical parity findings (verified by running ./ticket)

Probe repos: `.tmp/parity/repo`, `.tmp/parity/repo2` (git-init'd, TICKETS_DIR exported).

### JSONL (`_file_to_jsonl`, FS=": ")
Input frontmatter → output (verbatim from `ticket query`):
```
title: "He said \"hi\" and C:\\path"   →  "title":"He said \\\"hi\\\" and C:\\\\path"
tags: [x, y]                          →  "tags":["x","y"]
weird:                                →  "weird:":""      (KEY keeps the colon — awk $1 quirk)
odd:novalue                           →  "odd:novalue":"" (same quirk)
colonval: "a: b"                      →  "colonval":"a: b"
created_iso: 2026-07-29T22:00:00Z     →  "created_iso":"2026-07-29T22:00:00Z"
```
So: value = raw text after `: `, outer double quotes stripped, then ONLY `\`→`\\` and `"`→`\"`
escaping. On-disk `\"` is NOT unescaped — it stays as backslash+quote in the JSON value.
`full_path` appended last. A file with zero frontmatter fields emits NO line.
Empty files are skipped entirely.

### update_yaml_field insert position (VERIFIED)
A NEW field is inserted immediately after the opening `---`, i.e. it becomes the FIRST
entry. `close` then wrote `status_updated_iso` and `closed_iso`; result order was
`closed_iso, status_updated_iso, id, title, status, deps` — each insert lands at the top,
so later inserts sit above earlier ones. Existing keys are replaced in place (order kept).
Mirrored in `Frontmatter#withField`.

### Discovery order (VERIFIED)
`_tickets/{.draft.md, A/one.md, Z.md, _under.md, a/two.md, sub/a.md, sub/z.md, top.md,
\uFFFD.md, \u{10000}.md}` came out in exactly that order = byte-wise compare of FULL paths.
`.hidden/` pruned whole incl. `.hidden/visible/v.md`. `.draft.md` (hidden FILE) included.
The `\uFFFD` before `\u{10000}` pair is precisely the case JS UTF-16 `<` gets wrong →
Buffer.compare is load-bearing.

### Slug (VERIFIED via create)
```
"Hello World"                → hello-world      (2nd → -1, 3rd → -2)
"Hello   World"              → hello-world(-1)  (collapse)
"  Leading and trailing  "   → leading-and-trailing
"!!!"                        → untitled
"Ünïcödé Tïtle"              → ncd-ttle         (ASCII-only lowercase, non-ASCII dropped)
"UPPER_snake_case"           → uppersnakecase
"a/b\c"                      → abc
"Tabs\there"                 → tabshere         (tab is NOT converted to hyphen)
```
=> lowercase must be ASCII-ONLY (JS toLowerCase would turn `İ` into `i`+combining and
leak an `i`); only SPACE (0x20) becomes a hyphen.

## Deliberate divergences (bash bugs NOT reproduced) — all documented in PUBLIC
1. `weird:` / `odd:novalue` key quirk: core splits at the first `:` → key `weird`, value "".
   Only reachable via hand-edited frontmatter; bash-written files always have `key: `.
2. `id:foo` (no space) — bash `substr($0,5)` yields `oo`. Core yields `foo`.
3. `[a, , b]` — bash emits `"a",,"b"` (invalid JSON). Core drops empty items.
4. Control chars in values — bash emits them raw (invalid JSON); core uses JSON escaping.
5. `update_yaml_field` sed is NOT anchored to the frontmatter block and rewrites matching
   body lines too. Core scopes mutation to the block.
6. `dep tree` root resolution in bash is substring-only (no exact-match tier); core's
   `IdResolver` always applies exact > partial. T4 must decide to use the shared resolver.
7. `dep cycle` / `ready` / `blocked` iterate `for (id in statuses)` = unspecified awk order.
   Core iterates in discovery (path) order → deterministic. ready/blocked then sort by
   (priority, id) so only cycle output ordering is affected.

8. `dep tree --full` sibling ORDER: bash's subtree-depth pass re-visits an already-measured
   sibling and REFINES its value. Found by the differential harness (22/128 scenarios).
   Fixed by snapshotting the pending child list before recursing in
   `TreeLayout#measureSubtreeDepths`. Now 0 mismatches. This one is NOT a divergence —
   it is faithful parity, and the odd-looking code is load-bearing.

## Test toolchain (decided here, do not re-litigate)
- node:test, NO vitest, devDeps unchanged.
- node 26 on this machine dropped `--experimental-transform-types`, and plain type
  stripping cannot handle parameter properties (used throughout `src/core`). Also
  `.js` specifiers do not resolve to `.ts` files under node.
- Therefore: `npm run build:test` bundles `test/*.test.ts` with esbuild into `dist-test/`,
  then `node --test dist-test/*.test.js`. Works on any node ≥ 18.
- `node --test dist-test/` (directory arg) FAILS on node 26 (treated as a module path) —
  the glob is required.

## Parity harness (preserved in ./parity-harness/, gitignored under .tmp originally)
- `diff.py [n]` — random + fixed graphs; compares dep tree / dep tree --full (every root) /
  ready / blocked / cycle. Rebuild `dump.mjs` first:
  `npx esbuild .tmp/parity/dump.ts --bundle --platform=node --format=esm --outfile=.tmp/parity/dump.mjs`
- `cycle_check.py` — validates reported cycles are genuine (bash: 27 bogus / 158 graphs).
- `query_check.py` — JSONL byte-for-byte. `slug_check.py` — title→filename.
- Follow-up ticket to promote it into the repo: `nid_mgfn04pyn3byxj72xxq0mggw5_e`.

## Final status
- `npx tsc --noEmit` clean; `npm test` 154/154; `make test` 12 features / 180 scenarios /
  1205 steps, 0 failed.
- `ticket` NOT modified (TS_COMMANDS still `help --help -h`); `features/` NOT modified;
  CHANGELOG.md NOT modified (nothing user-facing changed).
- Tickets created: `nid_fba92yfczp71jjcprn4ufmory_e` (cycle-bug BDD, deps T4),
  `nid_mgfn04pyn3byxj72xxq0mggw5_e` (harness, deps T2).

## Open threads for T3/T4/T5
- T4 must decide to use `IdResolver` for the `dep tree` root (bash has no exact tier).
- `TicketDocument.of` / `Frontmatter.fromEntries` / `Ticket.withArrayField` /
  `DepGraph.children` / `activeDependents` are unused until T4/T5 — do not delete.
- `closed` (mtime sort, 100-file cap) is NOT in core; it is a T3 CLI concern.
- Nothing in core writes to stdout/stderr. Keep it that way.
