# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

User docs are split by surface: `README.md` is the landing page, `docs/cli.md` is the CLI reference, `docs/npm-library.md` is the library-consumer guide. Run `ticket help` for the command reference. Always update `docs/cli.md` when adding/changing commands and flags, and `docs/npm-library.md` when the exported library surface changes. Docs say `ticket` — the only installed name.

## Architecture

**The CLI is TypeScript on Node.** `src/cli/` (dispatch + one module per command) and `src/core/` (data model), bundled by esbuild into `dist/ticket.mjs` — one file, zero runtime npm deps. `dist/` is gitignored and never committed.

**`./ticket` is a ~90-line bash launcher with zero ticket logic.** It resolves its own directory **through symlinks** (`ticket` on PATH is typically a symlink into a checkout, and the bundle and sources sit next to the real file), rebuilds `dist/ticket.mjs` when it is missing or older than any file under `src/`, then `TICKET_INVOKED_AS="$0" exec node "$BUNDLE" "$@"`. **Everything it prints goes to stderr**, so `ticket query | jq` stays byte-clean even on the invocation that builds. `src/` is required: a tree without sources fails loudly rather than serving a stale bundle forever. An npm install never involves the launcher at all — see "Releases & Packaging".

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
- `new-ticket.ts` — `CreateOptions` (raw new-ticket values) + `CreateOptionsDefaults` (the one place the defaults live) + `NewTicketFacts` + `NewTicketDocument` (the file a new ticket starts life as, key order = contract). Pure; shared by CLI `create` and `TicketManager.create`
- `status-update.ts` — `StatusUpdate.applied()`: the pure status/timestamp frontmatter change (a new field lands FIRST, as bash's `sed` insert did). Shared by the `status` family and `TicketManager.setStatus`
- `ticket-note.ts` — `TicketNote.appendedTo()`: the pure note layout `add-note` and `TicketManager.addNote` append

**`src/lib/` is the npm library facade** (see "Library API" below; consumer-facing guide: `docs/npm-library.md`): `ticket-manager.ts` (the documented `TicketManager` interface + `NewTicketInput`), `file-ticket-manager.ts` (`FileTicketManager`, the file-backed implementation reusing the same core pieces the CLI uses, so both write byte-identical files), `ticket-manager-error.ts` (`TicketNotFoundError`/`AmbiguousTicketIdError` — the lib-side rendering of `IdResolution`, parallel to the CLI's `ticket-lookup.ts`). `src/index.ts` is the package entry and deliberately exports nothing from `src/cli/`.

`src/cli/` pieces shared by the ported commands:

- `list-options.ts` / `ticket-filter.ts` — the `--status`/`-a`/`--assignee`/`-T`/`--tag`/`--limit` union. Only `ls` honors `--status`; the others use `filterIgnoringStatus`
- `ticket-row.ts` — the four bash `printf` row formats plus `identified()` (`<id> [<status>] <title>`, the shape the graph commands share), one place
- `ticket-lookup.ts` — the ONE place an `IdResolution` becomes a user-facing failure; carries bash's two different wordings (`ticket_path`'s vs `dep tree`'s)
- `pager.ts` / `child-exit.ts` / `spawned-child.ts` — `show`'s `$TICKET_PAGER` handoff (TTY only) and the shared "adopt the child's exit code, 127 when the binary is missing" rule; `SpawnedChild` is the ONE place that policy lives, for `jq`, `$PAGER` and `$EDITOR` alike
- `terminal.ts` — `Terminal` (`[ -t 0 ]`, `[ -t 1 ]`, read stdin), injected via `CommandEnvironment`. WHY an interface: the terminal arms of `edit` and `add-note` are unreachable from BDD, so only a unit test can say "both streams are terminals"
- `store-resolver.ts` — bash `init_tickets_dir` semantics: `forReadCommand()`/`forWriteCommand()` require an existing dir, `forCreateCommand()` mkdir -p's it. `create` is the ONLY command allowed to, and bash does it BEFORE parsing args
- `command-environment.ts` / `program-name.ts` — the ambient process a command runs in: invoked program name (usage text interpolates it — `TICKET_INVOKED_AS`, never a hardcoded `ticket`), clock, new-id and default-assignee sources. `CommandEnvironment.forProcess()` is the one place the real environment is bound; tests pass their own
- `commands/status.ts` — `TicketStatusArgument.parsed` (the ONE place text becomes a `TicketStatus`); `STATUS_WRAPPERS` carries `start`/`close`/`reopen`; the pure change itself is core's `status-update.ts`
- `commands/add-note.ts` — the ONLY write that APPENDS bytes (`TicketStore.appendTo`) instead of rewriting through `save`, because bash used `>>` and a rename would replace a symlinked ticket with a regular file. The note layout is core's `ticket-note.ts`; `NoteText` is the argument/stdin/TTY choice
- `row-limit.ts` — `closed`'s `--limit=`; a plain count only (bash forwarded it to `head -n`)
- `jq.ts` — spawns the external `jq` for `query <filter>`; jq stays a real dependency, never reimplemented
- `cli-error.ts` — `CliError`; `main.ts` renders it (and core's `CorruptTicketFileError`) as `Error: <message>`, exit 1 (or the error's own `exitCode`). `UsageError` is the subclass for bash's un-prefixed `Usage: …` lines
- `exit-codes.ts` — every exit code in one place, including `128 + signal` for a signalled child
- `broken-pipe.ts` — node ignores SIGPIPE, so a closed stdout is turned into exit 141 here

**Deliberate divergences from the historical bash implementation** — the 20 numbered entries in `docs-internal/migration-to-ts-high-level.md` ("Deliberate divergences from bash"). ~14 comments in `src/`, `test/` and `features/steps/` cite them BY NUMBER, so the numbering is stable: never renumber, only append. Behavior changes there carry an owner approval id.

Data model: Filenames are title-based (e.g., `my-note.md`). The `id` field in frontmatter is the stable identifier. `title` is stored in frontmatter (double-quoted). No `# heading` for title in body.

Dependencies at runtime: **node**, **git** (repo-root resolution), plus bash/coreutils/`find` for the launcher. **npm** only when the launcher has to build. **jq** only for `query <jq-filter>`.

## Library API (npm)

The package publishes a library entry alongside the CLI bin (installed as `ticket`): `package.json` `exports` points at `dist-lib/index.js` (+ `.d.ts`), emitted by `npm run build:lib` (`tsc -p tsconfig.lib.json`, gitignored like every build output). `prepack` builds both the CLI bundle and `dist-lib/`, so `npm pack`/`npm publish` is self-contained; `npm` `files` ships only `dist-lib/`, `dist/ticket.mjs` and the docs — no sources, no launcher. `make build-lib` is a `make test` prerequisite so declaration-emit breakage surfaces in CI. Library behavior changes need unit tests in `test/ticket-manager.test.ts` (the BDD suite covers only the CLI surface).

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

### Distribution

**npm (`note-ticket`) is the ONLY place this package is published.** No Homebrew tap, no AUR, no other distro package — do not add references to any. The other supported install is a symlink into a git checkout, which builds on demand. The CLI is installed under ONE name: `ticket` (the `tk` shorthand is gone; it survives only in historical comments and CHANGELOG entries).

**`pkg/install-manifest.txt` is the single source of truth for what a complete install needs on disk.** `scripts/package-smoke.sh` and the launcher BDD's isolated tool copy (`features/steps/ticket_steps.py`) read it. Add a new top-level file the tool needs at runtime → add it there, nowhere else.

**`make package-smoke` (`scripts/package-smoke.sh`, also a CI step) is the guard on the COPIED-install shape**: it replays a copy into a read-only scratch prefix (prebuilt bundle, no `node_modules/`) and drives the tool through the installed symlink. WHY it exists separately from `make test`: every other gate drives a WRITABLE checkout, so none of them could catch an install that copies an incomplete tree — a launcher without its `src/` is dead on arrival, and that shipped once already. WHY a read-only prefix is the interesting case: the launcher cannot rebuild there (esbuild fails with `mkdir dist: permission denied`), so the bundle must be installed already built and `touch`ed last.

**npm publishing is a local, manual step** (`scripts/publish-npm.sh`, token from `$NPM_PUBLISH_TOKEN`) and is deliberately NOT part of the tag-triggered release workflow — see `docs-internal/how-to-publish-to-npm.md`. It bumps the version itself (**patch by default**, `minor`/`major`/`<x.y.z>`/`--no-bump` override) and commits that bump BEFORE uploading, so every published tarball corresponds to a commit; a dry run and any pre-commit failure revert the bump. `./publish_to_npm_with_version_bump.sh` at the repo root is a thin forwarder to it — the visible entry point, zero logic of its own.

### Release Flow

1. Update CHANGELOG.md: change `## [Unreleased]` to version + date
2. Commit and tag:
   ```bash
   git commit -am "release: v0.4.0"
   git tag v0.4.0
   git push && git push origin v0.4.0
   ```

### CI Publishing

The release workflow (`.github/workflows/release.yml`) creates the GitHub release with the changelog body — and nothing else. Publishing to npm stays local and manual (above).
