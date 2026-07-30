# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

See @README.md for usage documentation. Run `tk help` for command reference. Always update the README.md usage content when adding/changing commands and flags.

## Architecture

**Core script:** Single-file bash implementation (`ticket`, ~1000 lines). Uses awk for performant bulk operations on large ticket sets.

**TypeScript port (in flight):** Strangler-fig migration to a Node CLI; plan at `docs-internal/migration-to-ts-high-level.md`. Commands named in the `TS_COMMANDS` variable in `ticket` are `exec`'d to `node <script-dir>/dist/ticket.mjs`; everything else stays bash. Sources in `src/` (`src/cli/` dispatch + commands, `src/core/` data model), bundled by esbuild via `make build` (zero runtime npm deps). Porting a command = implement in TS → add to `TS_COMMANDS` → `make test` green. Rollback = remove the name.

`dep` is served whole by `TS_COMMANDS` since T5 phase B, which makes `cmd_dep`'s own delegation via the second list `TS_DEP_SUBCOMMANDS` unreachable. That assignment is nonetheless load-bearing until T6: the parity harness's pinned bash copy empties BOTH lists and fails loudly if either assignment goes missing, and emptying it is half of rolling `dep` back to bash. Both lists go through `_ts_serves`/`_exec_ts`, whose `-n "$2"` guard stops an emptied list from substring-matching an empty command name.

`src/core/` is the shared data-model layer (CLI **and** the planned graph visualization import it) and has **zero CLI knowledge** — no argv, no output formatting, no console:

