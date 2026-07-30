# Changelog

## [Unreleased]

### Added
- `status_updated_iso` field: ISO8601 timestamp set at creation and updated on every status change
- `closed_iso` field automatically set when ticket is closed, removed when reopened
- Ticket IDs now use `nid_` prefix and `_e` suffix (e.g. `nid_7f209dtd2styppry2w3uqlg8c_e`). Existing tickets are not affected.

- Nested subfolders under `_tickets/` are now supported for organizing tickets (e.g. `_tickets/backend/api/foo.md`). Move ticket files with `mv`; every command searches all nesting levels. New tickets are still created at the top level of `_tickets/`. Hidden directories (`.trash`, `.obsidian`, ...) are skipped; `ls` and `query` list tickets in byte-wise path order.

### Changed
- A `.md` file under `_tickets/` with no `id` frontmatter field is now a hard error naming the path (`Error: <path> has no 'id' frontmatter field`) instead of being silently omitted from every listing. Live for `ls`/`list`, `ready`, `blocked`, `closed` and `query`; the remaining enumerating commands follow as they are delegated to the TypeScript core.
- TypeScript port started (strangler-fig): `ticket` now delegates the commands listed in its `TS_COMMANDS` variable to a Node bundle at `dist/ticket.mjs`; `help`, `ls`/`list`, `ready`, `blocked`, `closed` and `query` are delegated so far. Requires `node` on PATH and `make build` from a source checkout. Removing a name from `TS_COMMANDS` rolls that command back to bash.
- `ls`, `ready` and `blocked` now reject a `-a`/`-T` given without a value (`Error: option '-a' requires a value`) instead of aborting with an internal bash `unbound variable` message. Output formats and filtering are unchanged.
- `query <filter>` with no `jq` installed now reports `Error: jq: command not found` plus `Install jq, or run 'query' without a filter`, instead of the shell's `./ticket: line NNN: jq: command not found`. The exit code is unchanged (127), and `query` without a filter still needs no jq.
- `closed` now rejects a `--limit=` that is not a plain count (`Error: --limit must be a whole number of rows, got 'abc'`). The value used to be handed to `head -n`, which silently accepted `--limit=2k` as 2048, `--limit=-1` as "all but the last one", and reported `head: invalid number of lines` for a typo. `--limit=0` now prints nothing and exits 0; it used to exit 141 or 0 depending on a race between `awk` and `head`.

### Fixed
- `query` now escapes control characters, so its JSONL is always valid JSON. A tab in a title (`tk create $'a\tb'`) used to be emitted raw, which made `query` unparseable and `query <filter>` fail inside jq with `Invalid string: control characters ... must be escaped`
- `ready` and `blocked` no longer truncate a title at a `|` character (e.g. `tk create "Ship it | phase 2"` listed as `Ship it `); `blocked` also no longer prints the rest of such a title where the blocker list belongs
- Awk frontmatter parsers no longer re-enter frontmatter parsing when body contains `---` horizontal rules
- `ls`, `ready`, `blocked`, `closed`, `query`, `dep tree`, and `dep cycle` exited with code 2 and an awk error when no ticket files existed; they now exit 0 with no output
- `closed` no longer mangles paths containing spaces
- `query <jq-filter> | head` (any short reader) now exits 141, as `ls | head` does, instead of 1
- `closed` orders a symlinked ticket file by the link's own modification time, matching `ls -t` (a listing containing symlinks could come out in the wrong order)

### Removed
- Removed `migrate-beads` command
- Removed plugin system (`tk-<cmd>` / `ticket-<cmd>` dispatch, `super` command, plugin help listing)
- Removed multi-package distribution (`ticket-extras`, individual plugin packages); only `ticket-core` remains

### Changed
- **BREAKING**: Default tickets directory changed from `.tickets` to `_tickets` so tools like `fd` and `rg` do not ignore it by default. Use `TICKETS_DIR=.tickets` to keep the old behavior.
- Tickets are now anchored to the git repository root (`<repo-root>/_tickets`), resolved via `git rev-parse --show-toplevel`. Commands work from any subdirectory of the repo and no longer require submodule setup. Running outside a git repository errors unless `TICKETS_DIR` is set. `git` is now a required dependency.
- Renamed `created` frontmatter field to `created_iso` for clarity
- Ticket filenames are now derived from the title (e.g., `my-ticket-title.md`) instead of the ID
- Ticket IDs are now 25-character random lowercase alphanumeric strings stored in frontmatter
- Title is now stored in YAML frontmatter (`title: "..."`) instead of as a `# heading` in body
- `create` command outputs JSONL (with id, title, full_path, and all fields) instead of just the ID
- `query` command always includes `full_path` in output (removed `--include-full-path` flag)
- ID resolution now searches frontmatter `id:` fields instead of matching filenames

## [0.3.2] - 2026-02-03

### Fixed
- Ticket ID lookup now trims leading/trailing whitespace (fixes issue with AI agents passing extra spaces)

## [0.3.1] - 2026-01-28

### Added
- `list` command alias for `ls`
- `TICKET_PAGER` environment variable for `show` command (only when stdout is a TTY; falls back to `PAGER`)

### Changed
- Walk parent directories to find `.tickets/` directory, enabling commands from any subdirectory
- Ticket ID suffix now uses full alphanumeric (a-z0-9) instead of hex for increased entropy

### Fixed
- `dep` command now resolves partial IDs for the dependency argument
- `undep` command now resolves partial IDs and validates dependency exists
- `unlink` command now resolves partial IDs for both arguments
- `create --parent` now validates and resolves parent ticket ID
- `generate_id` now uses 3-char prefix for single-segment directory names (e.g., "plan" → "pla" instead of "p")

## [0.3.0] - 2026-01-18

### Added
- Support `TICKETS_DIR` environment variable for custom tickets directory location
- `dep cycle` command to detect dependency cycles in open tickets
- `add-note` command for appending timestamped notes to tickets
- `-a, --assignee` filter flag for `ls`, `ready`, `blocked`, and `closed` commands
- `--tags` flag for `create` command to add comma-separated tags
- `-T, --tag` filter flag for `ls`, `ready`, `blocked`, and `closed` commands

## [0.2.0] - 2026-01-04

### Added
- `--parent` flag for `create` command to set parent ticket
- `link`/`unlink` commands for symmetric ticket relationships
- `show` command displays parent title and linked tickets

## [0.1.1] - 2026-01-02

### Fixed
- `edit` command no longer hangs when run in non-TTY environments

## [0.1.0] - 2026-01-02

Initial release.
