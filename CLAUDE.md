# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

See @README.md for usage documentation. Run `tk help` for command reference. Always update the README.md usage content when adding/changing commands and flags.

## Architecture

**The CLI is TypeScript on Node.** `src/cli/` (dispatch + one module per command) and `src/core/` (data model), bundled by esbuild into `dist/ticket.mjs` — one file, zero runtime npm deps. `dist/` is gitignored and never committed.

**`./ticket` is a ~90-line bash launcher with zero ticket logic.** It resolves its own directory **through symlinks** (`tk` on PATH is typically a symlink into a checkout, and the bundle and sources sit next to the real file), rebuilds `dist/ticket.mjs` when it is missing or older than any file under `src/`, then `TICKET_INVOKED_AS="$0" exec node "$BUNDLE" "$@"`. **Everything it prints goes to stderr**, so `tk query | jq` stays byte-clean even on the invocation that builds. `src/` is required: a tree without sources fails loudly rather than serving a stale bundle forever. Packaged installs build at PACKAGE time instead — see "Releases & Packaging".

`src/core/` is the shared data-model layer (CLI **and** the planned graph visualization import it) and has **zero CLI knowledge** — no argv, no output formatting, no console:

- `frontmatter.ts` — `Frontmatter` (key-order-preserving block, raw values) + `TicketDocument` (block + body, byte-exact round trip)
- `ticket.ts` — `Ticket` entity: typed field accessors, immutable `withField`/`withoutField`, `toJsonRecord()` (the `query` payload), `TicketField` (the on-disk key names, one place), `TicketStatus` (the union of statuses this CLI WRITES — `Ticket.status` stays `string` because disk text is arbitrary; text becomes a `TicketStatus` only via `TicketStatusArgument.parsed`)
- `ticket-store.ts` — `TicketsDirectory.resolve()` and `TicketStore` (discovery/load/save); `collectFiles()` is the single source of truth for "what is a ticket file"
- `id.ts` — `TicketId.generate()`, `IdResolver` (exact beats partial, ambiguity is an error)
- `ticket-file-error.ts` — `CorruptTicketFileError` and its two cases: `MissingTicketIdError` (a block that parsed, no `id`) and `MissingFrontmatterBlockError` (no block at all — and CRLF, which is unsupported and named as the cause instead of the `id`)
- `file-system-error.ts` — `FileSystemError.guarding(operation, path, body)`: the ONE place an OS-level failure (EACCES, EROFS, ENOSPC, …) becomes a one-line message naming the path the USER knows, not `save`'s scratch file. Anything without an errno is rethrown so a defect keeps its stack trace. Every `node:fs` call in `ticket-store.ts` goes through it
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
- `pager.ts` / `child-exit.ts` / `spawned-child.ts` — `show`'s `$TICKET_PAGER` handoff (TTY only) and the shared "adopt the child's exit code, 127 when the binary is missing" rule; `SpawnedChild` is the ONE place that policy lives, for `jq`, `$PAGER` and `$EDITOR` alike
- `terminal.ts` — `Terminal` (`[ -t 0 ]`, `[ -t 1 ]`, read stdin), injected via `CommandEnvironment`. WHY an interface: the terminal arms of `edit` and `add-note` are unreachable from BDD, so only a unit test can say "both streams are terminals"
- `store-resolver.ts` — bash `init_tickets_dir` semantics: `forReadCommand()`/`forWriteCommand()` require an existing dir, `forCreateCommand()` mkdir -p's it. `create` is the ONLY command allowed to, and bash does it BEFORE parsing args
- `command-environment.ts` / `program-name.ts` — the ambient process a command runs in: invoked program name (usage text interpolates it — `TICKET_INVOKED_AS`, never a hardcoded `ticket`), clock, new-id and default-assignee sources. `CommandEnvironment.forProcess()` is the one place the real environment is bound; tests pass their own
- `commands/status.ts` — `StatusUpdate.applied()` is the pure frontmatter change (a new field lands FIRST, as bash's `sed` insert did); `STATUS_WRAPPERS` carries `start`/`close`/`reopen`
- `commands/add-note.ts` — the ONLY write that APPENDS bytes (`TicketStore.appendTo`) instead of rewriting through `save`, because bash used `>>` and a rename would replace a symlinked ticket with a regular file. `TicketNote.appendedTo()` is the pure note layout; `NoteText` is the argument/stdin/TTY choice
- `row-limit.ts` — `closed`'s `--limit=`; a plain count only (bash forwarded it to `head -n`)
- `jq.ts` — spawns the external `jq` for `query <filter>`; jq stays a real dependency, never reimplemented
- `cli-error.ts` — `CliError`; `main.ts` renders it (and core's `CorruptTicketFileError`) as `Error: <message>`, exit 1 (or the error's own `exitCode`). `UsageError` is the subclass for bash's un-prefixed `Usage: …` lines
- `exit-codes.ts` — every exit code in one place, including `128 + signal` for a signalled child
- `broken-pipe.ts` — node ignores SIGPIPE, so a closed stdout is turned into exit 141 here

**Deliberate divergences from the historical bash implementation** — the 20 numbered entries in `docs-internal/migration-to-ts-high-level.md` ("Deliberate divergences from bash"). ~14 comments in `src/`, `test/` and `features/steps/` cite them BY NUMBER, so the numbering is stable: never renumber, only append. Behavior changes there carry an owner approval id.

Data model: Filenames are title-based (e.g., `my-note.md`). The `id` field in frontmatter is the stable identifier. `title` is stored in frontmatter (double-quoted). No `# heading` for title in body.

Dependencies at runtime: **node**, **git** (repo-root resolution), plus bash/coreutils/`find` for the launcher. **npm** only when the launcher has to build. **jq** only for `query <jq-filter>`.

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

Single package: `ticket-core` — the launcher, the sources, and a bundle built at package time.

**`pkg/install-manifest.txt` is the single source of truth for what a complete install needs on disk.** The AUR `PKGBUILD`, `scripts/publish-homebrew.sh` and the launcher BDD's isolated tool copy (`features/steps/ticket_steps.py`) all read it. Add a new top-level file the tool needs at runtime → add it there, nowhere else.

**Packages build the bundle in their own build/install phase**, then install `dist/ticket.mjs` alongside the sources and `touch` it last. WHY-NOT letting the launcher build on demand there: the install prefix is root-owned, so esbuild fails with `mkdir dist: permission denied` (verified empirically, both directions). Nothing prebuilt is committed to the repo or attached to a release — the release flow stays "tag it".

**`make package-smoke` (`scripts/package-smoke.sh`, also a CI step) is the guard on all of that.** It replays the install steps both packages share into a read-only scratch prefix and drives `tk` through the installed symlink. WHY it exists separately from `make test`: every other gate drives a WRITABLE checkout, so none of them could catch a formula that installs an incomplete tree — which is how `bin.install "ticket" => "tk"` shipped dead for months. It does NOT run `brew`/`makepkg`; those semantics still need one real run before a release tag.

**CALLED OUT, accepted for now:** building at install time means Homebrew/AUR users need npm and network at `brew install`/`makepkg` time. Fine for a single-user tool. If it ever goes multi-user, the fix is a prebuilt-bundle release artifact — file a ticket, do not smuggle one in.

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
2. Runs `scripts/publish-homebrew.sh` - updates the `ticket-core` formula in the tap
3. Runs `scripts/publish-aur.sh` - updates the `ticket-core` AUR package

### Package Managers

- **Homebrew:** `wedow/homebrew-tools` tap
- **AUR:** Individual repos at `aur.archlinux.org/<pkgname>.git`

Both are updated automatically by CI. AUR repos are created on first push if they don't exist.
