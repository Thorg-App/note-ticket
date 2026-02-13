# Phase 02: CRUD & Status Commands

## Objective
Implement the command dispatcher (single main entry point) and the core CRUD/status commands: `create`, `show`, `edit`, `add-note`, `status`, `start`, `close`, `reopen`, and `help`. After this phase, basic ticket lifecycle management works end-to-end via the Kotlin JAR.

## Prerequisites
- Phase 01 complete: core data model, frontmatter handling, repository, directory resolution all working

## Scope
### In Scope
- `CommandDispatcher`: single main entry point that parses the first argument as subcommand and routes to handler
- CLI argument parsing via JCommander (or Clikt — decide during detailed planning; JCommander is in version catalog)
- **create** command with all flags:
  - Positional: title
  - `-d, --description` — description text
  - `--design` — design notes
  - `--acceptance` — acceptance criteria
  - `-t, --type` — ticket type (default: task)
  - `-p, --priority` — priority 0-4 (default: 2)
  - `-a, --assignee` — assignee (default: git user.name)
  - `--external-ref` — external reference
  - `--parent` — parent ticket ID (resolved and validated)
  - `--tags` — comma-separated tags
  - Output: JSON line to stdout with `id` and `full_path`
- **show** command:
  - Displays ticket file content
  - Scans other tickets to discover relationships: blockers (deps not closed), blocking (other tickets depending on this one that aren't closed), children (tickets with this as parent), linked (from links array)
  - Pager support via `TICKET_PAGER` or `PAGER` env var (when output is terminal)
- **edit** command: opens ticket file in `$EDITOR` (default: `vi`)
- **add-note** command:
  - Appends timestamped note to ticket body
  - Creates `## Notes` section if missing
  - Reads note text from argument or stdin
  - Format: `\n**ISO_TIMESTAMP**\n\nNOTE_TEXT\n`
- **status** command: set status to any valid value (open, in_progress, closed)
- **start** command: shorthand for `status <id> in_progress`
- **close** command: sets status to closed, adds `closed_iso` field
- **reopen** command: sets status to open, removes `closed_iso` field
- **help** command: display usage text (match bash script's help output, minus plugin references)
- Exit codes: 0 for success, 1 for error
- Error output to stderr with `Error: ` prefix
- Unit tests for all commands using AsgardDescribeSpec

### Out of Scope
- Dependency commands: dep, undep, dep tree, dep cycle (Phase 03)
- Link commands: link, unlink (Phase 03)
- Listing commands: ls, ready, blocked, closed (Phase 03)
- Query command (Phase 03)
- Bash wrapper integration (Phase 04)

## Implementation Guidance

### Command Dispatcher Pattern
- Single `main(args: Array<String>)` in `com.asgard.ticket.cli.TicketMainKt`
- First arg = subcommand name, remaining args passed to command handler
- Each command handler: takes args + TicketRepository + Out → returns exit code (Int)
- Wire up OutFactory at top level (ConsoleOutToErrorStreamFactory for CLI)
- Print errors to stderr, data output to stdout

### Create Command Details
Study the bash `cmd_create()` carefully. Key behaviors:
- `ensure_dir()` — creates `.tickets/` if needed
- Default assignee from `git config user.name` (or empty if not in git repo)
- Title extraction from positional args after option parsing
- Body construction: optional description, `## Design`, `## Acceptance Criteria` sections
- Output: `{"id":"...","title":"...","status":"open",...,"full_path":"..."}` (compact JSON line)
  - Uses `_file_to_jsonl()` internally — the Kotlin version should use `AsgardJson` to serialize

### Show Command Details
Study the bash `cmd_show()`. Key relationship discovery:
- Scans ALL ticket files to find:
  - **Blockers**: tickets in this ticket's deps that aren't closed
  - **Blocking**: other tickets that have this ticket in their deps AND aren't closed
  - **Children**: tickets where `parent` field matches this ticket's ID
  - **Linked**: tickets in this ticket's links array
- Appends relationship info as comments after the file content
- Respects `TICKET_PAGER`/`PAGER` env var: if set and stdout is a terminal, pipe through pager

### Git User Name
- For default assignee: run `git config user.name` and capture output
- If not in a git repo or command fails, use empty string

### Terminal Detection (for Pager)
- Use `System.console() != null` or check if stdout is a tty
- If tty and pager is set, launch pager process and pipe output

## Acceptance Criteria
- [ ] `CommandDispatcher` routes to correct command handler based on first argument
- [ ] Unknown commands print error and exit 1
- [ ] `create` produces correct frontmatter with all fields, outputs JSON line
- [ ] `create` handles all flags correctly (type, priority, assignee, tags, parent, external-ref, design, acceptance)
- [ ] `create` default assignee comes from `git config user.name`
- [ ] `show` displays ticket content with relationship annotations
- [ ] `edit` launches `$EDITOR` on the ticket file
- [ ] `add-note` appends timestamped note (from arg or stdin), creates `## Notes` if missing
- [ ] `status` validates status values and updates field
- [ ] `start`/`close`/`reopen` correctly transition status and manage `closed_iso`
- [ ] `help` displays usage text without plugin/super references
- [ ] Errors go to stderr with `Error: ` prefix
- [ ] Exit code 0 on success, 1 on error
- [ ] Unit tests cover all commands using AsgardDescribeSpec
- [ ] Tests pass

## Notes
- Match the bash script's stdout/stderr output as closely as possible — the BDD tests assert on exact output patterns.
- For `create` JSON output: match the field names and format from `_file_to_jsonl()` in the bash script.
- The `show` command's relationship annotations must match the bash format exactly (the BDD tests check these).
- Read the relevant BDD feature files (`ticket_creation.feature`, `ticket_status.feature`, `ticket_show.feature`, `ticket_edit.feature`, `ticket_notes.feature`) to understand exact expected output formats.
