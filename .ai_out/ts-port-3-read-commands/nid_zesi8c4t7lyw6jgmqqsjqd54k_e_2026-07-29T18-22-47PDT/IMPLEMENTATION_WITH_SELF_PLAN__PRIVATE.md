# IMPLEMENTATION_WITH_SELF_PLAN — PRIVATE memory (Phase A: ls / ready / blocked)

Ticket: `nid_zesi8c4t7lyw6jgmqqsjqd54k_e` (T3 read commands). Phase A = `ls`, `ready`, `blocked` only.
Phase B (separate agent) = `closed`, `query`.

## Plan

**Goal**: serve `ls`, `ready`, `blocked` from the TS bundle with byte-identical output to bash.

**Steps**
1. Read bash `cmd_ls` / `cmd_ready` / `cmd_blocked` line by line; probe edge cases against `./ticket`. DONE
2. Build CLI-layer abstractions (`TicketFilter`, `ListOptions`, `TicketRow`, `StoreResolver`, `CliError`). DONE
3. Command classes `src/cli/commands/{ls,ready,blocked}.ts`, pure `render(tickets, options)`. DONE
4. Wire `main.ts` dispatch + central error rendering. DONE
5. Fix the parity harness so bash stays the reference after the flip (see below). DONE
6. Flip `ls`, then `ready`, then `blocked` into `TS_COMMANDS`, `make test` after each. DONE
7. Unit tests (`test/*.test.ts`), BDD scenarios, CHANGELOG/README. DONE

**Testing**: node:test unit tests for `ListOptions`/`TicketFilter`/`TicketRow`/command render; BDD for
missing-`id` (3 variants) and the `-a`-without-value error; `make parity` for byte-level graph parity.

## Bash contract, as verified empirically (probe repo in `.tmp/probe`)

Baseline before any change: `make test` = **180 scenarios passed, 0 failed** (12 features).
NOTE: the global memory claim "9 plugin tests fail due to /dev/shm noexec" does NOT apply to this repo —
there are no plugin tests here and the baseline is fully green. Verified, not assumed.

### Formats (bash `printf`)
- `ls`:      `printf "%-8s [%s] - %s%s\n"` → `aa1      [open] - Alpha <- [bb2, zz9]`
- `ready`:   `printf "%-8s [P%s][%s] - %s\n"` → `cc3      [P2][in_progress] - Gamma`
- `blocked`: `printf "%-8s [P%s][%s] - %s <- %s\n"` where the last field is already `[b1, b2]`
- `closed` (Phase B): `printf "%-8s [%s] - %s"` (no priority, no deps), rows collected then `| head -n limit`
- `%-8s` = pad-to-min-8, never truncates (`verylongidentifier9 [open] - Long` confirmed).
- Empty title ⇒ **trailing space** (`dd4      [open] - `). `TicketRow` must not trim.
- `ls` dep suffix is omitted entirely when `deps` is empty/absent (not `<- []`).

### Selection / ordering
- `ls`: every ticket, **path order** (`_collect_ticket_files`, `LC_ALL=C sort`), no dedup by id.
- `ready`/`blocked`: keyed by id in an awk map (duplicate id ⇒ last file in path order wins), then
  bubble-sorted by priority, then id. Priority compare is awk strnum: numeric when both look numeric —
  verified `P2` sorts BEFORE `P10`. `src/core/dep-graph.ts:TicketOrder` already implements exactly this.
- Missing `priority` ⇒ `2` (`DEFAULT_PRIORITY` in core).
- Active = `status == open || in_progress` (NOT `done`). Unknown/dangling dep id counts as not-closed ⇒ blocks.
- `blocked` prints only the not-closed deps, in `deps` order.

### Flags
- `ls`: `--status=X`, `-a X`, `--assignee=X`, `-T X`, `--tag=X`; everything else silently skipped (`*) shift`).
- `ready`/`blocked`: same minus `--status=` — `ready --status=zzz` is silently IGNORED (verified).
- `closed`: same minus `--status=`, plus `--limit=N` (default 20).
- WHY one shared union parser is safe: every one of the four commands consumes `-a`/`-T` values the same
  way and silently ignores unknown args, so parsing the union of flags and having each command read only
  its own fields is observationally identical to bash's four separate loops. Verified: `ls --limit=1`
  ignores the limit; `ready --status=zzz` ignores the status.
- Empty filter value matches everything (bash `filter == ""` guard).

