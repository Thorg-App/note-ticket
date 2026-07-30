# IMPLEMENTATION_REVIEWER — PRIVATE memory (Phase A review, ticket nid_zesi8c4t7lyw6jgmqqsjqd54k_e)

Reviewed commits `36e8704`, `c27e3af`, `081a9e4` on branch
`nid_zesi8c4t7lyw6jgmqqsjqd54k_e_2026-07-29T18-22-47PDT`. Read-only: no source file was
modified. `dist/ticket.mjs` was temporarily mutated for a harness mutation test and
restored from `.tmp/ticket.mjs.bak` (verified `padEnd(ID_COLUMN_WIDTH)` back, `git status`
clean). Scratch artifacts live in `.tmp/` (gitignored): `probe.py`, `probe2.py`,
`probe-ref/ticket`, `ticket-bash-only`, `review-*.log`.

## 1. Suites — run by me, real numbers

| Command | Result |
|---|---|
| `make typecheck` | exit 0 |
| `make unit-test` | 202 tests / 30 suites, **0 fail** |
| `make test` (BDD) | 12 features, **190 scenarios passed, 0 failed**, 1260 steps |
| `make parity` | graph OK 68 scenarios / 0 failures (19 whitelisted bogus bash cycles); query OK; slug OK |

Every number the implementer claimed in `IMPLEMENTATION_WITH_SELF_PLAN__PUBLIC.md`
reproduced exactly. Logs: `.tmp/review-{typecheck,unit,test,parity}.log`.

## 2. Harness really is BASH vs TS — verified two ways

- Code read: `harness.py::BashReference._materialize()` copies `./ticket` and `re.subn`s
  `^TS_COMMANDS=.*$` → `TS_COMMANDS=""`, asserting `count == 1` (loud `SystemExit`
  otherwise). `bash_result()` runs that copy; `ts_cli_result()` runs `dist/ticket.mjs`.
  `check_graph.CLI_INVOCATIONS` feeds identical argv to both sides for
  `ls`/`ready`/`blocked` + every filter flag. `dump.ts` lost its `ready`/`blocked` modes,
  so no format is described twice. `make parity: build` (was `$(NPM_STAMP)`).
- **Mutation test**: `sed 's/padEnd(ID_COLUMN_WIDTH)/padEnd(9)/' dist/ticket.mjs` →
  `python3 scripts/parity/run.py` reported `graph FAIL scenarios=68 failures=888`.
  So the diff is live, not hollow. (Implementer said 787; I got 888 — different because
  `ls` invocations were added; direction is what matters.)

## 3. Non-vacuity of the new BDD scenarios — verified

`TICKET_SCRIPT=$PWD/.tmp/ticket-bash-only uv run --with behave behave
features/ticket_listing.feature` (bash-only copy, `TS_COMMANDS=""`):
**22 passed, 7 failed** — exactly the 7 behavior-change scenarios (3 missing-id shapes for
`ls`, missing-id for `ready`, for `blocked`, `-a` without value, `-T` without value).
The other 3 new scenarios (empty dir succeeds, `ready` ignores `--status`, `blocked`
priority order) pass on both sides — correct, they are parity locks not behavior changes.
This is the strongest evidence the new scenarios are not assertion-aligned noise.

Missing-`id` coverage confirmed complete: missing key (`orphan.md`), empty value
(`blank-id.md`), no frontmatter at all (`loose-note.md`); each asserts
`the command should fail` **and** the new `stderr should contain` step (which reads
`context.stderr` specifically, unlike the pre-existing merged-streams step).

Unit-test spot checks for mutation sensitivity:
- `ReadyCommand` fixture uses priorities `2` and `10` → catches a string-vs-numeric
  priority sort regression (awk strnum semantics). Not vacuous.
- `TicketRow` tests pin pad width 8, no truncation of a 19-char id, the trailing space of
  an empty title, `[a, b]` dep rendering, and marker omission when deps are empty.
- `ReadyCommand` "ignores --status" compares `render(--status=closed)` to `render([])`;
  RHS is non-empty, so an overreaching filter fails it. Acceptable.

## 4. Bash contract diffed line by line vs TS

