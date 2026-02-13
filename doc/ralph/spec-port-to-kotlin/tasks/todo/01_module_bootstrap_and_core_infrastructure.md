# Phase 01: Module Bootstrap + Core Infrastructure

## Objective
Create the Kotlin JVM module with build infrastructure and implement all foundational components: data model, YAML frontmatter handling, ID generation, filename generation, ticket resolution, and directory discovery. This phase produces a buildable, testable foundation that all subsequent phases build upon.

## Prerequisites
- None (first phase)

## Scope
### In Scope
- Kotlin project creation at `source/libraries/kotlin-mp/kotlin-jvm/ticket`
- Build configuration: `build.gradle.kts` with asgardCore, asgardCoreJVM, asgardTestTools dependencies
- Include in `settings.gradle.kts` as `kotlin-jvm:ticket`
- ShadowJar configuration for fat JAR
- Application plugin with main class placeholder
- CLAUDE.md for the new module (based on Kotlin MP CLAUDE.md patterns)
- `Ticket` data class (immutable) with all frontmatter fields
- `TicketStatus` enum: `open`, `in_progress`, `closed`
- `TicketType` enum: `bug`, `feature`, `task`, `epic`, `chore`
- `TicketFrontMatter`: parse YAML frontmatter from file content, serialize ticket to frontmatter
  - Uses `YamlMapper` from asgardCore
  - Custom frontmatter split/rejoin (split on `---` delimiters, parse YAML between them)
  - Handle arrays for `deps`, `links`, `tags` (format: `[item1, item2]`)
  - Order-preserving field output
- `TicketIdGenerator`: 25-char random lowercase alphanumeric string
- `FileNameGenerator`: title → slug filename with collision handling
  - Lowercase, spaces → hyphens, strip non-alnum except hyphens, collapse hyphens, truncate to 200 chars
  - Collision suffix: `-1`, `-2`, etc.
- `TicketRepository`: file-based storage
  - `findByExactId(id)`, `findByPartialId(partialId)` — single-pass scan of .md files
  - `resolveTicketPath(idOrPartial)` — returns File or throws (not found / ambiguous)
  - `listAllFiles()` — list all .md files in tickets dir
  - `saveNewTicket(ticket, body)` — create file with frontmatter + body
  - `updateField(file, field, value)` — update single YAML field in-place
  - `removeField(file, field)` — remove YAML field
- `TicketsDirectoryResolver`: find `.tickets/` directory
  - Walk parent directories from `$PWD`
  - Stop at `.git` boundary (file or directory — supports submodules)
  - Respect `TICKETS_DIR` env var override
  - Auto-create `.tickets/` for write commands
- Out/OutFactory wiring: `ConsoleOutToErrorStreamFactory` for CLI stderr logging
- Custom `ValType`s for ticket domain: `TICKET_ID`, `TICKET_STATUS` (or reuse appropriate existing types)
- Comprehensive unit tests using AsgardDescribeSpec with GIVEN/WHEN/THEN naming

### Out of Scope
- CLI argument parsing and command dispatch (Phase 02)
- Any command implementations (Phase 02-03)
- Bash wrapper (Phase 04)
- Integration testing against BDD tests (Phase 04)

## Implementation Guidance

### Project Setup
- Use `new_jvm_library.sh` as starting point or manually follow the template at `kotlin-jvm/.template/template-for-jvm-lib/`
- Build file should use `buildlogic.kotlin-jvm` plugin
- Dependencies:
  ```
  implementation(project(":asgardCore"))
  implementation(project(":kotlin-jvm:asgardCoreJVM"))
  testImplementation(project(":asgardTestTools"))
  ```
- Add `application` plugin with main class (e.g., `com.asgard.ticket.cli.TicketMainKt`)
- Configure ShadowJar like thorgDevCli

