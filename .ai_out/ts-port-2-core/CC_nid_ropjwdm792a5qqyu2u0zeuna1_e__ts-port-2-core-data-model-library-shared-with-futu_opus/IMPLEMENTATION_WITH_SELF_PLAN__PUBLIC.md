# T2 — Core data-model library (`src/core/`)

Ticket: `nid_ropjwdm792a5qqyu2u0zeuna1_e`. No command was flipped to TS; `TS_COMMANDS`
in `./ticket` is unchanged (`help --help -h`) and `features/` is untouched.

## What was built

| File | Responsibility |
|------|----------------|
| `src/core/frontmatter.ts` | `FrontmatterValue` (raw-value interpretation), `Frontmatter` (the block: ordered entries, lookups, key-order-preserving set/remove, `toJsonRecord`), `TicketDocument` (block + body, byte-exact round trip) |
| `src/core/ticket.ts` | `Ticket` entity: path + document, typed accessors, immutable mutators, `toJsonRecord()` (the `query` payload) |
| `src/core/ticket-store.ts` | `TicketsDirectory.resolve()`, `TicketStore` (discovery / load / loadAll / save / ensureDir) |
| `src/core/id.ts` | `TicketId.generate()`, `IdResolver` with an explicit `IdResolution` union |
| `src/core/slug.ts` | `Slug.fromTitle()`, `Slug.uniqueFilename(title, exists)` |
| `src/core/dep-graph.ts` | `DepGraph`: `ready()`, `blocked()`, `cycles()`, `tree()`, `children()`, `activeDependents()`, `excludingClosed()` |

Zero CLI knowledge in `src/core/`: no `process.argv`, no formatting, no console output.
`TicketsDirectory` shells out to `git rev-parse` (data-source resolution, not CLI) and
returns a `{kind: "resolved"|"no-git-repo"}` union so the caller owns the message.
Errors are returned as unions, never printed: `IdResolution` gives
`resolved | not-found | ambiguous` so the CLI can produce bash's exact wording.

`DepGraph.tree()` returns `TreeRow[]` (`id`, `depth`, `prefix`, `connector`) — the CLI
renders `prefix + connector + <node text>`, and the visualization can use `depth`
directly.

## Module API notes for T3/T4/T5

- `TicketStore.collectFiles()` is the ONLY place that knows "what is a ticket file".
- `query` line = `JSON.stringify(ticket.toJsonRecord())`, emitted only when
  `ticket.hasFrontmatterFields` (parity: files with no frontmatter fields emit nothing).
- `dep cycle` = `DepGraph.build(store.loadAll()).excludingClosed().cycles()`.
- `dep tree` root resolution should use `IdResolver` (see divergence 6 below).
- `ready`/`blocked` are unfiltered; apply `-a`/`-T` filters to the returned lists (bash
  filters candidates before the readiness computation, which is equivalent).
- Priority is exposed as the raw string (echoed verbatim as `[P2]`) and sorted with
  awk-style strnum semantics.

## Test results (exact commands)

```
npx tsc --noEmit                → clean
npm test  (= make unit-test)    → 154 tests, 23 suites, 154 pass, 0 fail
make test (build + unit + BDD)  → 12 features, 180 scenarios, 1205 steps, 0 failed
```

Unit tests: `test/{frontmatter,ticket,slug,id,ticket-store,dep-graph}.test.ts`,
`node:test` + `node:assert/strict`, BDD-ish one-assert-per-test.

**Test toolchain decision**: no vitest, devDeps unchanged. `npm test` transpiles
`test/*.test.ts` with the existing esbuild devDep into `dist-test/` (gitignored) and runs
`node --test dist-test/*.test.js`. WHY-NOT running `.ts` through node directly: node's
type stripping cannot handle parameter properties, and the transform flag was removed in
node 26 — bundling keeps the suite working on any node ≥ 18. `make unit-test` added;
`make test` now depends on `build unit-test` before behave.

## Parity: verified, not guessed

All of the following was checked by running bash `./ticket` in throwaway git repos.
A differential harness (preserved in `./parity-harness/` next to this file) generates
random ticket graphs and compares outputs byte-for-byte:

- **128 scenarios** (8 fixed shapes + 120 random, 2–6 tickets, random statuses/priorities):
  `dep tree <root>` and `dep tree --full <root>` for **every** ticket as root, plus
  `ready` and `blocked` — **all byte-identical** to bash.
- **`query` JSONL byte-identical** over tickets created by bash `create` (quotes,
  backslashes, tags, assignee with spaces, nested subfolder, plus a hand-written file with
  a `: ` inside a quoted value and a file with no frontmatter).
- **Slug**: 14 titles including unicode, tabs, punctuation-only, 250 chars, and
  truncation-exposed hyphens — all match.
