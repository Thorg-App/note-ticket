# IMPLEMENTATION Phase B — `closed` and `query` (ticket nid_zesi8c4t7lyw6jgmqqsjqd54k_e)

`TS_COMMANDS` in `./ticket` is now `"help --help -h ls list ready blocked closed query"`, so **all
five read commands of T3 are served by the TypeScript bundle**. Each was flipped separately with
`make test` green in between. Commits on the branch: **`10e663f`** (implementation), **`4dfe08e`**
(tests, parity coverage, docs). Tree clean.

## Signal

**READY** for review.

## Results — my own runs, after the final commit

| Check | Before Phase B | After |
|---|---|---|
| `make typecheck` | exit 0 | exit 0 |
| `make unit-test` | 207 tests, 0 fail | **245 tests, 0 fail** |
| `make test` (BDD) | 192 scenarios, 1272 steps, 0 failed | **205 scenarios, 1353 steps, 0 failed** (12 features) |
| `make parity` | graph 68 scenarios / 0 failures; query OK; slug OK | **graph 69 / 0 failures**; **query identical over 8 invocations (33 lines)**; slug OK; 4 pinned divergence checks OK |

Non-vacuity, measured rather than asserted:
- The two feature files run against a bash-only copy (`TICKET_SCRIPT=.tmp/ticket-bash-only`) give
  **35 passed / 17 failed**, and the 17 are exactly the behavior-change scenarios — 9 from Phase A
  plus my 8 (closed: missing id, non-numeric limit, empty limit, limit 0, bad limit on an empty repo;
  query: control character escaped, control character through a jq filter, missing id). The other 5
  new scenarios pass on both sides, which is correct — they are parity locks.
- 7 mutations of `dist/ticket.mjs` against `make parity`: 4 caught immediately, **3 survived** and
  exposed real holes in the harness, which I then closed (details below). All now caught.

## What was implemented

New in `src/core/` (still CLI-free — no argv, no console, no formatting):
- `TicketStore.loadRecent(maxFiles)` — bash `ls -t … | head -n 100`: newest first, **nanosecond**
  mtime (`mtimeMs` is too coarse), ties broken by ascending byte-wise path as `ls -t` does, capped by
  FILE COUNT before anything is filtered; unstattable files dropped as `ls -t 2>/dev/null` drops them.
- `Ticket.isFinished` — `closed || done`, deliberately separate from `isClosed`.
- `Ticket.toJsonText()` — the JSONL line, so the not-yet-ported `create` reuses one serializer
  (bash shares `_file_to_jsonl` between `create` and `query`).
- `Ticket.hasFrontmatterFields` **deleted**: `query` does not need it (a file with no fields has no
  `id`, and the store rejects that file), and nothing else used it.

New in `src/cli/`:
- `row-limit.ts` — `RowLimit`, `closed`'s `--limit=` (default 20).
- `jq.ts` — `Jq.select`, spawns the external `jq -c "select(<filter>)"` and passes its stdout,
  stderr and exit code straight through. jq is never reimplemented.
- `commands/closed.ts`, `commands/query.ts`.
- `cli-error.ts` — `CliError` gained `exitCode` (default 1), so a missing `jq` can still exit 127
  through the single error channel; `main.ts` returns it.
- `list-options.ts` — `limitText` is now `string | undefined`: bash rejects `--limit=` but defaults
  to 20 when the flag is absent, so the two cases must be distinguishable.

Reused unchanged from Phase A: `TicketFilter`/`filterIgnoringStatus`, `TicketRow.withStatus`,
`StoreResolver.forReadCommand`, `Cli.read`. No parallel copies were created.

## Files touched (repo-relative)

New: `src/cli/row-limit.ts`, `src/cli/jq.ts`, `src/cli/commands/closed.ts`,
`src/cli/commands/query.ts`, `test/query-command.test.ts`.

Modified: `ticket` (`TS_COMMANDS` line only), `src/cli/main.ts`, `src/cli/cli-error.ts`,
`src/cli/list-options.ts`, `src/core/ticket.ts`, `src/core/ticket-store.ts`,
`test/list-commands.test.ts`, `test/ticket.test.ts`, `test/ticket-store.test.ts`,
`features/ticket_listing.feature`, `features/ticket_query.feature`,
`features/steps/ticket_steps.py`, `scripts/parity/{harness,check_graph,check_query}.py`,
`scripts/parity/dump.ts`, `scripts/parity/README.md`, `CHANGELOG.md`, `README.md`, `CLAUDE.md`,
`docs-internal/migration-to-ts-high-level.md`.

