# Completed: Rename `created` to `created_iso`

## What was done
- Renamed the `created` YAML frontmatter field to `created_iso` across the entire codebase
- Updated CHANGELOG.md with the change

## Files modified
- `ticket` (line 302) - Core script frontmatter generation
- `features/steps/ticket_steps.py` (lines 63, 276, 545) - Test helpers and regex validation
- `features/ticket_creation.feature` (line 89) - Scenario name
- `.tickets/test-ticket-1.md` (line 7) - Sample ticket data
- `CHANGELOG.md` - Added changelog entry under `### Changed`

## Tests
- All 120 non-plugin scenarios pass (838 steps pass)
- 9 plugin test failures are pre-existing (known /dev/shm noexec environment issue)
- The `created_iso timestamp` scenario specifically passes

## Notes
- `_file_to_jsonl()` was intentionally NOT modified since it handles fields generically
- No deviations from the plan
