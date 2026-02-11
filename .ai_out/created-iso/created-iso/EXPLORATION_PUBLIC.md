# Exploration: Rename `created` to `created_iso`

## Task
Rename the `created` YAML frontmatter field to `created_iso` in the ticket system.

## Locations to Update

### Core Script (`ticket`)
- **Line 302**: `echo "created: $now"` → `echo "created_iso: $now"`
- `_file_to_jsonl()` handles fields generically (no change needed)
- `_iso_date()` function unchanged

### Tests
- `features/ticket_creation.feature` line 92: step text references "created timestamp"
- `features/steps/ticket_steps.py`:
  - Lines ~63, ~276: hardcoded `created: 2024-01-01T00:00:00Z` in test helpers
  - Lines ~538-547: regex validation `r'^created:\s*...'`

### Sample Data
- `.tickets/test-ticket-1.md` line 7: `created: 2026-02-11T16:32:16Z`

## Scope
- 5 critical locations + 1 sample file
- No plugin references
- No README/CLAUDE.md documentation of field name
