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