Read `ticket:785-1089` (`cmd_ls`, `cmd_ready`, `cmd_closed`, `cmd_blocked`), `ticket:9-41`
(`find_tickets_dir` / `init_tickets_dir`), `ticket:129-138` (`_collect_ticket_files`),
`ticket:1569-1620` (dispatcher). Confirmed matching in TS:
- Row formats: `%-8s [%s] - %s%s` (ls), `%-8s [P%s][%s] - %s` (ready),
  `… - %s <- %s` with `[a, b]` (blocked) — all in `src/cli/ticket-row.ts`, one place.
- `ls` = per-file emit, no sort, no dedup (unit-tested with a duplicated id).
- `ready`/`blocked` populations = status `open|in_progress`; deps looked up over ALL
  tickets, filter applied to the RESULT (documented WHY in both command files) — matches
  bash, which stores every id then filters in `END`.
- Unknown/dangling dep ⇒ not closed ⇒ blocks (`DepGraph.isClosed` `?? false`).
- `blocked` lists only non-closed deps after `<-`, in `deps` order.
- Sort: priority (numeric when both numeric, else lexicographic — mirrors awk strnum)
  then id. `TicketOrder` in `dep-graph.ts`.
- priority default `2` (`DEFAULT_PRIORITY` in `ticket.ts`).
- Duplicate id ⇒ last file in enumeration order wins in both.
- `--status` honored only by `ls`; `ready`/`blocked` use `filterIgnoringStatus`; bash
  never reads `--status` there. Pinned in parity via `ready --status=closed` /
  `blocked --status=closed`.
- Unrecognised argv silently skipped (bash `*) shift`).
- `-a`/`-T` take `$2` verbatim even if it looks like a flag (unit-tested with `-a -T`).
- Missing dir ⇒ `Error: tickets directory '<p>' does not exist`, exit 1; not-a-git-repo ⇒
  the two bash lines; existing-but-empty ⇒ exit 0, no output (`StoreResolver`).
- Bash `exec`s node BEFORE `init_tickets_dir`, so the TS side must and does re-implement it.
- `TICKETS_DIR` empty string is falsy in both (`[[ -n ]]` vs `if (override)`).
- Byte-wise path order via `Buffer.compare` (`PathOrder`), hidden dirs pruned, hidden
  files kept — unchanged core, re-read to confirm.

## 5. My own differential probe — 20 hostile fixtures × 16 invocations

`.tmp/probe.py` (bash reference vs `dist/ticket.mjs`, compares stdout **and** returncode).
32 mismatches, all classified:

| Fixture | Divergence | Verdict |
|---|---|---|
| `pipe-title` (`title: "Pipe\|Title"`) | bash `ready` prints `- Pipe` (truncated); bash `blocked` prints `- Pipe <- Title`, i.e. the title fragment where blockers belong. TS prints the full title and real blockers. | **UNDECLARED divergence. Reachable via `tk create "a \| b"` — confirmed live.** Cause: bash packs sort keys as `prio\|id\|status\|title` and `split()`s on print. |
| `trailing-space-status` (`status: open `) | bash keeps the trailing space; TS trims | declared (awk `$2`/`FS=": "` family) |
| `no-space-key` (`id:aaa1`) | bash sees no `": "` ⇒ id empty ⇒ file silently skipped; TS parses it | same declared family |
| `odd-deps` (`deps: [bbb2,]`) | bash renders `[bbb2, ]`; TS `[bbb2]` | hand-edit-only, same family, not separately declared |
| `dup-priority` (two `priority:` lines) | bash last-wins (`P4`), TS first-wins (`P1`) | already declared in `frontmatter.ts` class doc |

Clean (byte-identical) on: bracket/comma titles, unquoted titles, `title: "Fix: the thing"`,
duplicate ids, tags incl. `[]`, legacy `status: done`, body lines that look like
frontmatter, a `---` HR in the body, nested dirs + `.draft.md` ordering, self-dep, cycles,
assignee filtering, 29-char ids, equal-priority tie-break by id, `list` alias, empty
flag values (`--status=`, `--tag=`, `--assignee=`), extra positionals, unknown flags.

`.tmp/probe2.py` (8 more fixtures × 3 commands) added:
- `unicode-id` (`id: ééé1`): bash `printf %-8s` pads **bytes** (1 space), TS `padEnd(8)`
  pads UTF-16 units (4 spaces). Hand-edit-only; ids are generated `[a-z0-9]`. NIT.
