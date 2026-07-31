# Migration to TypeScript — High-Level Plan

**STATUS: COMPLETE (T6, 2026-07-30).** The bash implementation and the bash-vs-TS parity
harness are deleted; `ticket` is a thin launcher for `dist/ticket.mjs`. This document is kept
because it is the permanent home of the **deliberate divergences from bash** (bottom of the
file), which ~14 code comments cite by number, and of the distribution decision. The plan
sections above them are history — read them as "how it was done", not "what to do".

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

Through T5 these were verified empirically by `make parity`, a differential harness that diffed
bash `./ticket` against the TS bundle over generated ticket graphs and, for write commands, over
every byte under `_tickets/`. **It was deleted at T6 with bash** — with nothing to diff against,
it would only have compared TS to TS. Every property it pinned was first folded into a BDD
scenario or a unit test; the mapping is in
`.ai_out/ts-port-6-cutover/.../IMPLEMENTATION_PHASE_A__PUBLIC.md` §2.

The list below is now a **contract summary**, not a to-do: these are the behaviors to preserve
when touching the code, even where BDD scenarios are thin.

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
  count only (divergence #4 below).
- `query`: bash escaped only `\` and `"`, so a control character in a value (reachable via
  `tk create $'a\tb'`) produced JSONL that jq cannot parse. TS escapes it properly
  (divergence #5). The jq filter itself stays an external `jq` process.
- `query` with no `jq` on PATH: exit 127 (the shell's code, kept) with an actionable message
  instead of bash's `./ticket: line NNN: jq: command not found` (divergence #6).
- A closed stdout (`tk ls | head -1`): node ignores SIGPIPE, so the CLI turns the failed write
  into 128+SIGPIPE itself. bash's code there depended on awk's write chunking, i.e. on output
  size, so the two agree except in a band of output sizes (divergence #7).
- `dep tree`: root resolution goes through the shared `IdResolver` (exact beats partial,
  input trimmed, empty matches nothing) instead of bash's own substring scan, which called a
  full id contained in another id "ambiguous" (divergence #9; approved in
  `nid_5g3eta9cf7yi6iukmscxma6wc_e`). bash's `dep tree`-specific error wording is kept.
- `dep cycle`: bash aborted its DFS at the first cycle and left the entered nodes marked
  "visiting", so it printed walks that are not cycles and missed real ones. TS records every
  back edge and dedups by member set (divergence #1 — an intentional bug fix,
  pinned by BDD scenarios for both halves: bogus extra cycle and missed overlapping cycle).
- `show`: bash's Blocking/Children order is an awk hash order, i.e. unspecified, and it
  printed one Blocking row per matching `deps` entry; TS uses enumeration order and one row
  per ticket (divergence #8). The order half needs no approval; the duplicate-row
  removal was approved by the owner on 2026-07-30 (`nid_qxt3z5unr9k220aqttbw84a6a_e`), the
  #9 decision ticket having covered #9 only.
- `dep` is ONE command name whose `tree`/`cycle` subcommands are reads and whose default form
  is a write. During the port that meant two delegation lists (`TS_COMMANDS` and
  `TS_DEP_SUBCOMMANDS`); both are gone with bash. `src/cli/` dispatches the subcommand.
- `deps`/`links` are id ARRAYS. bash tested membership with `grep` and removed with `sed` over
  the array TEXT, so a substring id read as present and a removal mangled the sibling it was
  contained in (`[t-1, t-111]` minus `t-1` became `[11]`); TS matches and removes whole
  elements (divergence #13). A ticket with no `deps:`/`links:` field aborted bash
  silently (`yaml_field`'s failing pipeline under `set -e`) or was quietly skipped by `link`'s
  awk; TS creates the field (divergences #14, #15). bash's `^links:`/`^deps:` patterns also hit
  the BODY; TS edits only the frontmatter block (#16).
- `link` de-duplicates its arguments by resolved id and refuses a set that collapses to one
  ticket, where bash's `link a a` linked a ticket to itself (#17); appended ids follow the
  order the user named them, where bash used awk's unspecified hash order (#18).
  `tk dep a a` deliberately stays bash-compatible (a self-dependency IS recorded): a `deps`
  self-edge is a graph error `dep cycle` already reports, while a self-`link` is inert data.
  Both halves of that judgement were APPROVED as shipped by the owner on 2026-07-30
  (`nid_r3mp6uylht7t77iwxtuqvhxv2_e`, closed), together with #6, #10, #11 and #12.
- `unlink` decides whether the link exists from the SUBJECT's `links` alone, then clears both
  sides — a half link recorded only by the target reports `Link not found`. That is bash's
  behavior and is kept.
- `ready`/`blocked`: unknown dep IDs count as not-closed (blocking).
- `ready`/`blocked`: bash packs its sort key as `prio|id|status|title`, so it TRUNCATES a
  title at the first `|`. Do NOT reproduce that; the TS row prints the title whole
  (divergence #3 below).
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
  value`, same exit code 1 (divergence #10 below).
- A NEWLINE in a `create` title: bash's line-oriented `sed` kept it, producing a file named
  `line1<LF>line2.md` and an unparseable JSON line; TS drops it like any other byte outside
  `[a-z0-9-]` (divergence #11).
- `_tickets/<slug>.md` existing as a DIRECTORY: bash's `[[ -f ]]` was false, so it redirected
  into the directory and died with `Is a directory`; TS treats the NAME as taken and picks
  `<slug>-1.md` (divergence #12).
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

## State after T6: `./ticket` is a thin launcher

No bash ticket logic remains anywhere. `./ticket` (~90 lines) resolves its own directory
through symlinks, builds `dist/ticket.mjs` if it is missing or older than any file under
`src/`, and `exec node`s it with `TICKET_INVOKED_AS="$0"`. Everything it prints goes to
stderr, so a building invocation still leaves stdout byte-clean for `tk query | jq`.

`scripts/parity/` and `make parity` are deleted; the `cmd_*` bodies that were its differential
oracle went with it. Rollback is no longer per-command — it is a git revert.

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

## Distribution — DECIDED at T6 (owner, 2026-07-30)

**Build from source. No prebuilt bundle is committed to the repo or attached to a release.**
WHY: this is a single-user build tool, and the release flow stays "tag it" with no `dist`
artifact anyone has to keep in sync with `src/`. This **supersedes** the earlier
recommendation in this document to commit `dist/ticket.mjs` at release tags.

Two shapes follow from that, and they are not the same thing:

1. **A git checkout** — `./ticket` builds `dist/ticket.mjs` on demand, on the first
   invocation and again after any `git pull` that touches `src/`. This is the developer and
   `ln -s "$PWD/ticket" ~/.local/bin/tk` path. It needs `npm` and, once, the network.
2. **A package (Homebrew / AUR)** — the bundle is built in the package's own **build/install
   phase** and installed alongside the sources; `dist/ticket.mjs` is `touch`ed last so the
   launcher never judges it stale. `npm` is a *build* dependency only.

**WHY-NOT let the packaged install build on demand too:** it cannot. The install prefix is
root-owned and read-only to the user the tool runs as. Verified empirically on a simulated
prefix (`chmod -R a-w`): with a prebuilt bundle and no `node_modules/`, `tk help`/`create`/`ls`
all work; without one, esbuild fails with `mkdir dist: permission denied` and the launcher
exits 1. So a package that only copied the launcher and the sources would be dead on arrival.

**CALLED OUT (accepted, not solved):** building at install time means Homebrew/AUR users need
npm and network at `brew install` / `makepkg` time, and the devDependency tree (esbuild,
typescript) lands on an end-user box for the duration of the build. That is a poor fit for a
general-audience tool and is accepted only because this one is single-user. **If it ever goes
multi-user, revisit with a follow-up ticket for a prebuilt-bundle release artifact** — do not
quietly re-add one.

`pkg/install-manifest.txt` is the **single source of truth** for what a complete install needs
on disk. The AUR `PKGBUILD`, `scripts/publish-homebrew.sh` and the launcher's BDD isolated tool
copy all read it, because three hand-maintained copies of that list would drift silently.

Runtime dependency lists changed from `bash/coreutils/findutils/gawk` to
**`bash` + `nodejs` + `git` + `coreutils`/`findutils`** (the launcher's `readlink`/`dirname`/
`find`), with `npm` build-only and `jq` optional (`query <jq-filter>` only).

## Deliberate divergences from bash

The 20 entries below are the places where the TS CLI intentionally does NOT reproduce bash.
**~14 comments in `src/`, `test/` and `features/steps/` cite them BY NUMBER**, so the numbering
is frozen: never renumber, only append.

Entries #1–#19 are reproduced verbatim from the deleted `scripts/parity/README.md`
(`git show 42ccf92^:scripts/parity/README.md`). Their **"pinned by `check_*`" clauses refer to
the parity harness, which no longer exists** — read each as "pinned by the BDD scenario or unit
test named for that entry in
`.ai_out/ts-port-6-cutover/CC_nid_fhmxugci00tfkeu3eyeggv6gq_e__ts-port-6-cutover-delete-bash-packaging-docs_opus/IMPLEMENTATION_PHASE_A__PUBLIC.md`
§2", which is the folding table produced when the harness was deleted. Every entry, including
every sub-case, has such a pin.

Every entry that CHANGES user-visible behavior rather than merely picking an order bash left
unspecified has owner sign-off: #9 on `nid_5g3eta9cf7yi6iukmscxma6wc_e`, #8's duplicate-row
removal on `nid_qxt3z5unr9k220aqttbw84a6a_e`, #6, #10, #11, #12 and #17 approved as shipped
on 2026-07-30 (`nid_r3mp6uylht7t77iwxtuqvhxv2_e`), and #20 on
`nid_fhmxugci00tfkeu3eyeggv6gq_e`. Nothing here is pending a decision.

1. **`dep cycle`** — bash aborts its DFS on the first cycle and leaves nodes marked
   "visiting", so it prints paths that are not cycles and misses real ones (19 bogus
   cycles over the default scenario set). Diffing bytes would pin a bug, so both sides
   are checked semantically instead: every cycle the TS core reports must be a real
   closed walk, and no cyclic graph may come back empty. T4 flipped `dep cycle` to TS and
   BDD scenarios in `features/ticket_dependencies.feature` now pin the TS behavior on both
   halves of the bug — the points-into-a-cycle shape (exactly one cycle, no bogus second) and
   three cycles overlapping in one ticket (all 3 found).
2. **A `.md` under `_tickets/` that is not a usable ticket** — bash tolerates it (skipped, or
   emitted as an id-less JSON record); the TS core fails naming the file
   (`nid_n6eavbm0h77twvna8k9nnpu2g_e`, an intentional behavior change: a corrupt repo must
   not be silently under-reported). TS distinguishes three causes, and
   `check_query._check_missing_id_divergence` pins the message of each: no frontmatter block,
   a block with no `id`, and a CRLF file — whose `---\r` is not the fence, so it is rejected for
   its LINE ENDINGS rather than for the `id` it visibly contains
   (`nid_z10hpj927zqilxcpl9ycpe0ad_e`; CRLF ticket files stay unsupported).
3. **A `|` in a title, for `ready`/`blocked`** — bash packs its sort key as
   `prio|id|status|title` and `split()`s it back apart, so it truncates the title at the
   first pipe (and `blocked` prints the rest of the title where the blockers belong).
   Reachable through `tk create "a | b"`, so it is a real input class. TS prints the title
   whole; `check_graph._check_pipe_title_divergence` pins both sides. `ls` is unaffected and
   IS byte-compared.

4. **`closed --limit=` with anything but a plain count** — bash forwarded the raw text to
   `head -n`, so it accepted `+N`, size suffixes (`2k` = 2048) and negative values meaning
   "all but the last N", reported `head: invalid number of lines` for a typo, and for
   `--limit=0` exited **0 or 141 racily** (whether `awk` writes before `head` closes the
   pipe; measured flipping on identical input). TS accepts a plain decimal count and rejects
   the rest with exit 1 — including in an empty tickets dir, where bash returned before
   `head` ever ran and so ignored the typo. `check_graph._check_closed_limit_divergences`
   pins both sides.
5. **A control character in a frontmatter value, for `query`** — bash's `json_escape`
   handles `\` and `"` only, so a raw tab (reachable via `tk create $'a\tb'`) lands inside a
   JSON string and makes the line unparseable; bash's own `query <filter>` then dies inside
   jq. TS uses `JSON.stringify`. `check_query._check_control_character_divergence` pins that
   bash's output stays invalid and TS's stays valid, and `check_write`'s
   `DIVERGENCE #5 tab in title` pins it at the point where the value is BORN — the JSON line
   `create` itself prints.
6. **`query <filter>` with no `jq` on PATH** — both sides exit **127**, the shell's code for
   a missing binary, but bash printed the shell's own `./ticket: line NNN: jq: command not
   found`, which names a line of the script. TS prints `Error: jq: command not found` plus
   `Install jq, or run 'query' without a filter`. Only the message differs; the exit code and
   the fact that `query` without a filter still works are pinned by BDD scenarios (the PATH is
   stripped of `jq` alone), not by the harness, because the harness compares text.
7. **The exit code when the reader of stdout goes away** (`tk ls | head -1`) — node ignores
   SIGPIPE, so the CLI reports 128+SIGPIPE itself. bash's code was NOT a property of the
   command but of its output size: `awk` writes in ~4 KB chunks and is killed as soon as
   `head` exits, so bash exited 0 up to ~4 KB of output and 141 above it, while node writes
   in one go and only fails past the 64 KB pipe buffer. Measured with 2/50/120 tickets (both
   sides 0), 200/400 (bash 141, TS 0) and 3000 (both 141). The band in between is the
   divergence; reproducing it would mean reproducing awk's internal chunking.
   `check_graph._check_broken_pipe_exit_code` pins the two ends (3000 tickets ⇒ 141 on both,
   one ticket ⇒ 0 on both) and `check_query._check_query_broken_pipe` pins the `jq` case,
   where the child really is signalled and both sides say 141.

8. **`show`'s computed sections** — bash builds Blocking and Children by iterating an awk
   associative array, whose order is UNSPECIFIED (measured: neither path nor id order), and
   appends one Blocking row per matching `deps` ENTRY, so a ticket naming the target twice is
   printed twice. TS uses enumeration (path) order and lists each ticket once.
   `check_graph._show_mismatches` therefore byte-compares the echoed FILE and the section
   HEADINGS in order, and compares the rows within a section as a sorted MULTISET —
   except `## Blocking`, the only section with the count divergence, which is compared as a
   sorted SET so the `duplicate-dep*` scenarios do not trip it; `_check_show_duplicate_blocking`
   pins that duplicate-row difference by COUNT. Deduplicating every section instead was
   measured to hide a real `show` regression (a `[...new Set(ids)]` row dedup shipped green),
   so keep the dedup narrow. The `Blockers` and `Linked` sections are `deps`/`links` order on
   both sides, duplicate entries included — both sides repeat the row.
   **Approval status:** the ORDER half needs none (bash's order is unspecified, so any
   implementation must pick one). The DUPLICATE-ROW REMOVAL is a deliberate behavior change,
   approved by the owner on 2026-07-30 (`nid_qxt3z5unr9k220aqttbw84a6a_e`); it was not covered
   by the id-resolution decision ticket, which is #9 only.
9. **`dep tree`'s root id, and an empty id anywhere** — bash's `cmd_dep_tree` resolved its
   root with its own awk scan matching by SUBSTRING, so a full id contained in another
   ticket's id came back "ambiguous" and that tree was unreachable, while untrimmed input
   matched nothing. Separately, awk's `index(s, "")` is 1, so an EMPTY id matched every
   ticket and resolved to the only one in a single-ticket repo — `tk show "$UNSET_VAR"`
   printed an arbitrary ticket. Both were confirmed as bugs by the owner
   (`nid_5g3eta9cf7yi6iukmscxma6wc_e`): `dep tree` now resolves through the shared
   `IdResolver` (exact beats partial, input trimmed) and an empty id matches nothing.
   BDD scenarios pin the TS side; `check_graph._check_id_resolution_divergences` pins that
   bash really did behave the other way, and `check_write`'s `DIVERGENCE #9 empty id` pins
   that an empty id now mutates NOTHING where bash closed the only ticket in the repo.
   bash's error WORDING for a `dep tree` root is reproduced exactly
   (`Error: ticket <id> not found`, unquoted — unlike `ticket_path`'s).

10. **`create` with a value-taking flag at the end of the argument list** (`tk create x
   --design`) — bash dereferenced `"$2"` under `set -u` and died with the shell's own
   `./ticket: line 308: $2: unbound variable`, which names a line of the script and tells the
   user nothing about what to type instead. TS exits 1 with `Error: option '--design'
   requires a value`. Pinned by a scenario in `features/ticket_creation.feature` and by
   `check_write`.
11. **A NEWLINE in a `create` title** — bash's `title_to_filename` is a `sed` pipeline, which
   is line-oriented, so the LF survived every substitution (and the per-line `s/^-//; s/-$//`
   ran twice): `tk create $'line1\nline2'` created a file literally named `line1<LF>line2.md`
   and printed a JSON line that does not parse (`"title":"\"line1","line2\"":""`). TS drops
   the newline like any other byte outside `[a-z0-9-]`, giving `line1line2.md`, and
   `JSON.stringify` escapes it in the title. Pinned by `check_write`
   (`DIVERGENCE #11 newline in title`) and commented on `Slug.fromTitle`.
   `check_slug.TITLES` deliberately does NOT contain a newline: that check compares the two
   implementations expecting agreement, so the case belongs where divergence is expected.
12. **`_tickets/<slug>.md` already exists as a DIRECTORY** — bash tested `[[ -f ]]`, false for
   a directory, so it redirected its `create` output INTO the directory and died with
   `Is a directory` at exit 1. TS's `TicketStore.topLevelFileExists` asks whether the NAME is
   taken at all, picks `<slug>-1.md` and succeeds. Pinned by `check_write`
   (`DIVERGENCE #12 …`) and commented on `topLevelFileExists`.

13. **`deps` and `links` are id ARRAYS, not text** — bash tested membership with
   `echo "$deps" | grep -q "$id"` and removed with `sed "s/, *$id//g; s/$id, *//g; s/$id//g"`,
   i.e. on the raw array text. So an id that merely OCCURS inside a recorded one counted as
   already present (`dep` refused to add it, `undep`/`unlink` claimed to find it), and a
   removal cut the text out of the middle of its neighbour: `[t-1, t-111]` minus `t-1` became
   `[11]`, silently destroying a dependency and inventing a dangling one. The id was also a
   `grep`/`sed` REGEX, so a `.` in it matched any character. TS compares and removes whole
   array elements and re-serializes the array canonically (`[a, b]`), which additionally
   normalizes hand-written spacing. A NON-array scalar value is normalized the same way — TS
   reads `deps: foo` as the single element `foo` and writes `deps: [foo, <id>]`, where bash
   printed `Added dependency: …` and changed nothing at all, because its insert was
   `sed "s/\]/, $dep_id]/"` and a scalar has no `]` to append before (measured). Reachable with hand-written or legacy ids — this repo's
   own tickets used `task-0001`-style ids before the fixed-length `nid_` scheme. Pinned by
   three `check_write` cases and by BDD scenarios in `ticket_dependencies.feature` /
   `ticket_links.feature`.
14. **`dep`/`undep` on a ticket with no `deps:` field** — bash read the field through
   `yaml_field`, whose `grep` finds nothing, and that failing pipeline aborted the command
   under `set -euo pipefail`: exit 1, no message on either stream, nothing written. TS treats
   a missing field as an empty relation, so `dep` creates `deps: [<id>]` (as the first
   frontmatter entry, where bash's own insert would have put it) and `undep` prints
   `Dependency not found` with exit 1. Two `check_write` cases and two BDD scenarios.
15. **`link` on a ticket with no `links:` field** — bash's awk only ever REWROTE an existing
   `^links:` line, so such a ticket gained no link at all, contributed 0 to the count, and
   `tk link a b` could report the flatly misleading `All links already exist`. TS creates the
   field. One `check_write` case, one BDD scenario.
16. **`link`/`dep`/`undep` edits are confined to the frontmatter block** — bash's awk matched
   `/^links:/` and its `sed` matched `^deps:` ANYWHERE in the file, so a `links:`/`deps:` line
   in the BODY (a note, a fenced example) was rewritten too, and for `link` even counted:
   a body line made `tk link a b` report 3 added links instead of 2. Two `check_write` cases —
   both `diverges=True`, which asserts only that the two sides DIFFER and can therefore never
   pin what TS does; the TS side is pinned by the `ticket_links.feature` scenario "A links line
   in the body is neither counted nor rewritten" (count stays 2, the body line stays
   `links: [ghost]`). Kept honest by mutation: making the frontmatter block swallow the body
   fails that scenario and only that scenario.
17. **`link` with an argument list naming one ticket twice** — bash treated the repeat as
   another ticket to link, so `tk link a a` recorded `a` in its own `links` and reported
   `Added 1 link(s) between 2 tickets`. TS collapses arguments that resolve to the same
   ticket and refuses a set that collapses to one, with
   `Error: nothing to link: every id resolves to ticket <id>` at exit 1. A repeat that does NOT
   collapse the set changes the reported counts instead of failing: `tk link a a b` is
   `Added 2 link(s) between 2 tickets` here and was `Added 3 link(s) between 3 tickets` in bash.
   One `check_write` case, two BDD scenarios (the refusal and the count).
   WHY only `link` and not `dep`: a `links` entry has no graph semantics, so a ticket linked to
   itself is inert data; a `deps` self-edge is a real graph error that `dep cycle` reports, so
   `tk dep a a` is still recorded exactly as bash recorded it. The asymmetry is approved (see
   above).
18. **The ORDER in which `link` appends missing ids** — bash appended them with awk's
   `for (id in need)`, whose order is unspecified and differs between awk builds (measured
   `[c, b]` for `link a b c` under this machine's awk). TS appends in the order the user named
   the tickets. Not pinnable by the harness in either direction, for exactly that reason; the
   TS order is pinned by a unit test on `LinkClosure` and by a BDD scenario asserting the
   whole `links` value.

19. **An `$EDITOR` that is not on PATH** (`tk edit x` with a terminal on both streams) — both
   sides exit **127**, but bash left the message to the SHELL while TS prints
   `Error: nosucheditor: command not found`. Only the exit code is stable on the bash side: the
   shell printed `./ticket: line 1509: nosucheditor: command not found` (naming a line of the
   script) for a value containing a slash or a space, and NOTHING at all for a bare name when
   the shell had a `command_not_found_handle` installed — so do not pin bash's wording here. The same trade as #6, and now made in ONE place
   (`src/cli/spawned-child.ts`) for `jq`, `$PAGER` and `$EDITOR`. **The harness cannot see this
   at all**: the editor is launched only when stdin AND stdout are terminals, and every runner
   here uses pipes. Pinned by `test/edit-command.test.ts` ("exits 127 naming the editor when it
   is not on PATH"). That file is also the only pin for the rest of the launch arm, one test
   each: the adopted editor exit code, the ticket path reaching the child as its argument, and
   a multi-word `$EDITOR` being looked up as ONE filename (so `EDITOR="code -w"` exits 127
   rather than starting `code`). Those three drive the REAL `spawnSync`; a test that only
   asserts what `Editor.configured` RETURNS does not pin the spawn site.

20. **An unknown command name is reported as such, without a tickets directory.** bash resolved
   the tickets directory *before* its `case` dispatch, and an unrecognized name fell through to
   the default arm, so `tk bogus` in a repo with no `_tickets/` answered
   `Error: tickets directory '…/_tickets' does not exist` and never mentioned that the name is
   not a command. TS prints `Unknown command: bogus` plus the help, exit 1, whether or not a
   tickets directory exists. That ordering was an artifact of bash's dispatch, not a decision —
   nothing pinned it, and naming a resource the command was never going to touch is a POLS
   violation. **Approved by the owner on 2026-07-30 (`nid_fhmxugci00tfkeu3eyeggv6gq_e`).**
   Pinned by `features/ticket_directory.feature` → "An unknown command is reported without
   needing a tickets directory".

Two notes carried over from the harness README, still true of the TS side:
`harness.HOSTILE_TITLES` deliberately contained no `|` (#3), no tab (#5) and no newline (#11).
And for ticket files with *identical* mtimes, bash `ls -t` broke the tie with `strcoll`, i.e.
the caller's locale, while TS compares bytes; under `LC_ALL=C` the two agree.

## Out of scope

- The graph visualization itself (separate effort; consumes `src/core/`).
- New features or behavior changes beyond bug fixes surfaced by the port
  (each such fix: failing BDD scenario first, called out explicitly).
