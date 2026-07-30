# IMPLEMENTATION_REVIEWER — Phase B review (`closed`, `query`)

Reviewed `10e663f`, `4dfe08e`, `ec89845` (diff `3486848..HEAD`) on branch
`nid_zesi8c4t7lyw6jgmqqsjqd54k_e_2026-07-29T18-22-47PDT`. Read-only for sources.
`dist/ticket.mjs` was mutated for testing and restored — verified **byte-identical to a fresh
`npm run build`**, `git status` clean.

## Verdict

**READY** for convergence. No BLOCKING findings.

**Acceptance is genuinely met.** `TS_COMMANDS="help --help -h ls list ready blocked closed query"`
— all five read commands of T3 are served by the bundle — and the full BDD suite is green.
(One note for the record: the ticket's parity note "`closed`: … missing priority defaults to 2"
is inapplicable — bash's `closed` row format `%-8s [%s] - %s` prints no priority. Nothing is
missing; the spec line was simply wrong, and nobody should "fix" it later.)

## Summary

Bash `cmd_closed` and `cmd_query` are ported. `TicketStore.loadRecent` reproduces
`ls -t … | head -n 100` (nanosecond mtime, name tie-break, cap on FILES before filtering);
`RowLimit` owns `--limit=`; `Jq` spawns the real `jq` and passes stdout/stderr/exit code
through; `Ticket.toJsonText` is the one JSONL serializer (as bash shares `_file_to_jsonl`
between `create` and `query`). `CliError` gained `exitCode` so a missing `jq` exits 127 through
the single error channel established in Phase A. `src/core/` is still CLI-free (no `console`,
no `process.argv`, no `process.stdout/stderr/exit`). No scenario, test or anchor point was
removed anywhere — `features/` is additions only (0 deleted lines), and `hasFrontmatterFields`
really was unused once `dump.ts`'s `query` mode went with it.

### Suites — my own runs

| Command | Implementer claimed | I measured |
|---|---|---|
| `make typecheck` | 0 | **0** |
| `make unit-test` | 245 / 0 fail | **245 tests, 38 suites, 0 fail** |
| `make test` | 205 scenarios / 0 failed | **12 features, 205 scenarios, 1353 steps, 0 failed** |
| `make parity` | graph 69 / 0, query OK, slug OK | **graph OK 69 / 0 (19 whitelisted cycles), query OK (8 invocations, 33 lines), slug OK 13** |

Every number reproduces exactly.

### The five declared divergences — all real, all correct, all declared