### Tickets dir
- `init_tickets_dir` for read commands: no git repo ⇒ 2 stderr lines
  (`Error: not inside a git repository`, `Run inside a git repo, or set TICKETS_DIR env var`), exit 1.
- dir missing ⇒ `Error: tickets directory '<path>' does not exist`, exit 1 (single-quoted path).
- dir exists but empty ⇒ exit 0, no output (verified for `ls` and `ready`).
- Empty `TICKETS_DIR=` behaves as unset in both implementations.

## Deliberate divergences (documented, each with a reason)

1. **Missing `id`** — bash silently skips such a file (verified: all 3 variants ⇒ exit 0, no output).
   TS fails with `Error: <path> has no 'id' frontmatter field`, exit 1, and prints NO stdout at all.
   Pre-approved by ticket `nid_n6eavbm0h77twvna8k9nnpu2g_e` + `src/core/id.ts` doc comment.
2. **`-a` / `-T` with no value** — bash dies with `./ticket: line 790: $2: unbound variable` (exit 1,
   `set -u`). That message embeds a bash line number and is unreproducible, so TS keeps the exit code and
   prints `Error: option '-a' requires a value`. Rejected alternative: treating the missing value as an
   empty filter — that turns a typo into a silent full listing.
3. **Whitespace/`": "`-inside-value parsing.** bash reads `status`/`assignee`/`priority`/`id` as awk `$2`
   with `FS=": "`, so `status: open ` keeps the trailing space and `assignee: a: b` truncates to `a`.
   The core trims and splits at the FIRST colon. Only reachable by hand-editing a file into a shape
   `create` never writes; the core's behavior is strictly saner. Not worth bash-bug-compatibility.
   Same class of thing for `deps`/`tags`: bash `gsub(/[\[\] ]/,"")` deletes spaces INSIDE an item, the
   core only trims around items (ids are `[a-z0-9]`, so unreachable).

## Parity harness: the trap I had to fix

`scripts/parity/harness.py` ran `repo.bash("ready")` via `./ticket`. The moment `ready` lands in
`TS_COMMANDS`, that call `exec`s the TS bundle and the "differential" check silently compares **TS against
TS** — a harness that can no longer fail. Fix: `harness.py` now runs a *pinned bash copy* of `./ticket`
with the `TS_COMMANDS=` line neutralized (`BashReference`, built once into a temp dir per process). Same
trick as the `ZZPROGNAMEZZ` copy used to generate `help.ts`; zero production-code change.

Second change: the TS side of the `ready`/`blocked` comparison is now the **real CLI**
(`node dist/ticket.mjs`), not `dist-parity/dump.mjs`, and `ls` (plus `--status`/`-a`/`-T` variants) was
added. That deleted the duplicated row-format strings from `dump.ts` (they existed only because the CLI
had no `ready`/`blocked` yet). `dump.ts` keeps `tree`/`cycle`/`query`/`slug`, which the CLI still lacks.

## The divergence my own unit test caught (read this before trusting a shared parser)

I reasoned that one parser for the union of the four flag sets was observationally identical to
bash's four loops. That is true of *consumption* but NOT of *use*: bash `cmd_ready` and
`cmd_blocked` have no `--status=` arm at all, so `ready --status=closed` must IGNORE the status.
My shared `TicketFilter` applied it. The unit test `"ignores --status, as bash does"` failed and
exposed it; `make parity` did not, because the generated invocations had no `--status` on
`ready`/`blocked`. Fixes:
- `TicketFilter.ignoringStatus()` + `ListOptions.filterIgnoringStatus`, used by ready/blocked
  (and by `closed` in Phase B — `closed` fixes its status to closed|done).
- `["ready", "--status=closed"]` and `["blocked", "--status=closed"]` added to
  `check_graph.CLI_INVOCATIONS`, with a comment saying what they exist to catch.

Second harness bug found the same way: `make parity` did not depend on `make build`, so it
diffed a stale `dist/ticket.mjs` and reported 101 failures for code I had already fixed.
Makefile now has `parity: build`.

## Rejected approaches

- Adding an env override for `TS_COMMANDS` in `./ticket` so the harness could disable it: production code
  gaining a test-only knob. The sed'd copy achieves the same with no shipped surface.
- Keeping `ready`/`blocked` rendering in `dump.ts`: duplicated the padding/bracket knowledge in two
  places, exactly the DRY violation the port is supposed to remove.
