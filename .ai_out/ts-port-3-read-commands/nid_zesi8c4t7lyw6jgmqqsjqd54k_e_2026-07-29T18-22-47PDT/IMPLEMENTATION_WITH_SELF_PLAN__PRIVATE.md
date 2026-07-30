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