- `crlf` (whole file CRLF): bash silently lists nothing, exit 0 (its `/^---$/` never
  matches `---\r`); TS exits 1 with `Error: <path> has no 'id' frontmatter field` even
  though the file visibly has `id: aaa1`. Inside the pre-approved loud-failure family, but
  the message is misleading (POLS). Worth a follow-up ticket.
- Clean: half-open quote, escaped inner quotes, unicode title, tab in title, empty
  `title:`, missing `status:`.

Other checks: `tk ls | head -2` over 300 tickets → no EPIPE crash, exit 0, empty stderr.
`grep` over `src/core/` → no `console`, no `process.argv`, no `process.stdout/stderr`, no
`process.exit`; only `process.env`/`process.cwd()` as injectable defaults and
`process.pid` for the temp name. Core stayed CLI-free.

## 6. CLAUDE.md judgement notes

- SRP/OOP fine: `ListOptions` (parse), `TicketFilter` (match), `TicketRow` (format),
  `StoreResolver` (open dir), `Cli` (dispatch), three thin command classes. Named
  constants throughout (`ID_COLUMN_WIDTH`, `OPTION_*`, `EXIT_*`). No free-floating
  non-private functions. WHY comments are substantive, not restating code.
- Real smell: **two user-error channels** in `main.ts` — `StoreResolver` returns
  already-prefixed message arrays printed inline in `read()`, while `CliError` /
  `MissingTicketIdError` are prefixed in the `catch`. One rendering responsibility, two
  implementations; will multiply as `closed`/`query` land.
- `ListOptions.limitText` is dead until Phase B (YAGNI), tested but unused. Tolerable
  only because Phase B is next.
- Harness compares `.stdout` only; `_run` already returns `returncode`, so comparing it
  is free and would close a small vacuity hole.
- Docs: CLAUDE.md gained an accurate `src/cli/` section + the pinned-bash-copy rule;
  CHANGELOG covers the missing-id and `-a`/`-T` changes; follow-up ticket
  `nid_94f11043dhpk198dj9e6gr6pn_e` created for `make parity` in CI (genuinely missing —
  `.github/workflows/test.yml` runs only `make test`). No pre-existing scenario or anchor
  point was removed (`git diff` on `features/` is additions only).

## 7. Verdict recorded

READY for convergence. No BLOCKING findings. Four SHOULD-FIX (pipe-title declaration +
test, parity generator hostile titles, single error channel, CRLF follow-up ticket) and
three NITs. Full text in `IMPLEMENTATION_REVIEW__PUBLIC.md`.

---

# PHASE B review (commits `10e663f`, `4dfe08e`, `ec89845`; diff 3486848..HEAD)

Read-only for sources. `dist/ticket.mjs` was mutated 14 times and restored from
`.tmp/rv_dist.bak`; verified **byte-identical to a fresh `npm run build`** afterwards and
`git status` clean. Scratch: `.tmp/rv_probe.py`, `.tmp/rv_mutate.py`, `.tmp/rv_*.log|out`
(gitignored). `.tmp/rv_bash_ref` (pinned bash copy, `TS_COMMANDS=""`) deleted at the end.

## 1. Suites — my own runs (all numbers reproduce the implementer's exactly)

| Command | Result |
|---|---|
| `make typecheck` | exit 0 |
| `make unit-test` | **245 tests / 38 suites, 0 fail** |
| `make test` | 12 features, **205 scenarios passed, 0 failed**, 1353 steps |
| `make parity` | graph **OK 69 / 0 failures** (19 whitelisted bogus cycles) + 4 pinned checks; query OK (8 invocations, 33 lines) + 2 pinned; slug OK 13 |

Logs `.tmp/rv_{typecheck,unit,test,parity}.log`.

## 2. Bash contract re-derived line by line

`ticket:219-271` (`_file_to_jsonl`), `ticket:928-987` (`cmd_closed`), `ticket:1486-1506`
(`cmd_query`), `ticket:69` (dep resolution), `ticket:193-204` (`update_yaml_field`).
Confirmed matching in TS: `ls -t | head -n 100` cap on FILES before filtering; `head -n
"$limit"` (default 20) on ROWS after; row `%-8s [%s] - %s` with the file's own status text;
`closed` has no `--status=` case and honours `-a`/`--assignee=`/`-T`/`--tag=`; no id
de-duplication; `query` filter = LAST positional (no flag handling); JSONL = frontmatter key
order, `full_path` appended last, surrounding quotes stripped for non-arrays only, array items
NOT quote-stripped; empty dir returns 0 before `head`/`jq`.

