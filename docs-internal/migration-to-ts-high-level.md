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
empirically. Run it while porting; delete it at T6 with bash.

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
- `closed`: mtime-sorted, capped at 100 files scanned, `--limit` applied after.
- `ready`/`blocked`: unknown dep IDs count as not-closed (blocking).
- `ready`/`blocked`: bash packs its sort key as `prio|id|status|title`, so it TRUNCATES a
  title at the first `|`. Do NOT reproduce that; the TS row prints the title whole
  (whitelisted divergence #3 in `scripts/parity/README.md`).
- `status closed` sets `closed_iso`; other statuses remove it; both bump
  `status_updated_iso`.
- TTY handling: `edit` only launches `$EDITOR` when stdin+stdout are TTYs, else
  prints path; `show` pages via `TICKET_PAGER`/`PAGER` only when stdout is a TTY;
  `add-note` reads stdin when not a TTY.
- Exit codes and stderr message wording (several scenarios assert them).

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
| T6 | `nid_fhmxugci00tfkeu3eyeggv6gq_e` | Cutover + packaging (`decide` tag): Node entrypoint replaces bash, delete bash impl, Homebrew/AUR gain `node` dep, docs/CHANGELOG |

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
