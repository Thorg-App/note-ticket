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
