# Phase 03: Relationships & Listing Commands

## Objective
Implement all remaining commands: dependency management (dep/undep/tree/cycle), symmetric linking (link/unlink), listing commands (ls/ready/blocked/closed), and the query command (JSONL output). After this phase, all commands are implemented in Kotlin.

## Prerequisites
- Phase 01 complete: core infrastructure
- Phase 02 complete: command dispatcher, CRUD commands, status commands

## Scope
### In Scope

#### Dependency Commands
- **dep add** (`tk dep <id> <dep-id>`): add dependency, no duplicates, both IDs validated
- **undep** (`tk undep <id> <dep-id>`): remove dependency, clean up empty array
- **dep tree** (`tk dep tree [--full] <id>`): recursive ASCII tree visualization
  - Without `--full`: depth-deduplication (only shows deepest path per node)
  - With `--full`: shows complete tree (cycles detected, not infinite)
  - Format: box-drawing characters (`├──`, `└──`, `│`)
  - Shows: `ID [status] title` per node
- **dep cycle** (`tk dep cycle`): DFS-based cycle detection
  - 3-color marking: white→gray→black
  - Cycle normalization: rotate to start from minimum ID to deduplicate
  - Output: list of unique cycles with member details, or "No cycles found"

#### Link Commands
- **link** (`tk link <id1> <id2> [id3...]`): symmetric linking (2+ tickets)
  - Updates ALL tickets so each links to all others
  - No duplicates in links arrays
  - Output: "Added N link(s) between M tickets"
- **unlink** (`tk unlink <id1> <id2>`): remove symmetric link from both tickets

#### Listing Commands
- **ls/list** (`tk ls [--status=X] [-a X] [-T X]`):
  - Filter by status, assignee, tag
  - Output format: `ID [status] - title <- [deps]` (deps shown if non-empty)
- **ready** (`tk ready [-a X] [-T X]`):
  - Active tickets (open/in_progress) with ALL deps closed
  - Sorted by priority (ascending: 0 first), then by ID
  - Output format: `ID [Pp][status] - title`
- **blocked** (`tk blocked [-a X] [-T X]`):
  - Active tickets with ANY dep not closed
  - Sorted by priority (ascending), then by ID
  - Output format: `ID [Pp][status] - title <- [open_blocker1, open_blocker2]`
  - Only shows open/in_progress blockers (not closed deps)
- **closed** (`tk closed [--limit=N] [-a X] [-T X]`):
  - Recently closed tickets sorted by file mtime (most recent first)
  - Default limit: 20, scans 100 most recent then limits
  - Output format: `ID [status] - title`

#### Query Command
- **query** (`tk query [jq-filter]`):
  - Outputs JSONL: one compact JSON object per line for each ticket
  - Each object includes: all frontmatter fields + `full_path` (absolute path)
  - JSONL field names must match bash `_file_to_jsonl()` output exactly
  - In Kotlin: just output JSONL (no jq processing — bash wrapper handles that)

#### Shared
- Filtering logic: `--status`, `-a/--assignee`, `-T/--tag` parameters across ls/ready/blocked/closed
- Tag filtering: check if requested tag exists in ticket's tags array
- Unit tests for all commands using AsgardDescribeSpec

### Out of Scope
- Bash wrapper integration (Phase 04)
- BDD test verification (Phase 04)

## Implementation Guidance

### Dependency Tree Algorithm
Study the bash `cmd_dep_tree()` carefully. Key aspects:
- Two passes: (1) calculate max depth per node, (2) render with indentation
- Cycle detection via path tracking (prevents infinite loops)
- `--full` shows all branches; without it, deduplicates nodes (shows only the deepest occurrence)
- Box-drawing: `├── ` for intermediate children, `└── ` for last child, `│   ` for continuation
- Root node has no box-drawing prefix

### Cycle Detection Algorithm
Study the bash `cmd_dep_cycle()`:
- Build adjacency lists from all non-closed tickets
- DFS with 3-color marking: white(0)=unvisited, gray(1)=in-stack, black(2)=done
- When hitting a gray node → cycle found
- Cycle normalization: extract cycle members, find minimum ID, rotate array to start from min
- Compare normalized forms to deduplicate cycles
- Output each unique cycle with ticket details

### Listing Performance
The bash script uses single-pass AWK for bulk operations. In Kotlin:
- Read all tickets once into memory (they're small markdown files)
- Filter in-memory using predicates
- Sort using Kotlin's `sortedWith(compareBy(...))` — natural for multi-key sorting
- For `closed` command: sort by `File.lastModifiedEpochMillis()` descending

### JSONL Output Format
Must match bash `_file_to_jsonl()` exactly. Key fields:
```json
{"id":"...","title":"...","status":"...","type":"...","priority":"...","assignee":"...","deps":["..."],"links":["..."],"tags":["..."],"created_iso":"...","closed_iso":"...","external-ref":"...","parent":"...","full_path":"/absolute/path/to/file.md"}
```
- Arrays are JSON arrays (even if empty: `[]`)
- Missing optional fields: check bash behavior (omitted or empty string?)
- `full_path` is always included with absolute path
- Use `AsgardJson` from asgardCoreJVM for serialization

### Filtering Shared Logic
- Extract a reusable filter function: `(Ticket) -> Boolean` based on status/assignee/tag params
- Apply across ls, ready, blocked, closed commands
- Tag filtering: `ticket.tags.contains(requestedTag)`

## Acceptance Criteria
- [ ] `dep` adds dependency correctly, prevents duplicates
- [ ] `undep` removes dependency, handles empty array cleanup
- [ ] `dep tree` renders correct ASCII tree (match bash format exactly)
- [ ] `dep tree --full` shows complete tree without deduplication
- [ ] `dep cycle` detects and reports all unique cycles with normalization
- [ ] `dep cycle` reports "No cycles found" when none exist
- [ ] `link` creates symmetric links between 2+ tickets
- [ ] `unlink` removes symmetric links from both tickets
- [ ] `ls` lists tickets with correct format and filtering
- [ ] `ready` shows only active tickets with all deps closed, sorted by priority then ID
- [ ] `blocked` shows only active tickets with unresolved deps, includes open blockers
- [ ] `closed` shows recently closed tickets sorted by mtime, respects --limit
- [ ] `query` outputs valid JSONL matching bash `_file_to_jsonl()` format
- [ ] All filtering flags (--status, -a, -T) work correctly across listing commands
- [ ] Unit tests cover all commands, including edge cases (empty deps, cycles, empty ticket set)
- [ ] Tests pass

## Notes
- Read the BDD feature files for exact output format expectations:
  - `ticket_dependencies.feature` — dep/undep/tree/cycle behavior
  - `ticket_links.feature` — link/unlink behavior
  - `ticket_listing.feature` — ls/ready/blocked/closed behavior
  - `ticket_query.feature` — JSONL output format
- The tree visualization must use the exact same box-drawing characters as the bash script.
- Cycle detection normalization is subtle — study the bash implementation closely to match behavior.
- For `ready`/`blocked` output: `[Pp]` is the priority prefix (e.g., `[P0]`, `[P2]`).