The **racy `--limit=0` exit code is the strongest claim and it holds.** 60 bash runs on
identical input with 6 closed tickets: `{141: 35, 0: 25}`. With 0 closed tickets:
`{0: 40}` — deterministic, exactly as the SIGPIPE explanation predicts. I also re-measured the
whole `head -n` family (`-1`, `2k`, `+3`, `" 3"` → rc 0 printing rows; `abc`, `""`, `"3 "`,
`1e2` → rc 1), the empty-dir case, and the control-character bug through real bash `create`
(bash's own `query .id` dies in jq, rc 4). `isFinished` vs `isClosed` is correct against bash,
not a convenience: `ticket:978` selects `closed || done` while `ticket:69` tests
`statuses[dep] != "closed"`, so a `done` dep still blocks. Dep semantics did not shift.

### Mutation battery — 14 mutations of the bundle

Parity CAUGHT: `SCANNED_FILE_LIMIT`→1e9 and →3, mtime tie reversed, mtime order reversed,
`full_path` moved first, `--limit` applied before filtering, `isFinished`→`isClosed`, filter
first-arg-wins, control-char escaping removed, `WHOLE_NUMBER` loosened. **The implementer's
claim that it closed the scan-cap and tie-break holes is correct** — I initially mis-scored
four of these as survivors because `tail -6` truncated the multi-line `graph FAIL` summary.
Four mutations genuinely survived everything; they are findings S3, N1, N2 below.

---

## 🚨 CRITICAL / BLOCKING

None.

---

## ⚠️ IMPORTANT (SHOULD-FIX)

### S1 — `closed` orders symlinked ticket files by the wrong mtime (undeclared divergence)

`src/core/ticket-store.ts:253` (`modifiedAtOrUndefined` → `statSync(path, { bigint: true })`).

GNU `ls -t` does **not** dereference a command-line symlink to a file (no `-L`/`-H`), so bash
sorts by the **symlink's own** mtime. `statSync` follows the link and sorts by the **target's**.
Measured (symlink mtime 2030, its target 2020, a plain sibling 2025):

```
bash:  sym1     [closed] - Sym       dir1     [closed] - Direct
ts:    dir1     [closed] - Direct    sym1     [closed] - Sym
```

This matters because `README.md` documents symlinked ticket files as a supported layout, and
`_collect_ticket_files` deliberately uses `find -L` to pick them up. Bash is the contract and
this divergence is nowhere declared.

**Fix:** `lstatSync(path, { bigint: true }).mtimeNs` — one line, plus a unit test with a
symlink whose own mtime differs from its target's, and a `check_graph` pin. If lstat is
considered *worse* behaviour, then declare it as whitelist #6 instead; silent is not an option.

### S2 — `query <filter>` into a short reader exits 1 where bash exits 141 (undeclared)

`src/cli/jq.ts:13` / `:36` — `SIGNALLED_EXIT_CODE = 1`, whose own comment says "bash would say
128+signal" and then does not do that. Measured on 400 tickets:

```
tk query '.id != null' | head -1   →  bash rc=141, TS rc=1
```

`tk query <filter> | head` is an everyday invocation. The code comment is not a declaration:
this is not in `CHANGELOG.md`, not in `scripts/parity/README.md`, and not pinned by any test.

**Fix:** return `128 + os.constants.signals[result.signal]` (exact parity, and correct Unix
convention), or declare it as a whitelist entry with a pin. Prefer the former.

### S3 — the empty-tickets-dir guard in `query` is load-bearing but pinned by nothing

`src/cli/commands/query.ts:22` — `if (tickets.length === 0) return EXIT_SUCCESS;`.

I replaced the condition with `if (false)` and **`make parity`, the full BDD suite and the unit
tests all stayed green**. The guard is real: bash returns before `jq` ever runs, so
`query 'syntax((('` in an empty tickets dir exits 0 in bash but would exit 3 without the guard.
`check_query` has no empty-repo case at all, while `check_graph` has `_empty_repo_limit_problems`
for exactly this shape on `closed`.

**Fix:** add an empty-repo `["query", "syntax((("]` comparison to `check_query.py` mirroring
`_empty_repo_limit_problems`, or a BDD scenario. Cheap, and it closes the last unpinned
behavioural decision of this phase.

### S4 — the missing-`jq` divergence is declared only in a code comment

The implementer lists it as divergence #5, but `scripts/parity/README.md` enumerates exactly
five whitelisted divergences and this is not among them, nor is it in `CHANGELOG.md` — unlike
the other four. I verified the branch by hand with a jq-free `PATH`: rc **127**,
`Error: jq: command not found` + `Install jq, or run 'query' without a filter`, and `query`
without a filter still works. The behaviour is right; the paper trail is incomplete.

Same applies to S2. **Fix:** add whitelist entries so the list is complete, and a CHANGELOG line
for the message change. A BDD scenario running with `PATH` pointed at a jq-free directory is
straightforward and would remove the "no automated test" caveat entirely — I would take it,
because 127 currently rests on `spawnSync` returning `error.code === "ENOENT"`, which is an
implementation detail of Node that nothing guards.

### S5 — `make parity` is still not in CI, and this phase's guarantees now live there

Measured: `SCANNED_FILE_LIMIT` 100→1e9, `--limit` applied before filtering, and `full_path`
moved to first are **all invisible to `make test`** — only parity catches them. BDD missed 6 of
the 14 mutations parity caught. `.github/workflows/test.yml` runs only `make test`, so CI cannot
see a regression in the scan cap, the mtime order, the `--limit` divergences, `full_path`
position or control-character escaping.

Follow-up ticket `nid_94f11043dhpk198dj9e6gr6pn_e` already exists. **Recommendation:** raise its
priority and note in it that T3's verification story depends on it. Not this ticket's work, but
it should not be filed and forgotten.

---

## 💡 Suggestions (NIT)

- **N1 — nanosecond mtime is unpinned.** `mtimeNs`→`mtimeMs` survived parity, BDD and unit
  tests; no fixture spaces mtimes by less than a second. One unit test using `utimesSync` with
  sub-millisecond times closes it (`ticket-store.test.ts:122`).
- **N2 — the default `--limit=20` is never verified differentially.** Only
  `RowLimit.parse(undefined).applyTo(rows).length === 20` pins it, i.e. a test asserting the
  constant. A generated `closed` fixture with 25 closed tickets would pin it against bash.
- **N3 — validate argv before doing I/O.** `RowLimit.parse` runs inside
  `ClosedCommand.renderTickets` (`closed.ts:36`), i.e. *after* `loadRecent` has stat'ed and read
  up to 100 files. Parse-then-act is cheaper and makes the error precedence deterministic when a
  repo has both a bad `--limit=` and a missing-`id` file.
- **N4 — exit codes now live in five places.** `main.ts` (`EXIT_SUCCESS`/`EXIT_FAILURE`),
  `query.ts` (`EXIT_SUCCESS` again), `cli-error.ts` (`DEFAULT_EXIT_CODE`), `jq.ts`
  (`COMMAND_NOT_FOUND_EXIT_CODE`, `SIGNALLED_EXIT_CODE`). Same category as the Phase A
  "two error channels" finding, one level down. A single `exit-codes.ts` would be DRY.
- **N5 — `Frontmatter.parseLine`'s divergence note is imprecise.** `frontmatter.ts:178` says a
  letter-initial line "with no colon" is not a field. The reachable case is a line with a colon
  but **no `": "` separator**: for `title:` bash's `_file_to_jsonl` emits the key `"title:"`
  with an empty value, TS emits `title`. Hand-edit-only (`create` and `update_yaml_field` always
  write `": "`), so no behaviour change needed — just say "no `: ` separator".
- **N6 — `ClosedCommand.render` has no unit test.** It is the only user of
  `SCANNED_FILE_LIMIT`, and its coverage is entirely in the parity harness (see S5).

---

## Things done well, worth keeping

- Divergences were **measured, not asserted** — the `--limit=0` race is a claim most reviewers
  would have taken on faith, and it reproduces.
- `_check_closed_scan_cap` fails if bash ever *starts* printing rows, so the fixture cannot go
  stale silently. That is the right way to write a pinned check.
- Explicit non-path-order mtimes in `harness.write_scenario` — without them a path-ordered
  `closed` would have passed the byte-compare.
- The `LC_ALL=C` decision is documented as *pinned locale* rather than pretended-away.
- `dump.ts`'s `query` mode was deleted when the CLI took over, so no format is described twice.
- Honest reporting of what survived mutation and what has no test.

## Documentation Updates Needed

- `scripts/parity/README.md` — add whitelist entries for the missing-`jq` message (S4) and the
  jq SIGPIPE exit code (S2) so "the following five" is actually the complete list.
- `CHANGELOG.md` — one line for the missing-`jq` message change.
- `src/core/frontmatter.ts:178` — wording fix (N5).
- `CLAUDE.md` / `README.md` — accurate as they stand; if S1 is fixed with `lstatSync`, add
  "symlink's own mtime" to the CLAUDE.md trap-area list next to the `closed` mtime note.
