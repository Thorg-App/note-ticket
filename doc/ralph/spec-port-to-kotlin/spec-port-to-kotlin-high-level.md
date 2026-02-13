# Port Ticket CLI from Bash to Kotlin

## Problem Statement
The `ticket` CLI (~1500 lines of bash) has grown complex with platform-specific workarounds (BSD vs GNU sed, AWK-heavy operations). Porting to Kotlin JVM provides type safety, cross-platform consistency, testable architecture, and integration with the asgard ecosystem's structured logging and file abstractions.

## Goals
- Port all `ticket` CLI commands to Kotlin JVM with identical user-facing behavior
- Leverage the asgard ecosystem (`asgardCore` file/YAML/logging utilities)
- Maintain a thin bash wrapper (`ticket`) that delegates to the Kotlin JAR
- Add Kotlin unit tests (AsgardDescribeSpec, BDD style) alongside existing BDD safety net
- Cross-platform: Windows, macOS, Linux

## Non-Goals (Out of Scope)
- Plugin/super mechanism (removed from project; clean up README references)
- New features beyond what the bash script already does
- Modifying existing BDD tests (except if obviously broken behavior is discovered)
- Modifying `bash_ticket` (backup copy of original script)
- Changing the `.tickets/` directory format or frontmatter schema

## Solution Overview
Create a new Kotlin JVM module at `source/libraries/kotlin-mp/kotlin-jvm/ticket` (package `com.asgard.ticket`) that implements all `ticket` commands. Build a fat JAR (ShadowJar). The existing `ticket` bash script becomes a thin wrapper that checks for Java, locates the JAR, and passes CLI arguments through. The bash wrapper retains jq piping for `query` backward compatibility.

## User-Facing Behavior
All existing behaviors are PRESERVED. The 10 BDD feature files define the canonical behavior. Below are the key behavioral categories (not exhaustive—BDD tests are authoritative):

- **Behavior: Create Ticket**
  - GIVEN a .tickets/ directory exists (or will be auto-created)
  - WHEN user runs `tk create "Title" [-d desc] [--design X] [--acceptance X] [-t type] [-p priority] [-a assignee] [--external-ref ref] [--parent id] [--tags t1,t2]`
  - THEN a markdown file is created with YAML frontmatter containing all fields
  - AND a JSON line is printed to stdout with `id` and `full_path`

- **Behavior: Status Transitions**
  - GIVEN a ticket exists
  - WHEN user runs `tk start|close|reopen|status <id> [status]`
  - THEN the ticket's `status` field is updated
  - AND `closed_iso` is set/removed as appropriate

- **Behavior: Dependency Management**
  - GIVEN tickets exist
  - WHEN user runs `tk dep <id> <dep-id>` or `tk undep <id> <dep-id>`
  - THEN the `deps` array is updated (no duplicates, validated)

- **Behavior: Symmetric Linking**
  - GIVEN tickets exist
  - WHEN user runs `tk link <id1> <id2> [id3...]`
  - THEN all tickets' `links` arrays are updated symmetrically

- **Behavior: Listing with Filters**
  - GIVEN tickets exist
  - WHEN user runs `tk ls|ready|blocked|closed [--status=X] [-a X] [-T X] [--limit=N]`
  - THEN filtered, sorted output is shown matching the command semantics

- **Behavior: Dependency Tree**
  - GIVEN tickets with dependencies exist
  - WHEN user runs `tk dep tree [--full] <id>`
  - THEN an ASCII tree visualization is displayed

- **Behavior: Cycle Detection**
  - GIVEN tickets with dependencies exist
  - WHEN user runs `tk dep cycle`
  - THEN all unique dependency cycles are reported (or "No cycles found")

- **Behavior: Show Ticket**
  - GIVEN a ticket exists
  - WHEN user runs `tk show <id>`
  - THEN the ticket content is displayed with relationship annotations (blockers, blocking, children, linked)

- **Behavior: Query (JSONL)**
  - GIVEN tickets exist
  - WHEN user runs `tk query [jq-filter]`
  - THEN JSONL output is produced (one JSON object per line, includes `full_path`)
  - AND if jq-filter is provided, bash wrapper pipes through jq

- **Error: Ticket Not Found**
  - GIVEN an ID that doesn't match any ticket
  - WHEN user runs any command with that ID
  - THEN error is printed to stderr and exit code is 1

- **Error: Ambiguous ID**
  - GIVEN a partial ID matching multiple tickets
  - WHEN user runs any command with that partial ID
  - THEN error is printed to stderr and exit code is 1