### Data Model
- Study the bash script's frontmatter structure carefully. Fields:
  - `id`, `title` (double-quoted), `status`, `type`, `priority` (Int 0-4), `assignee`, `deps` (array), `links` (array), `tags` (array), `created_iso`, `closed_iso`, `external-ref`, `parent`
- `Ticket` data class should use Kotlin types: `List<String>` for arrays, `Int` for priority, enums for status/type

### Frontmatter Handling
- Use `YamlMapper` from asgardCore to parse YAML between `---` delimiters
- Write custom `splitFrontMatterAndBody(text: String)` that:
  1. Finds first `---` line
  2. Finds second `---` line
  3. Returns (yamlContent, bodyContent)
- Serialize: rebuild `---\n{yaml}\n---\n{body}` maintaining field order
- Important: the bash script stores `title` double-quoted in YAML (e.g., `title: "My Title"`). Preserve this behavior.
- Arrays use YAML flow style: `deps: [id1, id2]`

### ID Generation
- Must produce exactly 25 chars from charset `[a-z0-9]`
- Use `kotlin.random.Random` with `SecureRandom` seed for cross-platform

### Filename Generation
- Mirror bash `title_to_filename()` exactly:
  ```
  1. lowercase
  2. spaces → hyphens
  3. remove non-[a-z0-9-]
  4. collapse consecutive hyphens
  5. trim leading/trailing hyphens
  6. truncate to 200 chars, re-trim trailing hyphen
  7. if empty → "untitled"
  8. collision: try slug.md, slug-1.md, slug-2.md...
  ```

### Directory Resolution
- Mirror bash `find_tickets_dir()` exactly:
  ```
  1. If TICKETS_DIR env var set → use it
  2. Walk from PWD upward:
     - If .tickets/ exists → return it
     - If .git exists (file or dir) → stop (repo boundary)
  3. Check /.tickets at root
  4. Not found → error
  ```

### Key Asgard Utilities to Use
- `file(path)`, `directory(path)` — factory functions for File/Directory
- `Directory.listFiles()` — list .md files
- `File.readText()`, `File.writeText()` — file I/O
- `File.lastModifiedEpochMillis()` — for mtime sorting (Phase 03)
- `yamlMapper()` — get platform YAML mapper
- `formatMillisToUtcIso8601(currentMillis())` — ISO date generation
- `envNullable("TICKETS_DIR")` — env var reading
- `Directory.workingDir()` — current working directory
- `FilePath.parent()` — parent directory traversal
- `verify()` — precondition checks
- `splitLines()` — cross-platform line splitting

## Acceptance Criteria
- [ ] Kotlin project builds successfully (`./gradlew :kotlin-jvm:ticket:build`)
- [ ] ShadowJar produces a runnable fat JAR
- [ ] CLAUDE.md exists for the module with appropriate patterns documented
- [ ] `Ticket` data class correctly represents all frontmatter fields
- [ ] `TicketFrontMatter` correctly parses and serializes frontmatter (round-trip fidelity)
- [ ] `TicketIdGenerator` produces 25-char lowercase alphanumeric IDs
- [ ] `FileNameGenerator` matches bash `title_to_filename()` behavior exactly (including collisions)
- [ ] `TicketRepository` resolves tickets by exact ID, partial ID, handles not-found and ambiguous cases
- [ ] `TicketsDirectoryResolver` finds `.tickets/` via parent walk, respects `TICKETS_DIR`, stops at `.git`
- [ ] All unit tests pass using AsgardDescribeSpec
- [ ] Out/OutFactory is wired and producing structured logs
- [ ] Tests pass

## Notes
- The bash script at `/usr/local/workplace/thorg-root/submodules/note-ticket/ticket` is the reference implementation. Read it carefully when implementing each component.
- `bash_ticket` is the backup copy — do NOT modify it.
- Pipe build/test output to `.tmp/` files to avoid context window waste.
- Commit at milestones during this phase (e.g., after project setup, after data model, after repository).