`isFinished` vs `isClosed` is CORRECT, not a convenience: `cmd_closed` selects
`status=="closed" || status=="done"` (`ticket:978`) while `cmd_ready`'s dep test is
`statuses[dep] != "closed"` (`ticket:69`). `TICKET_STATUS_DONE` was correctly kept OUT of
`VALID_TICKET_STATUSES`. `hasFrontmatterFields` really was unused — its only caller was the
`dump.ts` `query` mode, deleted in the same commit.

## 3. The five declared divergences — each verified real

- **`--limit=0` racy exit code: CONFIRMED, and it is a strong claim that holds.** 60 bash runs
  on identical input with 6 closed tickets: `{141: 35, 0: 25}`. With 0 closed tickets: `{0: 40}`
  over 40 runs (awk writes nothing ⇒ no SIGPIPE). The "cap keeps output under the pipe buffer so
  `--limit>0` never races" reasoning also holds (single buffered awk flush ≤ 100 rows).
- `--limit=` head syntax: measured bash rc/stdout for `0 abc "" -1 2k +3 " 3" "3 " 1e2`.
  `-1`, `2k`, `+3`, `" 3"` all rc=0 printing rows; `abc`, `""`, `"3 "`, `1e2` rc=1. TS rejects
  all non-`[0-9]+`. Real, TS is better, whitelist #4 + BDD + unit tests.
- Bad `--limit=` on an empty dir: bash rc=0 silent, TS rc=1. Real. Pinned by
  `_empty_repo_limit_problems` + a BDD scenario. (Not separately in CHANGELOG, but the CHANGELOG
  statement is unconditional so it covers it.)
- Control characters in `query`: bash emits a raw tab ⇒ invalid JSON ⇒ its own `query .id` dies
  in jq. Reproduced through real `create $'a\tb'`. Whitelist #5 + BDD + unit test.
- `|`-in-title (Phase A): unchanged, still pinned.

## 4. Mutation battery — 14 mutations of `dist/ticket.mjs`

CAUGHT by parity: `SCANNED_FILE_LIMIT`→1e9, →3, mtime tie reversed, mtime order reversed,
`full_path` first, `--limit` before filter, `isFinished`→`isClosed`, filter first-arg-wins,
control-char escaping removed, `WHOLE_NUMBER` loosened. (My first pass mis-scored four of these
as survivors because `tail -6` truncated the multi-line `graph FAIL` summary — the implementer's
claim that it closed the scan-cap and tie-break holes is CORRECT.)

GENUINE SURVIVORS (nothing anywhere catches them):
1. `if (tickets.length === 0) return 0` in `query.ts` removed → parity + BDD + unit all green,
   yet it is load-bearing (`query 'syntax((('` in an empty dir: bash 0, TS would be 3).
2. `DEFAULT_ROW_LIMIT` 20→100 → parity + BDD green; only a unit test asserts 20.
3. `mtimeNs`→`mtimeMs` → everything green; no fixture has sub-ms mtime spacing.
4. mtime tie-break → `return 0` → green (implementer disclosed this honestly; V8 stable sort
   over already byte-ordered input).

BDD alone missed 6 of 14 that parity caught — and CI runs only `make test`.

## 5. My own undeclared-divergence hunt

- **Symlinked ticket file ⇒ `closed` order differs.** GNU `ls -t` uses **lstat** for operands
  (no `-L`/`-H`), so bash sorts by the SYMLINK's mtime; TS `statSync` follows to the target.
  Measured: symlink mtime 2030 → target 2020, sibling 2025 ⇒ bash `sym1, dir1`, TS `dir1, sym1`.
  README documents symlinked ticket files as supported. Fix is one line: `lstatSync`.
- **`query <filter> | head -1` ⇒ bash 141, TS 1.** `jq.ts:13` `SIGNALLED_EXIT_CODE = 1` with a
  comment that admits bash says 128+signal. Comment-only declaration, no CHANGELOG/whitelist/test.
- Missing `jq`: verified by hand with a jq-free `PATH` — rc 127, `Error: jq: command not found` +
  hint, and the no-filter path still works. Correct, but declared only in a code comment.
