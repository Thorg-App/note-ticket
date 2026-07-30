# Migration to TypeScript — High-Level Plan

Port `ticket` (single-file bash + awk, ~1600 lines) to a TypeScript CLI running on
pre-installed Node.js, keeping the exact same CLI interface.

## Why (motivation)

- The bash+awk implementation is unreadable/unmaintainable for the owner.
- A graph visualization is planned; it must share the **same data-model layer**
  as the CLI (parse tickets, dep graph, ready/blocked computation) instead of
  duplicating that knowledge (DRY).

Judgement: the migration makes sense. The awk programs (dep tree, cycle detection,
JSONL emission) are the highest-complexity, least-readable parts, and they are exactly
the logic the visualization needs. A typed core library serves both consumers.

## Non-negotiable constraints

1. **BDD suite is the harness.** All `features/*.feature` scenarios stay as-is and
   must pass throughout the migration. Adjusting a test is allowed only when it
   provably masks a bug (call it out explicitly).
2. **Same CLI interface.** Commands, flags, output formats, exit codes, stderr
   messages are the contract. The BDD suite encodes most of it; where it doesn't,
   match the bash behavior.
3. **Node pre-installed, not bundled.** The artifact is plain JS with a
   `#!/usr/bin/env node` shebang. No pkg/nexe/SEA binaries.
4. **Incremental.** The port is split so parts of `ticket` are offloaded to TS
   command-by-command while the BDD suite stays green.

## Strategy: strangler-fig via the bash dispatcher

The bash `ticket` script keeps its main `case` dispatch and gains one delegation
block: commands listed in a `TS_COMMANDS` variable are `exec`'d to
`node "$SCRIPT_DIR/dist/ticket.mjs" "$@"`. Everything else stays bash.

- BDD tests keep invoking `./ticket` (steps already support `TICKET_SCRIPT` env
  override in `features/steps/ticket_steps.py:get_ticket_script`) — they stay green
  the whole time and don't know which language serves each command.
- Porting a command = implement in TS → add its name to `TS_COMMANDS` → `make test`
  green → commit. Instant rollback: remove the name from the list.
- Cutover = when `TS_COMMANDS` covers everything, replace `ticket` with the Node
  entrypoint and delete the bash implementation.

## Target architecture

```
src/
  core/                     # data-model layer — shared by CLI and future visualization
    ticket.ts               # Ticket type: frontmatter fields + body + path
    frontmatter.ts          # parse/serialize YAML-subset frontmatter (line-based)
    ticket-store.ts         # discovery (_collect_ticket_files semantics) + load/save
    id.ts                   # generate_id, partial-ID resolution (exact > partial, ambiguity errors)
    slug.ts                 # title_to_filename + collision handling
    dep-graph.ts            # graph build, ready/blocked, tree layout, cycle detection
  cli/
    main.ts                 # dispatch (mirrors bash case), tickets-dir resolution
    commands/<cmd>.ts       # one thin handler per command: parse args, call core, format
dist/ticket.mjs             # esbuild single-file bundle, #!/usr/bin/env node
```

Design rules:

- **core/ has zero CLI knowledge** (no process.argv, no console formatting).
  The visualization imports core/ only.
- **Hand-rolled frontmatter parser**, not js-yaml. WHY-NOT a YAML library: the bash
  implementation is line-based over a constrained subset (`key: value`, inline
  `[a, b]` arrays, double-quoted titles); a real YAML parser has different
  edge-case behavior and would silently change the on-disk contract the BDD suite
  pins. The subset parser is ~100 lines and byte-for-byte compatible.
- **Zero runtime npm dependencies** for the CLI (Node stdlib suffices).
  `jq` remains an external tool for `query [jq-filter]` (interface parity);
  `git` remains required for repo-root resolution.
- TypeScript: simple syntax, strict mode, esbuild for bundling, `vitest` (or
  `node:test`) for core unit tests. BDD remains the acceptance harness; unit tests
  cover core algorithms (graph, parser) where bash had none.

## Behavioral parity checklist (beyond what BDD pins)

`make parity` (see `scripts/parity/README.md`) diffs bash `./ticket` against the TS
core over generated ticket graphs and covers the graph/JSONL/slug items below
empirically. Since T5 phase A it also diffs the WRITE commands (`check_write.py`): the same
command sequence on two identical fresh repos, comparing the transcript plus every byte under
`_tickets/` (and whether each entry is still a symlink), with ids and timestamps neutralised.
As of T5 phase C that covers every write command, `add-note` and `edit` included. It runs in CI (`.github/workflows/test.yml`) alongside `make test`, because 6 of
the 14 mutations it catches are invisible to the BDD suite. Delete both the harness and that CI
step at T6 with bash.