- **Discovery**: order, hidden-dir pruning (whole subtree, incl. non-hidden folders
  inside), hidden files included — matches, including the `U+FFFD` vs `U+10000` pair that
  proves byte-wise (`Buffer.compare`) ordering is required.
- **Frontmatter key order**: confirmed that bash inserts a NEW field immediately after the
  opening `---`, so it becomes the FIRST entry (`close` produces
  `closed_iso, status_updated_iso, id, title, ...`). `Frontmatter#withField` mirrors this.

Two divergences the harness caught that reading the code had missed:

1. **`dep tree --full` sibling order** — bash's subtree-depth pass re-visits a sibling
   that was already measured as a side effect of an earlier sibling, which REFINES its
   value. 22/128 scenarios differed until `measureSubtreeDepths` snapshotted its pending
   list before recursing. Now 0 differ.
2. **`dep cycle` is broken in bash** (see below).

## Deliberate divergences from bash (all bugs, all documented in code)

1. **`dep cycle`**: bash aborts its DFS on the first cycle and leaves nodes marked
   "visiting", so a later traversal into such a node prints a path that is not a cycle,
   and real cycles are missed. Measured over 158 generated graphs: **bash emitted 27
   bogus cycles; the TS core emitted 0 and missed no cyclic graph.** The TS version
   records every back edge, dedups by normalized member set, and iterates in deterministic
   enumeration order (bash iterated an awk array = unspecified order).
   → Follow-up ticket `nid_fba92yfczp71jjcprn4ufmory_e` (deps: T4) requires BDD scenarios
   when T4 flips `dep`.
2. **Malformed frontmatter keys**: `weird:` (no trailing space) makes bash emit the JSON
   key `"weird:"` — colon included; `odd:novalue` emits key `"odd:novalue"`. Core splits at
   the first colon → `weird`, `odd`. Unreachable via tool-written files (`update_yaml_field`
   always writes `key: `).
3. `id:foo` without a space: bash yields `oo` (`substr($0,5)`), core yields `foo`.
4. `deps: [a, , b]`: bash emits `"a",,"b"` (invalid JSON); core drops empty items.
5. Control characters in a value: bash emits them raw (invalid JSON); core JSON-escapes.
6. **`dep tree` root resolution**: bash resolves the root by substring only, with no
   exact-match tier, so an id that is a substring of another id is "ambiguous" there while
   `show`/`ls` resolve it fine. Core's `IdResolver` always applies exact > partial.
   **T4 should use `IdResolver`** — this is the one divergence that changes an error path
   users can hit.
7. `update_yaml_field`'s sed is not anchored to the frontmatter block and rewrites matching
   body lines too; core scopes mutation to the block.

## What a reviewer must check

- Divergence 6 is an intentional behavior change on an error path — confirm it is wanted.
- `measureSubtreeDepths`' snapshot-before-recurse (`src/core/dep-graph.ts`) exists purely
  to reproduce bash's sibling ordering; it looks odd without the comment.
- `TicketStore#collectInto` uses an **ancestor** realpath set, not a global visited set —
  a global one would wrongly hide a directory reachable through two symlinked paths.
- `Frontmatter#withField` prepending new keys is parity, not an accident.
- CHANGELOG.md was intentionally NOT touched: nothing user-facing changed (no command
  flipped). The existing `### Changed` entry from T1 already covers the port.
- `Frontmatter.fromEntries`, `TicketDocument.of`, `Ticket.withArrayField`,
  `DepGraph.children/activeDependents` have no production caller yet — they are the API
  T4/T5 need (`create`, `dep`/`undep`/`link`, `show`).

## Follow-up tickets created

| ID | Title | deps |
|----|-------|------|
| `nid_fba92yfczp71jjcprn4ufmory_e` | dep cycle: bash reports non-cycles; add BDD scenario when T4 flips it | T4 |
| `nid_mgfn04pyn3byxj72xxq0mggw5_e` | Promote bash-vs-TS differential parity harness into the repo | T2 |

## Observation (no ticket, too small)

`CHANGELOG.md` `[Unreleased]` has **two** `### Changed` headings, which will produce a
malformed release body. Worth folding together next time CHANGELOG is edited.

## Files changed

- Added: `src/core/{frontmatter,ticket,ticket-store,id,slug,dep-graph}.ts`
- Added: `test/{frontmatter,ticket,slug,id,ticket-store,dep-graph}.test.ts`
- Modified: `package.json` (`build:test`, `test` scripts), `tsconfig.json` (include
  `test/**/*.ts`), `Makefile` (`unit-test` target, `test` depends on it), `.gitignore`
  (`dist-test/`), `CLAUDE.md` (core module map + unit-test instructions)
- Untouched: `ticket`, `features/`, `CHANGELOG.md`, `README.md`, devDependencies

No `#QUESTION_FOR_HUMAN`.
