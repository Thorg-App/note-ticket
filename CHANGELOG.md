# Changelog

## [Unreleased]

### Added
- `status_updated_iso` field: ISO8601 timestamp set at creation and updated on every status change
- `closed_iso` field automatically set when ticket is closed, removed when reopened
- Ticket IDs now use `nid_` prefix and `_e` suffix (e.g. `nid_7f209dtd2styppry2w3uqlg8c_e`). Existing tickets are not affected.

- Nested subfolders under `_tickets/` are now supported for organizing tickets (e.g. `_tickets/backend/api/foo.md`). Move ticket files with `mv`; every command searches all nesting levels. New tickets are still created at the top level of `_tickets/`. Hidden directories (`.trash`, `.obsidian`, ...) are skipped; `ls` and `query` list tickets in byte-wise path order.

### Changed
- A `.md` file under `_tickets/` with no `id` frontmatter field is now a hard error naming the path (`Error: <path> has no 'id' frontmatter field`) instead of being silently omitted from every listing.
- A file whose frontmatter block cannot be read at all now says so (`Error: <path> has no YAML frontmatter block`) rather than blaming the `id` field. A CRLF file — still unsupported, since `---\r` is not the frontmatter fence — reports `Error: <path> frontmatter block is not parseable (CRLF line endings are not supported)` instead of claiming the `id` it visibly contains is missing.
- TypeScript port complete (strangler-fig): `ticket` is now a delegating shim. **Every** command it dispatches — `create`, `start`, `close`, `reopen`, `status`, `dep`, `undep`, `link`, `unlink`, `ls`/`list`, `ready`, `blocked`, `closed`, `show`, `edit`, `add-note`, `query`, `help` — runs from a Node bundle at `dist/ticket.mjs`. Requires `node` on PATH and `make build` from a source checkout. Removing a name from the `TS_COMMANDS` variable in `ticket` rolls that one command back to the bash implementation, which is still in the file.
- A missing `$EDITOR` binary now reports `Error: <editor>: command not found` (exit 127) instead of the shell's own message, matching what `query`'s `jq` and `show`'s pager already do. `$EDITOR` is still used UNSPLIT, so `EDITOR="code -w"` fails exactly as it did under bash.
- `undep` and `unlink` now match ids as whole array elements. A `deps: [t-1, t-111]` minus `t-1` used to become `[11]`, because removal was a substring `sed`.
- `dep`, `undep` and `link` now create a missing `deps:`/`links:` field instead of failing. `dep` on a ticket with no `deps:` line used to exit 1 printing nothing at all, and `link` counted 0 and could report the misleading `All links already exist`.
- `dep`, `undep`, `link` and `unlink` now edit only the frontmatter block. A `links:`-shaped line in the ticket BODY used to be rewritten too, making `tk link a b` report 3 added links.
- `tk link a a` is now refused (`Error: nothing to link: every id resolves to ticket <id>`, exit 1); it used to link a ticket to itself and report `Added 1 link(s) between 2 tickets`. A self-*dependency* is still recorded, because `dep cycle` reports it as a graph error.
- An empty ticket id no longer resolves on the write path either. In a one-ticket repo, `tk close ""` — in practice `tk close "$UNSET_VAR"` — used to close that ticket.
- Commands now reject a flag given without a value (`Error: option '--design' requires a value`) instead of aborting with an internal bash `unbound variable` message.
- An empty ticket id no longer resolves to a ticket. `tk show ""` — in practice `tk show "$UNSET_VAR"` — used to print an arbitrary ticket in a one-ticket repo, because awk's `index(s, "")` is 1; it now reports `Error: ticket '' not found` and exits 1.
- `dep tree <full-id>` now resolves where it used to report `ambiguous ID`. The root goes through the shared id resolver (an exact match beats a partial one, input is trimmed) instead of a substring scan, so a full id contained in another ticket's id is reachable. Partial ids still work.
- A missing pager binary now reports `Error: <pager>: command not found` (exit 127) instead of the shell's `./ticket: line NNN: ...`.
- `ls`, `ready` and `blocked` now reject a `-a`/`-T` given without a value (`Error: option '-a' requires a value`) instead of aborting with an internal bash `unbound variable` message. Output formats and filtering are unchanged.
- `query <filter>` with no `jq` installed now reports `Error: jq: command not found` plus `Install jq, or run 'query' without a filter`, instead of the shell's `./ticket: line NNN: jq: command not found`. The exit code is unchanged (127), and `query` without a filter still needs no jq.
- `closed` now rejects a `--limit=` that is not a plain count (`Error: --limit must be a whole number of rows, got 'abc'`). The value used to be handed to `head -n`, which silently accepted `--limit=2k` as 2048, `--limit=-1` as "all but the last one", and reported `head: invalid number of lines` for a typo. `--limit=0` now prints nothing and exits 0; it used to exit 141 or 0 depending on a race between `awk` and `head`.

### Fixed
- `query` now escapes control characters, so its JSONL is always valid JSON. A tab in a title (`tk create $'a\tb'`) used to be emitted raw, which made `query` unparseable and `query <filter>` fail inside jq with `Invalid string: control characters ... must be escaped`
- `ready` and `blocked` no longer truncate a title at a `|` character (e.g. `tk create "Ship it | phase 2"` listed as `Ship it `); `blocked` also no longer prints the rest of such a title where the blocker list belongs
- Awk frontmatter parsers no longer re-enter frontmatter parsing when body contains `---` horizontal rules
- `ls`, `ready`, `blocked`, `closed`, `query`, `dep tree`, and `dep cycle` exited with code 2 and an awk error when no ticket files existed; they now exit 0 with no output
- `closed` no longer mangles paths containing spaces
- `closed` orders a symlinked ticket file by the link's own modification time, matching `ls -t` (a listing containing symlinks could come out in the wrong order)
- `dep cycle` now reports every cycle exactly once. It used to abort its search at the first cycle found, which both printed walks that were not cycles and missed real ones
- `show` lists a duplicate dependent once under `## Blocking`; a ticket naming the target twice in its `deps` used to be printed once per entry
- A ticket file (or tickets directory) the OS refuses to read, write, append to, list or create now fails like every other error — `Error: cannot write <path>: permission denied (EACCES)`, exit 1 — instead of dumping a node stack trace naming an internal temp file

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