Verify these while porting — they are contractual even where scenarios are thin:

- Tickets dir: `TICKETS_DIR` env override, else `git rev-parse --show-toplevel` +
  `/_tickets`; read commands error when dir missing, `create` mkdir -p's it.
- Discovery: recursive, follow symlinks, prune hidden **directories** (whole
  subtree), hidden **files** are tickets; deterministic byte-wise path order
  (`LC_ALL=C sort` → compare Buffers, not JS UTF-16 strings).
- JSONL: frontmatter key order preserved, `full_path` appended last, title quotes
  stripped, backslash/quote escaping.
- ID resolution: exact match wins over partial; >1 match ⇒ ambiguity error;
  whitespace-trimmed input.
- `closed`: mtime-sorted (nanoseconds; `statSync().mtimeMs` is too coarse), ties broken by
  the file name as `ls -t` does, capped at 100 files scanned BEFORE filtering, `--limit`
  applied after. Its status set is `closed|done`, wider than the `closed`-only test
  dependency resolution uses. Read the mtime with `lstat`, NOT `stat`: `ls -t` does not
  dereference a symlink operand, so a symlinked ticket sorts by the LINK's own mtime.
- `closed --limit=`: bash forwarded the raw text to `head -n`, inheriting `+N`, `2k` size
  suffixes, negative "all but the last N" and a RACY exit code for 0. TS takes a plain
  count only (whitelisted divergence #4 in `scripts/parity/README.md`).
- `query`: bash escaped only `\` and `"`, so a control character in a value (reachable via
  `tk create $'a\tb'`) produced JSONL that jq cannot parse. TS escapes it properly
  (whitelisted divergence #5). The jq filter itself stays an external `jq` process.
- `query` with no `jq` on PATH: exit 127 (the shell's code, kept) with an actionable message
  instead of bash's `./ticket: line NNN: jq: command not found` (whitelisted divergence #6).
- A closed stdout (`tk ls | head -1`): node ignores SIGPIPE, so the CLI turns the failed write
  into 128+SIGPIPE itself. bash's code there depended on awk's write chunking, i.e. on output
  size, so the two agree except in a band of output sizes (whitelisted divergence #7).
- `dep tree`: root resolution goes through the shared `IdResolver` (exact beats partial,
  input trimmed, empty matches nothing) instead of bash's own substring scan, which called a
  full id contained in another id "ambiguous" (whitelisted divergence #9; approved in
  `nid_5g3eta9cf7yi6iukmscxma6wc_e`). bash's `dep tree`-specific error wording is kept.
- `dep cycle`: bash aborted its DFS at the first cycle and left the entered nodes marked
  "visiting", so it printed walks that are not cycles and missed real ones. TS records every
  back edge and dedups by member set (whitelisted divergence #1 — an intentional bug fix,
  pinned by BDD scenarios for both halves: bogus extra cycle and missed overlapping cycle).
- `show`: bash's Blocking/Children order is an awk hash order, i.e. unspecified, and it
  printed one Blocking row per matching `deps` entry; TS uses enumeration order and one row
  per ticket (whitelisted divergence #8). The order half needs no approval; the duplicate-row
  removal is shipped but PENDING human sign-off in `nid_qxt3z5unr9k220aqttbw84a6a_e` — the
  closed decision ticket covers #9 only.
- `dep` is ONE command name whose `tree`/`cycle` subcommands are reads and whose default form
  is a write. T4 delegated the two read branches from inside bash `cmd_dep` via a second list,
  `TS_DEP_SUBCOMMANDS`; T5 phase B put `dep` itself in `TS_COMMANDS`, which makes that inner
  delegation unreachable. `TS_DEP_SUBCOMMANDS=` stays until T6 anyway: `scripts/parity/
  harness.py` requires exactly one assignment per delegation variable and must keep emptying
  BOTH lists, and emptying it is half of rolling `dep` back to bash.
- `deps`/`links` are id ARRAYS. bash tested membership with `grep` and removed with `sed` over
  the array TEXT, so a substring id read as present and a removal mangled the sibling it was
  contained in (`[t-1, t-111]` minus `t-1` became `[11]`); TS matches and removes whole
  elements (whitelisted divergence #13). A ticket with no `deps:`/`links:` field aborted bash
  silently (`yaml_field`'s failing pipeline under `set -e`) or was quietly skipped by `link`'s
  awk; TS creates the field (divergences #14, #15). bash's `^links:`/`^deps:` patterns also hit
  the BODY; TS edits only the frontmatter block (#16).
- `link` de-duplicates its arguments by resolved id and refuses a set that collapses to one
  ticket, where bash's `link a a` linked a ticket to itself (#17); appended ids follow the
  order the user named them, where bash used awk's unspecified hash order (#18).
  `tk dep a a` deliberately stays bash-compatible (a self-dependency IS recorded): a `deps`
  self-edge is a graph error `dep cycle` already reports, while a self-`link` is inert data.
  Both halves of that judgement are on the `decide` ticket `nid_r3mp6uylht7t77iwxtuqvhxv2_e`.
- `unlink` decides whether the link exists from the SUBJECT's `links` alone, then clears both
  sides — a half link recorded only by the target reports `Link not found`. That is bash's
  behavior and is kept.
- `ready`/`blocked`: unknown dep IDs count as not-closed (blocking).
- `ready`/`blocked`: bash packs its sort key as `prio|id|status|title`, so it TRUNCATES a
  title at the first `|`. Do NOT reproduce that; the TS row prints the title whole
  (whitelisted divergence #3 in `scripts/parity/README.md`).
- `status closed` sets `closed_iso`; other statuses remove it; both bump
  `status_updated_iso`. A field the file lacks is inserted as the FIRST frontmatter entry,
  which is where bash's `sed` insert landed it, and JSONL key order depends on that. The TS
  port reads the clock ONCE where bash called `_iso_date` twice, so `status_updated_iso` and
  `closed_iso` can no longer differ by a second while describing the same event.
- `create`: `ensure_dir` runs BEFORE argument parsing, so even a rejected `create` leaves the
  tickets directory behind; `create` is the only command allowed to create it. Frontmatter key
  order, the `assignee`/`external-ref`/`parent`/`tags` lines' conditional presence, `tags`
  comma re-spacing (`${tags//,/, }`, no trimming), the `Untitled` fallback for an absent OR
  empty title, "last positional wins" and the JSONL line are all reproduced byte-for-byte
  (golden strings in `test/create-command.test.ts` captured from bash).
- `create` with a value-taking flag at the END of the argument list died with bash's own
  `$2: unbound variable` naming a script line; TS reports `Error: option '--design' requires a
  value`, same exit code 1 (whitelisted divergence #10 in `scripts/parity/README.md`).
- A NEWLINE in a `create` title: bash's line-oriented `sed` kept it, producing a file named
  `line1<LF>line2.md` and an unparseable JSON line; TS drops it like any other byte outside
  `[a-z0-9-]` (whitelisted divergence #11).
- `_tickets/<slug>.md` existing as a DIRECTORY: bash's `[[ -f ]]` was false, so it redirected
  into the directory and died with `Is a directory`; TS treats the NAME as taken and picks
  `<slug>-1.md` (whitelisted divergence #12).
- `git config user.name` (the default assignee) and `git rev-parse --show-toplevel` are read
  through `Git.output`, which strips TRAILING NEWLINES only — what bash's `$( )` does. An
  earlier `.trim()` there silently reshaped a padded `user.name`; not a divergence, a bug that
  was found by review and is now pinned in `test/git.test.ts` and by `check_write`.
- Usage lines of `status`/`start`/`close`/`reopen` interpolate the INVOKED program name
  (`$(basename "$0")` in bash, `TICKET_INVOKED_AS` → `ProgramName.invoked()` in TS); every
  other write command's usage text hardcodes `ticket`, and that difference is bash's, kept.
- TTY handling: `edit` only launches `$EDITOR` when stdin+stdout are TTYs, else
  prints path; `show` pages via `TICKET_PAGER`/`PAGER` only when stdout is a TTY;
  `add-note` reads stdin when not a TTY. The two streams reach a command through
  `Terminal` (`src/cli/terminal.ts`), injected on `CommandEnvironment`, because a unit test
  is the ONLY way to reach the terminal arms — no BDD runner has a TTY on either stream.
- `$EDITOR` is used UNSPLIT, exactly as bash's quoted `"${EDITOR:-vi}"` used it: `EDITOR="code
  -w"` is looked up as one filename and fails. Splitting it (as `TICKET_PAGER` is split) would
  make a command bash rejected start working. An `$EDITOR` that is not on PATH exits **127**
  as it did, but with `Error: <editor>: command not found` instead of whatever the shell said
  (a message naming a line of the script, or nothing at all — see divergence #19) — the same trade already made for
  `jq` (#6), and now decided in ONE place, `src/cli/spawned-child.ts`, for `jq`, `$PAGER` and
  `$EDITOR` alike.
- `add-note` APPENDS BYTES to the file (`TicketStore.appendTo`, node's `appendFileSync`),
  where every other write command rewrites it through `TicketStore.save`. That is bash's own
  split — `printf … >> "$file"` for the note, `sed > tmp && mv` for a frontmatter edit — and
  it matters: a rename replaces a SYMLINKED ticket with a regular file, which `>>` did not do.
  Both shapes are pinned against bash by `check_write` cases that dump whether each entry is
  still a symlink.
- Exit codes and stderr message wording (several scenarios assert them).

## State after T5: bash `./ticket` is a delegating shim

`TS_COMMANDS` names **every** command the tool has, so the top-level check delegates every
real invocation to `dist/ticket.mjs`. The only bash that still runs for a user is the
dispatch itself plus the `Unknown command` fallback — an unrecognized name is not in
`TS_COMMANDS`, so it keeps going through `init_tickets_dir` first and reports a missing
tickets directory BEFORE the unknown-command help, which is the pinned behavior.

The `cmd_*` bodies are deliberately **kept, unreachable**, until T6. They are the differential
oracle: `make parity` runs a copy of `./ticket` with both delegation lists emptied and diffs
it against the TS bundle. Deleting them at T5 would turn every parity check into TS vs TS —
a harness that can no longer fail — and would remove the one-line rollback (drop a name from
`TS_COMMANDS`). They go at the T6 cutover together with `scripts/parity/`.

## Phases → execution tickets

Cross-dependency graph (T3/T4/T5 are parallelizable after T2):

```
T1 scaffold ── T2 core model ──┬── T3 read cmds ──────┐
                               ├── T4 graph cmds ─────┼── T6 cutover + packaging
                               └── T5 write cmds ─────┘
```

| # | Ticket ID | Scope |
|---|-----------|-------|
| T1 | `nid_604l3jerigu3ikyq68958lxy7_e` | TS scaffold + hybrid dispatcher: Node/TS project, esbuild bundle, `TS_COMMANDS` delegation in bash `ticket`, CI builds bundle before BDD, port `help` as pipeline proof |
| T2 | `nid_ropjwdm792a5qqyu2u0zeuna1_e` | Core data-model library: frontmatter, ticket-store/discovery, slug, id resolution, dep-graph primitives + unit tests |
| T3 | `nid_zesi8c4t7lyw6jgmqqsjqd54k_e` | Read commands: `ls`, `ready`, `blocked`, `closed`, `query` |
| T4 | `nid_8cislepljqvv88ayndtjlw34k_e` | Graph commands: `dep tree`, `dep cycle`, `show` |
| T5 | `nid_2ziai8ka9l0yak2lxnwlu9lk2_e` | Write commands: `create`, `status`/`start`/`close`/`reopen`, `dep`/`undep`, `link`/`unlink`, `add-note`, `edit` (T4 soft-dep: finishes the `dep` dispatch flip) |
| T6 | `nid_fhmxugci00tfkeu3eyeggv6gq_e` | Cutover + packaging (`decide` tag): Node entrypoint replaces bash, delete bash impl, delete `scripts/parity/` + its make/npm targets + its CI step, Homebrew/AUR gain `node` dep, docs/CHANGELOG |

## Distribution (decided at T6, recommendation below)

Homebrew formula and AUR PKGBUILD both install straight from the git tag tarball
with **no build step**. Recommendation: **commit the built `dist/ticket.mjs` at
release time** and have packagers install it as `tk`. WHY-NOT build-on-install:
would add npm/network to Homebrew/AUR installs for zero user value. WHY-NOT
committing dist on every commit: noisy diffs; only release tags need it (CI can
verify dist is up-to-date at tag time). Packager dependency lists change from
`bash/coreutils/findutils/gawk` to `nodejs` + `git`.

## Out of scope

- The graph visualization itself (separate effort; consumes `src/core/`).
- New features or behavior changes beyond bug fixes surfaced by the port
  (each such fix: failing BDD scenario first, called out explicitly).
