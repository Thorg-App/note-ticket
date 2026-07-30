# T2 — Core data-model library (`src/core/`)

Ticket: `nid_ropjwdm792a5qqyu2u0zeuna1_e`. No command was flipped to TS; `TS_COMMANDS`
in `./ticket` is unchanged (`help --help -h`) and `features/` is untouched.

**Round 1 review: addressed. Signalling READY.** SF-1 and SF-2 (both gating) are fixed
with regression tests; SF-3 is fully incorporated; 6 of 7 suggestions incorporated, 2
rejected with rationale (see the disposition table). The review was accurate on every
finding, including one where my own reasoning had been wrong (SF-3.1 — see below).

## Review disposition (round 1)

| # | Finding | Disposition | Notes |
|---|---------|-------------|-------|
| SF-1 | `save()` lost bash's atomic write | **INCORPORATED** | write-to-scratch + `renameSync`; scratch is `<path>.tmp.<pid>` (never `.md`); failed write cleans up and rethrows the ORIGINAL error. 3 new tests incl. "old content survives a failed write". |
| SF-2 | `text()` byte-exactness claim false for unterminated block | **INCORPORATED** | Chose *preserve*, not repair: `BlockShape = none \| unterminated \| terminated`. `text()` is now byte-exact for all three, which is also closer to bash (`sed` rewrites one line, it does not restructure). 5 new tests, incl. the exact two inputs the reviewer measured. **No longer a divergence.** |
| SF-3.1 | Empty-ID resolution divergence unlisted | **INCORPORATED (divergence KEPT)** | Reviewer was right and **my earlier reasoning was wrong**: I had assumed `index(s,"")==0`; it is 1 here too (`awk 'BEGIN{print index("abc","")}'` → 1) and `tk show ""` does succeed in a one-ticket repo. Kept the TS guard, expanded the code comment into an explicit DIVERGENCE block, 2 new tests, and raised a `decide` ticket. |
| SF-3.2 | Colon-less letter-initial line | **INCORPORATED** | Listed as divergence 8; noted in `Frontmatter.parseLine` doc; test pins TS behavior. |
| SF-3.3 | Duplicate frontmatter key | **INCORPORATED** | Listed as divergence 9; `Frontmatter` class doc now states first-occurrence semantics explicitly ("Duplicate keys are NOT set semantics"); 2 tests. |
| S-1 | Symlink-loop test asserts only `length > 0` | **INCORPORATED** | Now asserts the exact 3-file list, so replacing the ancestor set with a global visited set fails the test — which is what the code comment warns against. |
| S-2 | `resolve({}, tmpdir())` assumes `/tmp` is repo-free | **INCORPORATED** | Uses an owned `mkdtempSync` root and *guards the premise*: if `git rev-parse` succeeds there the test skips with a reason rather than asserting something meaningless. Currently 0 skips. |
| S-3 | `withBodyAppended` comment inaccurate | **INCORPORATED** | Comment now says "Append text to the body verbatim". |
| S-4 | `TicketId.isWellFormed` has no named consumer | **INCORPORATED** | Deleted. Its test replaced by `assert.match(TicketId.generate(), /^nid_[a-z0-9]{25}_e$/)` plus an alphabet-coverage test, so shape is still pinned without dead API. |
| S-5 | Recursion could blow the JS stack where bash's explicit stacks would not | **REJECTED** | Reviewer agrees it is not worth fixing now. Depth is bounded by the dependency chain length; a chain deep enough to exhaust the JS stack (~10⁴) is not a real ticket graph, and converting three readable recursions into stack machines would cost exactly the readability this port exists to buy. Recorded in PRIVATE as known-and-accepted. |
| S-6 | `Number()` accepts forms awk strnum does not (`0x1F`) | **REJECTED** | Unreachable: priority is documented 0–4 and written by `create`. Guarding it would add a hand-rolled numeric parser to satisfy an input no user produces — anti-KISS. Reviewer marked it "no action". |
| S-7 | Keep the harness ticket ahead of T4 | **INCORPORATED** | Made structural rather than a wish: T4 (`nid_8cislepljqvv88ayndtjlw34k_e`) now `deps` on the harness ticket `nid_mgfn04pyn3byxj72xxq0mggw5_e`. |
| Doc | CHANGELOG `[Unreleased]` has two `### Changed` headings | **NOT ACTIONED (deliberate)** | Reviewer agrees CHANGELOG is correctly untouched by this ticket; folding the duplicate heading would be an unrelated edit in a file the coordinator owns at release time. Flagged, not changed. |

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
`grep -rn 'process\.' src/core/` → exactly two hits, both in `ticket-store.ts`:
`process.env`/`process.cwd()` as injectable defaults on `TicketsDirectory.resolve` (tests
exercise the injected form), and `process.pid` in the `save` scratch-file name — the same
role bash's `$$` plays in `_sed_i`, not CLI knowledge.
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

## Test results (exact commands, re-run after the review fixes)

