# IMPLEMENTATION_WITH_SELF_PLAN — PUBLIC (Phase A of ticket nid_zesi8c4t7lyw6jgmqqsjqd54k_e)

Scope delivered: `ls`/`list`, `ready`, `blocked` are served by the TypeScript bundle.
`closed` and `query` were deliberately left to Phase B and are untouched.

`TS_COMMANDS` in `./ticket` is now `"help --help -h ls list ready blocked"`.
`list` had to be flipped with `ls` — it is the alias in bash's `ls|list)` case arm.

## Results (exact numbers)

| Check | Before | After |
|---|---|---|
| `make test` (BDD) | 180 scenarios, 0 failed | **190 scenarios, 0 failed** (1260 steps) |
| `make unit-test` | 163 tests | **202 tests, 0 failed** |
| `make parity` | graph 68 scenarios / 0 failures | **68 scenarios / 0 failures**, query OK, slug OK |
| `make typecheck` | clean | clean |

The global memory note "9 plugin tests fail on this machine (/dev/shm noexec)" does **not**
apply to this repo — there are no plugin tests and the pre-change baseline was fully green.
Verified rather than assumed. (/dev/shm noexec *is* real and did bite the parity harness; see below.)

Non-vacuity was verified, not asserted:
- Rolling `TS_COMMANDS` back to bash makes **exactly the 7 behavior-change scenarios fail** and
  nothing else.
- Changing `ID_COLUMN_WIDTH` from 8 to 9 makes `make parity` report 787 mismatches.

## Files touched

New (`src/cli/`):
- `src/cli/list-options.ts` — `ListOptions.parse`, the flag union
- `src/cli/ticket-filter.ts` — `TicketFilter` matching + `ignoringStatus()`
- `src/cli/ticket-row.ts` — `TicketRow`, the bash `printf` row formats
- `src/cli/store-resolver.ts` — `StoreResolver.forReadCommand()`
- `src/cli/cli-error.ts` — `CliError`
- `src/cli/commands/ls.ts`, `src/cli/commands/ready.ts`, `src/cli/commands/blocked.ts`
- `test/list-commands.test.ts` — 39 node:test cases

Modified:
- `src/cli/main.ts` — dispatch for the three commands, shared `read()` helper, central error rendering
- `ticket` — `TS_COMMANDS` only; no other line changed
- `features/ticket_listing.feature` — 10 new scenarios
- `features/steps/ticket_steps.py` — 2 new steps (see below)
- `scripts/parity/harness.py`, `scripts/parity/check_graph.py`, `scripts/parity/dump.ts`,
  `scripts/parity/README.md`, `Makefile` — harness correctness (see below)
- `CHANGELOG.md`, `CLAUDE.md`

Two commits on the current branch: `36e8704`, `c27e3af`. Tree clean.

## Shared abstractions available to Phase B (`closed`, `query`)

- **`ListOptions.parse(args)`** already parses the union of `--status=`, `-a`, `--assignee=`,
  `-T`, `--tag=` **and `--limit=`**. `closed` needs no parsing work: read `options.limitText`
  (raw string, empty when absent — bash `limit` defaults to 20, apply that default in the command)
  and `options.filterIgnoringStatus`.
  - **Use `filterIgnoringStatus`, not `filter`, in `closed`.** Only `ls` honors `--status`;
    `ready`/`blocked`/`closed` fix the status themselves and bash silently ignores a
    `--status=` given to them. My unit test caught me getting this wrong; the parity
    invocations now include `ready --status=closed` / `blocked --status=closed` to keep it caught.
- **`TicketRow.withStatus(ticket)`** is exactly the `closed` row (`%-8s [%s] - %s`, no priority,
  no deps). `TicketRow.text(rows)` turns rows into output with one trailing newline each.
  Do not trim: an empty title legitimately leaves a trailing space.
- **`StoreResolver.forReadCommand()`** gives a `TicketStore` or the bash-identical stderr lines
  for "not inside a git repository" / "tickets directory '<path>' does not exist".
- **`CliError`** + `main.ts`'s catch renders any thrown `CliError` or core `MissingTicketIdError`
  as `Error: <message>` with exit 1. Throw, do not print.
- **`Cli.read(args, body)`** in `main.ts` is the read-command skeleton; the callback receives the
  `TicketStore` (not a ticket list) precisely so `closed` can reach for file mtimes.
- `query` needs `hasFrontmatterFields` gating + `toJsonRecord()` (already in core) and spawns
  external `jq`; it will likely want its own dispatch arm rather than `Cli.read`.

## Decisions affecting other roles

1. **`closed` must NOT reuse `Cli.read`'s "load everything" shape blindly** — bash caps the
   mtime scan at the 100 most recently modified files *before* parsing, then applies `--limit`
   after filtering. Order matters for parity.
2. **`-a`/`-T` without a value now errors** (`Error: option '-a' requires a value`, exit 1)
   instead of bash's `set -u` crash (`$2: unbound variable`, also exit 1). Exit code preserved,
   message made reproducible. Phase B inherits this for free via `ListOptions`.
3. **Missing-`id` files now fail the whole command** (`Error: <path> has no 'id' frontmatter
   field`, exit 1, no stdout at all) for `ls`/`ready`/`blocked`. Pre-approved by ticket
   `nid_n6eavbm0h77twvna8k9nnpu2g_e`. `query` will flip the last of the parity whitelist when
   Phase B lands, and `scripts/parity/check_query.py`'s whitelist note should be revisited then.
4. **The parity harness had a latent hole and now does not.** `harness.py` used to run
   `./ticket`, which `exec`s the TS bundle for anything in `TS_COMMANDS` — so the differential
   check would have quietly compared TS against TS from the first flip. It now runs a copy of
   the script with `TS_COMMANDS` emptied (`BashReference`), materialized under `$REPO/.tmp`
   because this machine's temp dir (`/dev/shm`) is `noexec`. `ready`/`blocked` are compared
   against the shipped CLI instead of `dump.mjs`, `ls` plus every filter flag joined the diff,
   and the now-duplicated row formats were deleted from `dump.ts`. Rule going forward:
   **when you port a command, delete its `dump.ts` mode and point its check at the CLI.**
5. **`make parity` now depends on `make build`.** It was diffing against whatever stale
   `dist/ticket.mjs` happened to exist — it reported 101 false failures at me for that reason.
6. **New BDD step vocabulary** (reusable): `Given a raw ticket file "<name>" exists with content`
   + docstring (writes a file under `_tickets/` verbatim, for shapes `create` cannot produce),
   and `Then stderr should contain "<text>"` (the existing `output should contain` step merges
   stdout and stderr, so it cannot prove a message went to stderr).

## Deferred / open

- `closed` and `query` — Phase B, by design.
- **Follow-up ticket created: `nid_94f11043dhpk198dj9e6gr6pn_e`** — CI (`.github/workflows/test.yml`)
  runs only `make test`, so `make parity` is verified only when a human remembers. Given the
  harness is the *only* guard on byte-parity, it belongs in CI until T6 deletes it.
- Accepted, documented divergences on hand-edited-only frontmatter shapes: bash reads
  `status`/`assignee`/`priority`/`id` as awk `$2` with `FS=": "`, so it keeps trailing spaces
  and truncates a value containing `": "`; the core trims and splits at the first colon.
  Unreachable through `create`; the core's behavior is the saner one. Full reasoning in the
  PRIVATE file.