- One `list-commands.ts` holding all three commands: the architecture doc pins `commands/<cmd>.ts`.
- Passing `readonly Ticket[]` into the dispatch callback: `closed` (Phase B) needs mtimes, so the callback
  takes the `TicketStore` and each command decides what it needs. Commands themselves stay pure.

## Current state

Complete. `make test` green, `make parity` green, `make typecheck` clean, tree committed.
`TS_COMMANDS="help --help -h ls list ready blocked"`. Note `list` had to be flipped alongside `ls`
(it is the alias in bash's `ls|list)` case).

---

# ITERATION round 1 (review response) — commits `f165d98`, `736fd10`

Review: `IMPLEMENTATION_REVIEW__PUBLIC.md`, verdict READY, no BLOCKING. Dispositions in
`IMPLEMENTATION_ITERATION__PUBLIC.md`. What matters for a successor:

## Divergence #4 (NEW, declared): `|` in a title, `ready`/`blocked` only

Reproduced against the pinned bash copy: title `Pipe|Title`, deps `[bbb2]`
→ bash `ready` prints `Plain ` (truncated), bash `blocked` prints
`aaa1 [P1][open] - Pipe <- Title` — the title tail sits where the blockers belong.
Cause: `ticket:905` / `ticket:1068` `sprintf("%s|%s|%s|%s", prio, id, status, title)` then
`split(output[i], a, "|")`. `ls` does NOT pack a sort key and is unaffected (verified identical).
TS is correct. Now pinned in FOUR places so it cannot be "fixed back":
unit tests (`test/list-commands.test.ts`, describe `a title containing the sort-key separator '|'`),
2 BDD scenarios, `check_graph._check_pipe_title_divergence`, whitelist #3 in `scripts/parity/README.md`.

## What else I probed empirically (so you do not have to)

Ran every hostile title through real bash `create` and diffed bash-vs-TS `ls`/`ready`:
`Fix: the thing`, `say "hi"`, `back\slash`, `unicode ünïcødé`, `has [brackets]`, `trail ` — ALL
byte-identical. So the predecessor's divergence #3 (`": "` truncation) is NOT reachable via
`create` for `title`; bash reads the title with a different extraction than `FS=": "` `$2`.
`|` is the only title metacharacter that diverges.

## Parity fixture: hostile titles, and why `|` is excluded from them

`harness.HOSTILE_TITLES` (cycled per ticket, written exactly as bash `create` writes them, i.e.
quotes as `\"`) closed the blind spot that let #1 through a green run. `|` deliberately stays out:
putting it in the generator would make the ready/blocked byte-compare fail on a divergence we
WANT, so it is pinned separately instead. `write_scenario(scenario, title_template=…)` is how the
pipe check pins one title.

Mutation-tested both new protections (each restored afterwards; `.tmp/ticket.mjs.bak`):
- title-unescaping mutation in the `ls` row → **207** graph byte failures (would have been 0 with
  the old `T <id>` titles).
- truncate-title-at-`|` mutation in the `ready`/`blocked` row → byte failures **0**, and ONLY
  `_check_pipe_title_divergence` fires. Exactly the regression class it exists for.
- The 2 new BDD scenarios fail (2 failed / 29 skipped) against `TICKET_SCRIPT=.tmp/ticket-bash-only`.

## One error channel (finding #3)

`CliError(message, detailLines)` owns `stderrText` — the ONLY place that adds `Error: `. Detail
lines are printed WITHOUT the prefix because bash's second line
(`Run inside a git repo, or set TICKETS_DIR env var`) has no prefix. `StoreResolver.forReadCommand()`
now returns `TicketStore` and throws; `StoreResolution` is gone; `Cli.read` is 3 lines.
`MissingTicketIdError` (core, CLI-free) is adopted into a `CliError` in `Cli.userFacingFailure`.
Phase B / T4 / T5: throw `CliError`, never print `Error:` yourself.

## Deliberately NOT done

- `limitText` kept although unused until `closed` lands — Phase B is next up, deleting and
  re-adding it is churn. Delete it if Phase B is abandoned.
- CRLF handling: follow-up ticket `nid_z10hpj927zqilxcpl9ycpe0ad_e` (tags `ts-port, core, decide`,
  deps on this T3 ticket). Verified: bash lists nothing/exit 0, TS says
  `has no 'id' frontmatter field` on a file containing `id: aaa1`. Root cause is
  `src/core/frontmatter.ts` not tolerating a trailing `\r`. Left out of scope on purpose.

## Final numbers (my own runs)

`make typecheck` exit 0 · `make unit-test` 207 pass / 0 fail · `make test` 12 features,
192 scenarios, 1272 steps, 0 failed · `make parity` graph 68/0, query OK, slug OK.

---

# PHASE B (closed / query) — plan and bash contract

**Goal**: serve `closed` and `query` from the TS bundle, reusing Phase A's abstractions.

**Steps**
1. Probe bash `cmd_closed` / `cmd_query` / `_file_to_jsonl` empirically (DONE — see below).
2. `src/core`: `TicketStore.loadRecent(maxFiles)` (mtime desc), `Ticket.isFinished`, `Ticket.toJsonText()`.
3. `src/cli`: `RowLimit`, `Jq`, `commands/closed.ts`, `commands/query.ts`; `ListOptions.limitText`
   becomes `string | undefined` so `--limit=` is distinguishable from absent.
4. Flip `closed`, then `query`, into `TS_COMMANDS`; `make test` after each.
5. Extend the parity harness: `closed` invocations (with fixed mtimes), `query` via the real CLI,
   delete `dump.ts`'s `query` mode, pin the new divergences.
6. Unit + BDD tests, mutation-test the guards, docs.

## Bash contract for `closed` / `query`, as verified empirically (probes in `.tmp/probe_*.py`)

Baseline before Phase B: `make test` 192 scenarios / 0 failed, `make unit-test` 207, `make parity` green.

### `cmd_closed` (ticket:928)
- Args: `--limit=*`, `-a X`, `--assignee=*`, `-T X`, `--tag=*`; `*) shift`. **No `--status` arm**, so
  `closed --status=open` IGNORES it (verified) — same as `ready`/`blocked`, hence `filterIgnoringStatus`.
- `ls -t "${TICKET_FILES[@]}" | head -n 100` → mtime desc, **cap on FILES, before filtering**. Verified
  with 120 files whose 3 closed ones were oldest: bash prints NOTHING. `--limit` cannot bring them back.
- Row: `printf "%-8s [%s] - %s"` = `TicketRow.withStatus`. No priority (the ticket text's "missing
  priority defaults to 2" does not apply — `closed` never prints a priority). No dedup by id.
- Status set is `closed || done`. `ready`'s dep resolution compares `!= "closed"` only, so `done`
  BLOCKS. Two different notions ⇒ `Ticket.isFinished` next to `Ticket.isClosed`.
- `title` is read as `substr($0, 8)`, not awk `$2`, so `|` and `": "` in a title are safe here.
- Equal mtimes: `ls -t` falls back to the file NAME (`cmp_name`, `strcoll`). Verified `Zed < aaa < bbb`.
  ⇒ nanosecond mtime (`statSync(p, {bigint:true}).mtimeNs`; `mtimeMs` is too coarse) + byte-wise path tie-break.
- `--limit` is `head -n "$limit"`, hence: `0` ⇒ **rc 0 OR 141, RACY** (measured flipping on identical
  input: `head` exits without reading, and under `pipefail` bash reports awk's SIGPIPE only if awk's
  write loses the race; the 100-row cap keeps output under the pipe buffer so limit>0 never races);
  `-1` ⇒ all but the last; `2k` ⇒ 2048; `abc`/`` ⇒ rc 1 `head: invalid number of lines`.
  With an EMPTY tickets dir bash returns before `head` runs, so a typo'd limit exits 0 there.

### `cmd_query` (ticket:1486) and `_file_to_jsonl` (ticket:219)
- `filter="$1"` for EVERY arg ⇒ **last arg wins**, nothing is a flag. `query --x .id` filters on `.id`.
- Empty tickets dir ⇒ `return 0` BEFORE jq, so even `query 'syntax((('` exits 0. Reproduced in TS.
- `jq -c "select($filter)"`: syntax error rc 3, unmatched filter rc 0 + no output, missing jq rc 127.
- Serializer divergences (bash vs `JSON.stringify(toJsonRecord())`), all with TS the correct side:
  1. **control chars emitted raw** ⇒ invalid JSON; `tk create $'tab\there'` reaches it and bash's own
     `query .id` then dies with jq rc 4 `Invalid string: control characters ... must be escaped`. PINNED.
  2. duplicate key ⇒ bash emits both pairs, TS collapses (hand-edit only).
  3. letter-initial line with no colon ⇒ bash key with `""`, TS skips.
  4. `deps: [x, , y]` ⇒ bash `["x",,"y"]` (invalid JSON), TS drops the empty item.
  5. `foo:bar` (no space) ⇒ bash key `foo:bar`; `status:` ⇒ bash key `status:`. TS splits at the colon.
  Byte-identical on: trailing spaces, `"a: b"`, quoted array items, backslashes, blank/indented lines.

## Divergences declared this phase (each pinned in code + parity + CHANGELOG)

5. `closed --limit=` takes a plain decimal count only; bash inherited `head -n`'s syntax and its racy
   exit code for 0, and ignored a typo entirely when the tickets dir was empty. `RowLimit`.
6. `query` escapes control characters (valid JSON), bash did not. `Ticket.toJsonText`.
7. Missing `jq`: exit 127 kept, message replaced (bash printed the shell's `line NNN: jq: command not
   found`). `Jq.unusable`. NOT covered by an automated test — see "deliberately not done".

## Mutation testing: three of seven mutations SURVIVED the first run

Method: patch `dist/ticket.mjs`, run `scripts/parity/run.py`, restore (`.tmp/mutate.py`).
Caught first time: path-order-instead-of-mtime (22 byte failures), limit-applied-before-filter (115),
closed-honours-`--status` (39), control-chars-emitted-raw (query check).
**Survived, i.e. real vacuity holes I then closed:**
- `SCANNED_FILE_LIMIT = 1e9` — no fixture had >100 files. Added `_check_closed_scan_cap` (120 files,
  the closed ones oldest, and it FAILS if bash starts printing rows, so the fixture cannot go stale).
- `isFinished` reduced to `isClosed` — no fixture had `status: done`. Added the `legacy-done`
  FIXED_SCENARIO (a `done` ticket that also blocks a dependent, so it pins both notions at once).
- tie-break `return 0` — V8's sort is stable and `collectFiles` is already byte-ordered, so REMOVING
  the tie-break is unobservable. Kept the explicit comparator anyway (relying on sort stability plus an
  upstream ordering for a contractual output order is exactly the hidden coupling that breaks later)
  and proved it observable with a WRONG tie-break (`-PathOrder.compare`) instead: caught.
All three re-mutations now fail the harness.

## Deliberately not done

- No unit test for `Jq` — it would have to spawn or fake the binary, and BDD already exercises the
  real jq path (filter, syntax error). The missing-`jq` branch (exit 127) is therefore covered by
  reading only; bash's behavior was measured by patching the script to call a nonexistent binary.
- `check_query`'s missing-id whitelist entry stays: `query` now hard-fails on a file with no `id`, so
  Phase A's note "query will flip the last of the parity whitelist" was wrong — the entry is still
  needed, it is just now about the shipped CLI rather than `dump.mjs`.
- The ticket is left OPEN for the orchestrator to close (git history shows the flow does that).

---

# ITERATION round 2 (Phase B review response) — commit `6b9b020`

Review: `IMPLEMENTATION_REVIEW_PHASE_B__PUBLIC.md`, verdict READY, no BLOCKING. All 11
findings (5 SHOULD-FIX + 6 NIT) INCORPORATED; two adapted, and one reviewer claim corrected.
Dispositions in `IMPLEMENTATION_ITERATION_PHASE_B__PUBLIC.md`. What a successor must know:

## The SIGPIPE family is WIDER than the review said — and only half of it is honourable

The reviewer flagged `query <filter> | head -1` (bash 141, TS 1). I measured the whole family
and found `ls | head -1` diverges too (bash 141, TS 0), which nobody had noticed. Then I
measured WHY, and the two halves need opposite treatment:

- **jq case — exact parity, fixed.** jq is a real child killed by a real signal.
  `spawnSync` reports **BOTH** `signal: "SIGPIPE"` **and** `error: EPIPE` for that death (the
  EPIPE is our own failed write to a corpse). The old code checked `error` FIRST, so every
  `query <filter> | head` became `Error: jq could not be run`, exit 1. Order is now
  status → signal → error. If you ever touch `Jq.select`, keep that order.
- **our-own-stdout case — declared, NOT honourable.** bash's code there is a function of
  OUTPUT SIZE, not of the command: awk writes in ~4 KB chunks and dies as soon as `head`
  exits. Measured with `ls | head -1`: 2 / 50 / 120 tickets ⇒ bash 0; 200 / 400 ⇒ bash 141,
  TS 0; 3000 ⇒ both 141 (node fails only past the 64 KB pipe buffer). Matching bash in the
  4 KB–64 KB band would mean reproducing awk's internal write chunking. So `BrokenPipe`
  reports 141 on EPIPE (Unix convention, matches bash at both ends, and replaces node's
  accidental unhandled-error 1 for >64 KB), and the band is whitelist #7.

WHY-NOT swallowing EPIPE into a deterministic 0: it matches bash NOWHERE above 4 KB and is
not what any other tool does.

## The vacuous test I wrote, and how it was caught

My first N1 test (nanosecond mtime) SURVIVED the `mtimeNs → mtimeMs` mutation: the two files
were 250 µs apart, but I had named the newer one `aaa-newer.md`, so when ms-truncation made
them a tie the path tie-break put it first anyway — the expected order by accident. Fixed by
naming the newer file `zzz-newer.md`, so the tie-break disagrees with the truth. Lesson for
any recency test in this repo: the path order MUST contradict the expected order, or the
tie-break silently supplies the right answer.
(`utimesSync` with fractional seconds does reach nanosecond resolution — measured
1700000000000250101n vs 1700000000000499963n — so no `touch -d` shell-out is needed.)

## Mutation battery: 9 mutations, 9 caught, 0 survivors

lstat→stat (parity AND unit), mtimeNs→mtimeMs (unit), jq signal→FAILURE (parity),
BrokenPipe handler removed (parity), `tickets.length === 0` → `if (false)` (parity AND BDD),
default limit 20→25 (parity), limit parsed after the store read (unit).
Method: mutate SOURCE (not the bundle) and let `make parity`/`make test` rebuild the mutant —
simpler than patching `dist/ticket.mjs` and immune to a stale bundle.
**TRAP:** `timeout N python3 .tmp/mutate_round3.py` killed the script mid-mutation and left
`src/cli/commands/query.ts` mutated on disk (the `finally` never ran). Always `git diff src/`
after a mutation run; batch the mutations so each batch fits the timeout.

## Testing a missing external binary without a test-only knob

The missing-`jq` branch is now BDD-covered by `_path_without("jq")`: a scratch dir with a
symlink to every executable on the real PATH except `jq` (~1840 links, ~100 ms). WHY the farm
and not dropping PATH entries: jq shares `/usr/bin` with awk/sed/find/git/node, which the bash
script needs. WHY-NOT an env var naming the binary: a test-only knob in shipped code (same
reason the parity harness uses a sed'd copy of `ticket`).
Verified non-vacuous: against `TICKET_SCRIPT=.tmp/ticket-bash-only` the scenario fails on
`Install jq` while still matching bash's rc 127 and `jq: command not found` — i.e. the divergence
really is the message alone.

## Where I disagreed with the reviewer

- **N5 was called "imprecise"; the existing sentence was actually CORRECT.** Measured: a
  colon-less line `nocolon` does become bash key `"nocolon":""`. The reviewer's `title:` case is
  a SECOND shape (bash key `"title:"`), not a correction of the first. The note now lists both.
- **S2 was framed as jq-only.** It is not; see above.

## Design notes worth keeping

- `ListOptions.rowLimit` parses on ACCESS, deliberately. Eager validation in `ListOptions.parse`
  would make `ls --limit=abc` fail, where bash lists happily (no `--limit` arm in those loops).
  `ClosedCommand.renderTickets`'s third parameter defaults to `options.rowLimit` so the 8
  existing call sites stay 2-arg and the knowledge stays in one place.
- `ExitCode.BROKEN_PIPE` is `SIGNALLED_BASE + os.constants.signals.SIGPIPE`, not a literal 141.

## Still open / deliberately not done

- CI does not run `make parity` (`nid_94f11043dhpk198dj9e6gr6pn_e`, now **P1**, with a note
  listing the 6-of-14 mutations that `make test` cannot see). Out of scope here by instruction.
- CRLF follow-up `nid_z10hpj927zqilxcpl9ycpe0ad_e` untouched.
- No unit test for `Jq` itself (it would have to spawn or fake the binary); BDD now covers both
  the real-jq and the no-jq paths, which is strictly more than before.
- T3 ticket left OPEN and no `change_log` entry: the orchestrator owns both.

## Final numbers (my own runs, after `6b9b020`)

`make typecheck` 0 · `make unit-test` **251 tests / 42 suites / 0 fail** (was 245) ·
`make test` **12 features, 208 scenarios, 1368 steps, 0 failed** (was 205) ·
`make parity` graph **69 / 0** with **7** pinned checks OK, query OK (5 checks incl. 2 new),
slug OK 13.