- 17 hostile frontmatter fixtures × 10 `query` invocations: the ONLY diff was `title:` /
  `status:` with no `: ` separator (bash key becomes `"title:"`, value `""`). Hand-edit-only —
  `update_yaml_field`/`create` always write `": "`. Already the declared family, but
  `Frontmatter.parseLine`'s doc says "no colon" where it means "no `: `".
- Byte-identical: 13 titles through real bash `create`, nested dirs, `.hidden.md`, arrays,
  quoted array items, unquoted/half-quoted/padded/unicode titles, body `---` HRs, duplicate
  ids, legacy `done`, every `closed` filter combination, the cap boundary at index 98..101,
  `closed`/`query` on empty and missing dirs, `query --flag .id` orderings.
- `query | head -1` (no filter) rc 0, empty stderr, matches bash. `closed | head -1` rc 0.

## 6. Verdict recorded

READY. No BLOCKING. 5 SHOULD-FIX (symlink mtime, jq SIGPIPE code, unpinned empty-dir guard,
missing-jq/SIGPIPE not in CHANGELOG+whitelist, parity-not-in-CI now load-bearing) and 6 NITs.
Full text in `IMPLEMENTATION_REVIEW_PHASE_B__PUBLIC.md`.

---

# PHASE B ROUND 2 — focused verification (commits `6b9b020`, `354645a`; diff `ec89845..HEAD`)

Read-only for sources. `dist/ticket.mjs` + `dist-test/` mutated 7 times, restored from
`.tmp/rv2_dist.bak` / `.tmp/rv2_dist_test.bak`; verified **byte-identical to a fresh
`npm run build`** and `git status` clean at the end. Scratch (gitignored): `.tmp/rv2_bash_ref`,
`.tmp/rv2_ticket_bash_only`, `.tmp/rv2_pipe_band.py`, `.tmp/rv2_mutate.py`,
`.tmp/rv2_symlink_dir.py`, `.tmp/r2_*.log`.

## 1. Suites — my numbers, every claim reproduces exactly

| Command | Claimed | I measured |
|---|---|---|
| `make typecheck` | 0 | 0 |
| `make unit-test` | 251 / 0 fail | **251 tests, 42 suites, 0 fail** |
| `make test` | 208 scen / 1368 steps | **12 features, 208 scenarios, 1368 steps, 0 failed** |
| `make parity` | graph 69/0 + 7 pins, query 5, slug 13 | **identical; rc 0** (read the FULL summary lines this time, not `tail -6`) |

## 2. The size-band claim — independently re-derived, it HOLDS

`.tmp/rv2_pipe_band.py`, 20 runs per cell, `ls | head -1` via `PIPESTATUS[0]`:

```
tickets=1     bytes=31      bash={0:20}    ts={0:20}
tickets=120   bytes=3720    bash={0:20}    ts={0:20}
tickets=150   bytes=4650    bash={141:20}  ts={0:20}
tickets=400   bytes=12400   bash={141:20}  ts={0:20}
tickets=1000  bytes=31000   bash={141:20}  ts={0:20}
tickets=3000  bytes=93000   bash={141:20}  ts={141:20}
```

bash flips 0→141 between 3720 and 4650 bytes (awk's 4 KB buffer — sharper than the doc's
"~4 KB", it IS 4096). TS flips between 31000 and 93000 (the 64 KB pipe buffer). Deterministic,
not racy, in every cell. Both ends agree; the band is real and is exactly what #7 describes.
`query <filter> | head -1` is the SAME phenomenon: 3 tickets ⇒ rc 0 on BOTH sides (jq finishes
before `head` leaves); 3000 ⇒ 141 on both. So the code is right, but see the doc finding below.

141-on-EPIPE does not mask genuine write errors: the handler rethrows any non-EPIPE code.
Probed `ls >&-` (EBADF): bash rc 2, TS rc 1 — NOT 141, so the guard is not a catch-all.
`process.exitCode = Cli.run(...)` after installing the handler is safe only because `Cli.run`
is fully synchronous (`spawnSync` does not spin the loop), so the 'error' event cannot fire
before the assignment. Latent, not a bug today.

## 3. Mutation battery — 7 mutations, all caught, S3/N1/N2 no longer vacuous