- `frontmatter.ts` — `Frontmatter` (key-order-preserving block, raw values) + `TicketDocument` (block + body, byte-exact round trip)
- `ticket.ts` — `Ticket` entity: typed field accessors, immutable `withField`/`withoutField`, `toJsonRecord()` (the `query` payload), `TicketField` (the on-disk key names, one place)
- `ticket-store.ts` — `TicketsDirectory.resolve()` and `TicketStore` (discovery/load/save); `collectFiles()` is the single source of truth for "what is a ticket file"
- `id.ts` — `TicketId.generate()`, `IdResolver` (exact beats partial, ambiguity is an error)
- `clock.ts` — `Clock`/`SystemClock`/`FixedClock`: bash `_iso_date`'s `%Y-%m-%dT%H:%M:%SZ`, injected so written bytes are testable
- `git.ts` — the only place git is invoked: repo root (for `TicketsDirectory`) and `user.name` (`create`'s default assignee); every probe answers `undefined` rather than throwing
- `slug.ts` — title → filename, collision suffixes
- `text.ts` — `LINE_SEPARATOR`; import it rather than re-declaring `"\n"` in a seventh module
- `dep-graph.ts` — `DepGraph`: ready/blocked, cycles, dependency-tree layout rows
- `ticket-relations.ts` — `TicketRelation.DEPENDENCY`/`.LINK`: the add/remove/membership rules for the `deps` and `links` id arrays, shared by `dep`/`undep`/`link`/`unlink`

`src/cli/` pieces shared by the ported commands:

- `list-options.ts` / `ticket-filter.ts` — the `--status`/`-a`/`--assignee`/`-T`/`--tag`/`--limit` union. Only `ls` honors `--status`; the others use `filterIgnoringStatus`
- `ticket-row.ts` — the four bash `printf` row formats plus `identified()` (`<id> [<status>] <title>`, the shape the graph commands share), one place
- `ticket-lookup.ts` — the ONE place an `IdResolution` becomes a user-facing failure; carries bash's two different wordings (`ticket_path`'s vs `dep tree`'s)
- `pager.ts` / `child-exit.ts` — `show`'s `$TICKET_PAGER` handoff (TTY only) and the shared "adopt the child's exit code" rule, also used by `jq.ts`
- `store-resolver.ts` — bash `init_tickets_dir` semantics: `forReadCommand()`/`forWriteCommand()` require an existing dir, `forCreateCommand()` mkdir -p's it. `create` is the ONLY command allowed to, and bash does it BEFORE parsing args
- `command-environment.ts` / `program-name.ts` — the ambient process a command runs in: invoked program name (usage text interpolates it — `TICKET_INVOKED_AS`, never a hardcoded `ticket`), clock, new-id and default-assignee sources. `CommandEnvironment.forProcess()` is the one place the real environment is bound; tests pass their own
- `commands/status.ts` — `StatusUpdate.applied()` is the pure frontmatter change (a new field lands FIRST, as bash's `sed` insert did); `STATUS_WRAPPERS` carries `start`/`close`/`reopen`
- `row-limit.ts` — `closed`'s `--limit=`; a plain count only (bash forwarded it to `head -n`)
- `jq.ts` — spawns the external `jq` for `query <filter>`; jq stays a real dependency, never reimplemented
- `cli-error.ts` — `CliError`; `main.ts` renders it (and core's `MissingTicketIdError`) as `Error: <message>`, exit 1 (or the error's own `exitCode`). `UsageError` is the subclass for bash's un-prefixed `Usage: …` lines
- `exit-codes.ts` — every exit code in one place, including `128 + signal` for a signalled child
- `broken-pipe.ts` — node ignores SIGPIPE, so a closed stdout is turned into exit 141 here

Bash behavior is the contract; parity is verified empirically via `make parity` (differential harness, `scripts/parity/README.md`; runs in CI alongside `make test`; delete at T6), not guessed. The harness diffs against a *pinned copy* of `ticket` with BOTH delegation lists (`TS_COMMANDS` and `TS_DEP_SUBCOMMANDS`) emptied — running `./ticket` itself would compare TS to TS for anything already ported. Known trap areas: byte-wise (`LC_ALL=C`) path ordering, JSONL escaping, frontmatter key order, `printf` padding widths and trailing spaces, `dep tree` sibling ordering, `show`'s section order (awk hash order, i.e. unspecified — compared as sets), `closed`'s mtime order (nanoseconds, `ls -t` name tie-break, a symlink's OWN mtime via `lstat`) with its 100-file scan cap applied before filtering, and exit codes inside a pipeline (a short reader kills bash's `awk`/`jq` with SIGPIPE). Write commands are diffed by `check_write.py`, which runs each side on identical fresh repos and compares the transcript **plus every byte under `_tickets/`** (ids/timestamps neutralised); a case may declare `diverges=True` to pin a difference. `create`/`status`/`start`/`close`/`reopen`/`dep`/`undep`/`link`/`unlink` are covered; `add-note`/`edit` are not yet — adding one is a `Case(...)` entry.

Key functions:
- `find_tickets_dir()` - Resolves tickets dir to `<git-repo-root>/_tickets` via `git rev-parse --show-toplevel`; `TICKETS_DIR` env var overrides
- `generate_id()` - Creates IDs in format `nid_<25-char-random-[a-z0-9]>_e` (decoupled from filename)
- `title_to_filename()` - Converts title to slug for filename, handles collisions
- `ticket_path()` - Resolves partial IDs by searching frontmatter `id:` fields (single awk pass)
- `id_from_file()` - Extracts `id:` from a file's YAML frontmatter
- `_file_to_jsonl()` - Shared awk-based JSONL generator (used by create and query)
- `yaml_field()` / `update_yaml_field()` - YAML frontmatter manipulation via sed
- `cmd_*()` - Command handlers
- `cmd_ready()`, `cmd_blocked()`, `cmd_ls()` - awk-based bulk listing with sorting

Data model: Filenames are title-based (e.g., `my-note.md`). The `id` field in frontmatter is the stable identifier. `title` is stored in frontmatter (double-quoted). No `# heading` for title in body.

Dependencies: bash, git, sed, awk, find. Optional: ripgrep (faster grep).

## Testing

BDD tests using [Behave](https://behave.readthedocs.io/). Run with `make test` (requires `uv`, `node`/`npm`; builds the TS bundle and runs the unit tests first).

`make unit-test` (= `npm test`) runs the `src/core/` + `src/cli/` unit tests: `node:test`, sources in `test/*.test.ts`, transpiled by esbuild into `dist-test/` (WHY-NOT running `.ts` through node directly: node's TS support does not cover parameter properties and its flags vary by version). No test framework dependency — do NOT add vitest.

- Feature files: `features/*.feature` - Gherkin scenarios covering all commands
- Step definitions: `features/steps/ticket_steps.py`
- CI runs tests on push to master and all PRs

Every new feature or behavior change MUST include BDD scenarios in the appropriate feature file.

## Changelog

Update CHANGELOG.md when committing notable changes:

### Core Script Changes
- New commands, flags, bug fixes, behavior changes
- Add under appropriate heading (Added, Fixed, Changed, Removed)

Example:
```markdown
## [Unreleased]

### Added
- New `foo` command
```

### What Doesn't Need Logging
- Documentation-only changes
- CI/workflow changes (unless they affect user-facing behavior)

## Releases & Packaging

### Package Structure

Single package:
- `ticket-core` - Core script and all commands

### Release Flow

1. Update CHANGELOG.md: change `## [Unreleased]` to version + date
2. Commit and tag:
   ```bash
   git commit -am "release: v0.4.0"
   git tag v0.4.0
   git push && git push origin v0.4.0
   ```

### CI Publishing

The release workflow (`.github/workflows/release.yml`) automatically:
1. Creates GitHub release with changelog body
2. Runs `scripts/publish-homebrew.sh` - updates all formulas in tap
3. Runs `scripts/publish-aur.sh` - updates all AUR packages

### Package Managers

- **Homebrew:** `wedow/homebrew-tools` tap
- **AUR:** Individual repos at `aur.archlinux.org/<pkgname>.git`

Both are updated automatically by CI. AUR repos are created on first push if they don't exist.