## Divergences DECLARED (bash is the contract; where TS is more correct, it is declared, not silent)

Each is pinned in the parity harness, in a unit test or BDD scenario, in the code's doc comment, and
in `CHANGELOG.md` / `scripts/parity/README.md` (whitelist entries #4 and #5).

1. **`closed --limit=` takes a plain decimal count only.** bash forwarded the raw text to `head -n`,
   which also accepted `+N`, size suffixes (`--limit=2k` = 2048) and negative values meaning "all but
   the last N", and reported `head: invalid number of lines: 'abc'` for a typo. TS: exit 1 with
   `Error: --limit must be a whole number of rows, got 'abc'`.
2. **`closed --limit=0` exits 0 deterministically.** bash exited **0 or 141 racily** — measured
   flipping on identical input, because `head -n 0` exits without reading and under `pipefail` bash
   reports `awk`'s SIGPIPE only when awk loses the race. (The 100-row cap keeps output below the pipe
   buffer, so `--limit>0` never races. That bound is why this is scoped to 0.)
3. **A bad `--limit=` is reported even with nothing to list.** bash returned before `head` ever ran
   when the tickets dir was empty, so the typo silently exited 0 there.
4. **`query` escapes control characters, so its JSONL is always valid JSON.** bash's `json_escape`
   handled `\` and `"` only. Reachable through `tk create $'tab\there'`: bash emitted a raw tab inside
   a JSON string, and bash's own `query .id` then died inside jq with rc 4,
   `Invalid string: control characters ... must be escaped`. This is a **user-facing bug fix**.
5. **Missing `jq`**: exit code 127 kept, message replaced (bash printed the shell's
   `./ticket: line NNN: jq: command not found`, which names a line of the script).
6. Inherited from Phase A and now live for these two commands as well: a `.md` file with no `id`
   fails the whole command; `-a`/`-T` without a value is a named error instead of a bash
   `unbound variable` crash.

Hand-edit-only serializer differences that were already documented in `src/core/frontmatter.ts` (bash
duplicates repeated keys, turns a colon-less line into a key, and emits `["x",,"y"]` for an empty
array item) are unchanged by this phase and unreachable through `create`; details in the PRIVATE file.

## Harness work — and the three vacuity holes it had

`closed` joined the byte-compared CLI invocations and `query` is now compared through the **real CLI**
(its `dump.ts` mode is deleted, per the rule "when you port a command, point its check at the CLI"),
over 8 invocations including the jq filter, an unmatched filter and a syntax error.

Three of my seven mutations of `dist/ticket.mjs` **survived** the first run. Each was a genuine hole:

| Mutation | Why it survived | Fix |
|---|---|---|
| `SCANNED_FILE_LIMIT` 100 → 1e9 | no fixture had more than 100 files | `_check_closed_scan_cap`: 120 files with the closed ones oldest — and it fails if bash ever starts printing rows, so the fixture cannot silently go stale |
| `isFinished` → `isClosed` | no fixture had `status: done` | new `legacy-done` FIXED_SCENARIO with a `done` ticket that also blocks a dependent, pinning both notions at once |
| mtime tie-break → `return 0` | V8's sort is stable and `collectFiles` is already byte-ordered, so *removing* the tie-break is unobservable | kept the explicit comparator (relying on sort stability for a contractual order is hidden coupling) and proved it observable with a *wrong* tie-break (`-PathOrder.compare`), which the harness catches |

Also: generated fixtures now get explicit mtimes that are deliberately **not** in path order (a
path-ordered `closed` would otherwise pass), and both sides run under `LC_ALL=C` because bash breaks
equal-mtime ties with `strcoll` while TS compares bytes — that locale-dependent corner is documented
in `scripts/parity/README.md` rather than pinned.

## Deferred / open

- The T3 ticket is left **open** for the orchestrator to close (git history shows the flow does that).
- No automated test for the missing-`jq` branch (exit 127): faking or removing the binary from a unit
  test buys little, and BDD covers the real jq path. bash's side was measured by patching the script
  to call a nonexistent binary. Flagged rather than hidden.
- Phase A's follow-ups stand: CI does not run `make parity` (`nid_94f11043dhpk198dj9e6gr6pn_e`) and
  CRLF files hard-fail with a misleading message (`nid_z10hpj927zqilxcpl9ycpe0ad_e`). Both matter more
  now that `query` is TS-served.
- Phase A's note that "`query` will flip the last of the parity whitelist" turned out to be wrong: the
  missing-`id` entry is still required, it now just describes the shipped CLI. Corrected in place.