| Mutation | unit | parity | BDD |
|---|---|---|---|
| `if (tickets.length === 0)` → `if (false)` | – | **FAIL** (bash 0 / ts 3 on `syntax((((`) | **1 scenario FAIL** |
| `lstatSync` → `statSync` | **fail 1** | **FAIL** (symlink check) | green |
| `.mtimeNs` → `.mtimeMs*1e6n` | **fail 1** — and it is the *sub-millisecond* suite | green | green |
| `DEFAULT_ROW_LIMIT` 20→25 | fail 1 | **FAIL** (default-limit check) | green |
| `ExitCode.BROKEN_PIPE` → 0 | – | **FAIL** (`ls \| head -1`) | green |
| `COMMAND_NOT_FOUND` 127→1 | – | – | **missing-jq scenario FAIL** |

The renamed `zzz-newer.md` fixture DOES catch `mtimeNs→mtimeMs` — the path tie-break now
contradicts the expected order, so the test can only pass for the right reason. Verified with a
clean bigint-safe mutation (my first attempt threw inside `BigInt(float)` and produced 8 bogus
BDD failures — the honest read is the second run).

## 4. lstat did not break anything else — my own differential probe

`.tmp/rv2_symlink_dir.py`, bash ref vs `dist/ticket.mjs`, rc+stdout: symlinked `_tickets/`
DIRECTORY (with the dir symlink itself stamped 2030) `closed` + `ls` SAME; plain dir SAME;
symlinked ticket file to a target outside `_tickets/` **plus a dangling symlink** `closed` +
`ls` SAME. `isFile()` still uses `statSync`, so a broken link is excluded exactly as
`find -L -type f` excludes it; `lstat` is only reached for entries already known to resolve.

## 5. Missing-jq scenario — genuinely non-vacuous, no test knob

`grep process.env src/` = only `TICKET_INVOKED_AS` (production bash→node handoff) and
`TicketsDirectory.resolve`'s injectable default. No `JQ_*`, no TEST/MOCK knob anywhere in
`src/` or `ticket`. Against `.tmp/rv2_ticket_bash_only`: **12 passed / 4 failed** in
`ticket_query.feature`, the 4 being the 3 pre-existing divergence scenarios + missing-jq, which
fails on `Install jq` while bash still gives rc **127** and `jq: command not found` — i.e. the
127 assertion is a real parity lock and the message is the only divergence. Confirmed.

## 6. Ledger + hygiene

`scripts/parity/README.md` seven = {dep cycle, missing id, `|` title, `closed --limit=`,
control chars, missing jq, broken pipe}. `docs-internal/migration-to-ts-high-level.md`
references #3–#7 with the SAME numbers. CHANGELOG carries all six user-facing ones. Consistent.
(The handoff's prose "same seven" is itself wrong — it swaps `dep cycle` for `-a`/`-T`. Docs are
fine; the sentence is not. Not worth an iteration.)

`features/` diff since `ec89845` = **0 deleted lines**; `test/` = 1 deleted line per file, both
import statements reflowed. No scenario, test or anchor point removed; no `ap_*_E` line touched.
`src/core/` still CLI-free (`grep` for console/argv/stdout/stderr/exit ⇒ none).

## 7. New this round

- **SHOULD-FIX (docs only):** `README.md` "Piping a listing into a short reader (`tk ls | head
  -1`) exits 141" is FALSE below ~64 KB of output (measured 0 on both sides at 120–1000
  tickets), and CHANGELOG's "`query <jq-filter> | head` (any short reader) now exits 141 …
  instead of 1" is likewise size-dependent (rc 0/0 at 3 tickets). The internal parity README is
  precise; the user-facing pair overstates. One conditioning clause each.
- NIT: `_path_without` builds its symlink farm in the SYSTEM temp dir and those links must be
  *executed* — the parity harness materializes its bash copy under `$REPO/.tmp` for exactly the
  noexec reason. `dir=` would remove the risk.
- NIT: `renderTickets(recent, options, limit = options.rowLimit)` — a defaulted 3rd param that
  recomputes what the only production caller already computed, present only for direct test
  calls.
- NIT: worth a WHY on `process.exitCode = Cli.run(...)` recording that it must stay after a
  synchronous run for the EPIPE handler to win.

## 8. Verdict recorded

**READY.** No BLOCKING, no NOT-FIXED, no REGRESSED. All 11 findings VERIFIED-FIXED (S5 as the
agreed ticket update). Acceptance genuinely met. Full text in
`IMPLEMENTATION_REVIEW_PHASE_B_ROUND2__PUBLIC.md`.