## Key Decisions
| Decision | Choice | Rationale |
|----------|--------|-----------|
| Package name | `com.asgard.ticket` | Asgard ecosystem, no thorgCore dependency needed |
| Module location | `kotlin-jvm/ticket` | Follows existing kotlin-jvm project pattern |
| Entry point | Single main class dispatching all subcommands | Mirrors bash script structure, simpler JAR invocation |
| CLI parsing | JCommander | Already in version catalog, used by thorgDevCli |
| YAML parsing | `YamlMapper` from asgardCore (SnakeYAML 2.2) | Reuse existing, order-preserving, cross-platform |
| JSON output | `AsgardJson` (Jackson) from asgardCoreJVM | Reuse existing, well-configured ObjectMapper |
| File I/O | `File`/`Directory` from asgardCore | Cross-platform, rich API, consistent with ecosystem |
| Logging | `Out`/`OutFactory` with custom `ValType`s | Structured logging per asgard conventions |
| Fat JAR | ShadowJar (already in build-logic plugin) | Single JAR for easy distribution |
| Frontmatter handling | Custom split/rejoin using YamlMapper | Can't depend on thorgCore's FrontMatterProcessor |
| Query simplification | Kotlin outputs JSONL only; bash wrapper pipes to jq | Backward compatible, simpler Kotlin code |
| ID generation | Custom 25-char lowercase alphanumeric | Must match existing bash behavior exactly |
| Bash wrapper | Thin script checking for java, invoking JAR | Preserves `ticket`/`tk` CLI interface for consumers |

## Key Types & Interfaces
| Type/Interface | Purpose | Location | Key Fields/Methods |
|----------------|---------|----------|-------------------|
| `Ticket` | Immutable ticket data model | `com.asgard.ticket.model` | id, title, status, deps, links, type, priority, assignee, tags, parent, externalRef, createdIso, closedIso |
| `TicketFrontMatter` | YAML frontmatter read/write | `com.asgard.ticket.frontmatter` | parse(fileContent), serialize(ticket), splitFrontMatterAndBody(text) |
| `TicketRepository` | File-based ticket storage | `com.asgard.ticket.repository` | findById(id), findByPartialId(partialId), listAll(), save(ticket, body), delete(id) |
| `TicketIdGenerator` | 25-char random ID creation | `com.asgard.ticket.model` | generate(): String |
| `FileNameGenerator` | Title-to-filename with collision handling | `com.asgard.ticket.repository` | generateFilename(title, existingFiles): String |
| `TicketsDirectoryResolver` | Find .tickets/ dir (parent walk + .git boundary) | `com.asgard.ticket.repository` | resolve(startDir): Directory? |
| `CommandDispatcher` | CLI argument parsing and routing | `com.asgard.ticket.cli` | dispatch(args): Int (exit code) |

## Components / Architecture
```
CLI Layer (com.asgard.ticket.cli)
  └─ CommandDispatcher → parses args (JCommander), routes to command handlers
  └─ Command handlers (CreateCommand, ShowCommand, DepCommand, etc.)
       └─ Each returns exit code, writes to stdout/stderr

Domain Layer (com.asgard.ticket.model)
  └─ Ticket data class (immutable)
  └─ TicketIdGenerator
  └─ TicketStatus enum, TicketType enum

Repository Layer (com.asgard.ticket.repository)
  └─ TicketRepository (find, list, save, update field)
  └─ TicketFrontMatter (parse/serialize YAML frontmatter)
  └─ FileNameGenerator (title → slug with collision handling)
  └─ TicketsDirectoryResolver (find .tickets/ directory)

Infrastructure (from asgard ecosystem)
  └─ File/Directory (asgardCore) - file I/O
  └─ YamlMapper (asgardCore) - YAML parsing
  └─ AsgardJson (asgardCoreJVM) - JSON serialization
  └─ Out/OutFactory (asgardCore) - structured logging
```

## Approved Behavior Changes
| Existing Behavior | Approved Change | Approval Note |
|-------------------|-----------------|---------------|
| README documents plugin/super mechanism | Remove plugin/super documentation from README and help text | Engineer approved: "SKIP Plugins, we have purposedly removed the plugin system" |

## Success Criteria
- [ ] All 10 BDD feature files pass against the new Kotlin-backed `ticket` CLI
- [ ] Kotlin module builds and produces a fat JAR via ShadowJar
- [ ] Kotlin unit tests (AsgardDescribeSpec) cover all commands
- [ ] Bash wrapper correctly delegates to Kotlin JAR
- [ ] Cross-platform: builds and runs on Windows, macOS, Linux
- [ ] README cleaned of plugin/super references
- [ ] CLAUDE.md created for the new module
- [ ] **INVARIANT**: Existing user-facing behaviors NOT listed in "Approved Behavior Changes" SHALL remain unchanged
- [ ] **INVARIANT**: Tests that solidify existing user behavior SHALL NOT be deleted or modified without explicit approval

## Phases Overview
| Phase | Name | Summary |
|-------|------|---------|
| 01 | Module Bootstrap + Core Infrastructure | Create Kotlin project, build config, core data model, YAML frontmatter, ID/filename generation, directory resolution, Out wiring, unit tests |
| 02 | CRUD & Status Commands | Command dispatcher, create/show/edit/add-note/status/start/close/reopen/help commands, JSONL output, pager support, unit tests |
| 03 | Relationships & Listing Commands | dep/undep/tree/cycle, link/unlink, ls/ready/blocked/closed/query, filtering, sorting, unit tests |
| 04 | Integration & Bash Wrapper | Wire bash to JAR, run all BDD tests, fix discrepancies, README cleanup, CLAUDE.md, CHANGELOG |

See individual task file(s) in `./tasks/todo/` for details.

## Open Questions (if any)
- JCommander vs Clikt for CLI parsing: JCommander is in version catalog and used by thorgDevCli. Can be decided in Phase 02 during detailed planning.