```
npx tsc --noEmit                → exit 0, clean
npm test  (= make unit-test)    → 167 tests, 24 suites, 167 pass, 0 fail, 0 skipped
make test (build + unit + BDD)  → 167/167 unit + 12 features, 180 scenarios, 1205 steps, 0 failed
```

Unit tests went 154 → 167 (+13: 5 for SF-2, 3 for SF-1, 2 for SF-3.1, 2 for SF-3.3,
1 for SF-3.2, plus the S-4 replacement, minus the two `isWellFormed` tests).

Parity harness re-run after the serialization change: `query` JSONL still
**byte-identical**; over 68 graphs the only mismatching mode is the intentional
`dep cycle` divergence (`dep tree`, `dep tree --full`, `ready`, `blocked` all clean).

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

## Deliberate divergences from bash — complete list (all documented in code)

Divergences 8–10 were added after the review (SF-3). The list is now believed complete
for `src/core/`; every item is reachable only through malformed/hand-edited frontmatter or
an error path, none has BDD coverage, and each is a strict improvement.

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
8. **Colon-less letter-initial frontmatter line** (`colonless line here`): bash makes the
   whole line a JSON key with an empty value and counts it toward `field_count` — so a
   file whose only "field" is such a line gets a `query` line from bash and none from TS.
   Core does not treat it as a field. Documented on `Frontmatter.parseLine`.
9. **Duplicate frontmatter key**: bash emits both (`"status":"open","status":"closed"`) and
   its `s/^k:.*/…/` / `/^k:/d` hit EVERY occurrence. Core addresses the FIRST occurrence
   only and `toJsonRecord` collapses to last-value-at-first-position. Stated in the
   `Frontmatter` class doc so nobody assumes set-semantics parity.
10. **Empty ID resolves to nothing** (`IdResolver`) — the one divergence that needs a human
    yes/no. awk `index(s, "")` is **1**, so bash `ticket_path ""` substring-matches every
    ticket: verified live, `tk show ""` **succeeds and shows the ticket** in a one-ticket
    repo and reports "ambiguous" with two or more. That means `tk close "$UNSET_VAR"` can
    mutate an arbitrary ticket. Core never resolves an empty search, at any repo size.
    → `decide` ticket `nid_5g3eta9cf7yi6iukmscxma6wc_e` (with divergence 6, which is the
    same family) must be answered before T3/T4/T5 flip id-resolving commands.
    **Correction to my round-0 write-up**: I had claimed this guard "matched bash". It does
    not — I had assumed `index(s,"")==0` without checking. The reviewer caught it.

## What a reviewer must check

- **Divergences 6 and 10** are intentional behavior changes on error paths — the `decide`
  ticket `nid_5g3eta9cf7yi6iukmscxma6wc_e` exists so a human confirms both. This is the
  only human decision this ticket produces.
- `TicketStore.save`'s scratch-file name must stay non-`.md` (a crash between write and
  rename would otherwise leave a file `collectFiles` reports as a ticket), and the cleanup
  `catch {}` deliberately swallows so the ORIGINAL write error reaches the caller.
- `TicketDocument`'s `BlockShape`: `withFrontmatter` promotes `none` → `terminated` (you
  cannot add fields without delimiters) but leaves `unterminated` alone (bash edits the
  field line and does not restructure).
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

| ID | Title | deps | tags |
|----|-------|------|------|
| `nid_fba92yfczp71jjcprn4ufmory_e` | dep cycle: bash reports non-cycles; add BDD scenario when T4 flips it | T4 | ts-port |
| `nid_mgfn04pyn3byxj72xxq0mggw5_e` | Promote bash-vs-TS differential parity harness into the repo | T2 | ts-port |
| `nid_5g3eta9cf7yi6iukmscxma6wc_e` | Confirm intentional ID-resolution error-path changes before flipping read/write commands | T2 | ts-port, **decide** |

Also wired: **T4 (`nid_8cislepljqvv88ayndtjlw34k_e`) now deps on the harness ticket**, so
the only thing that can catch a `dep tree` ordering regression lands before the graph
commands flip (review suggestion S-7, made structural instead of a wish).

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

Review round 1 touched only `src/core/{ticket-store,frontmatter,id}.ts` and
`test/{frontmatter,ticket-store,id}.test.ts` — no new files, no new dependencies, no
change to the build or make wiring.

No `#QUESTION_FOR_HUMAN` blocking this ticket — the one human decision (ID-resolution
error paths, divergences 6 and 10) is captured as the `decide`-tagged ticket
`nid_5g3eta9cf7yi6iukmscxma6wc_e` rather than blocking T2, because nothing user-visible
changes until a command is flipped and `TS_COMMANDS` is untouched.

## READY signal

**READY.** Both gating findings fixed with regression tests that fail against the old
code; SF-3 incorporated; `npx tsc --noEmit` clean, `npm test` 167/167, `make test` 180
scenarios / 1205 steps green; parity harness clean apart from the accepted `dep cycle`
divergence. Nothing committed — `ticket`, `features/`, `CHANGELOG.md` untouched,
`TS_COMMANDS` unchanged.
