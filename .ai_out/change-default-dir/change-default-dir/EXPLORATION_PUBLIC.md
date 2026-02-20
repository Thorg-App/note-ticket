# Exploration: Change Default Directory from `.tickets` to `_tickets`

## Task
Change the default directory from `.tickets` to `_tickets` so tools like `fd` don't ignore it by default.

## Files That Need Changes

### Source Code
- `ticket` (main script ~1540 lines) - Multiple references to `.tickets`:
  - Line 5: Comment
  - Lines 7-32: `find_tickets_dir()` - walks parent dirs looking for `.tickets`
  - Line 54: Fallback default `TICKETS_DIR=".tickets"`
  - Line 58-59: Error message "no .tickets directory found"
  - Lines 1502-1503: Help text

### Tests
- `features/ticket_directory.feature` - Comprehensive directory resolution tests (~80 scenarios)
- `features/steps/ticket_steps.py` - Step definitions with hardcoded `.tickets` paths (lines 42-43, 80-98)

### Documentation
- `ORIGINAL_README.md` - Lines 5, 83, 84
- `CHANGELOG.md` - Lines 17, 38, 51
- `CLAUDE.md` - Help text references

## Key Design Notes
- `TICKETS_DIR` env var override remains unchanged (highest priority)
- `find_tickets_dir()` walks parent dirs, stops at `.git` boundary
- Only `create` command initializes the directory; read commands fail if missing

## Backward Compatibility Consideration
- Existing users have `.tickets/` directories. The script should ideally look for both `_tickets` (preferred) then `.tickets` (fallback) during the transition, OR just change the default and document it.
