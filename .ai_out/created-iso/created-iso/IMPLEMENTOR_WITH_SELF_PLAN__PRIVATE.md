# Implementor Private Notes: Rename `created` to `created_iso`

## Status: COMPLETE

## Changes Made
1. `ticket` line 302: `echo "created: $now"` -> `echo "created_iso: $now"`
2. `features/steps/ticket_steps.py` line 63: `created:` -> `created_iso:` in `create_ticket()` helper
3. `features/steps/ticket_steps.py` line 276: `created:` -> `created_iso:` in `step_separate_tickets_dir()` helper
4. `features/steps/ticket_steps.py` line 545: regex `r'^created:\s*...'` -> `r'^created_iso:\s*...'` and error message updated
5. `features/ticket_creation.feature` line 89: scenario name updated to "Ticket has created_iso timestamp"
6. `.tickets/test-ticket-1.md` line 7: `created:` -> `created_iso:`
7. `CHANGELOG.md`: Added "Renamed `created` frontmatter field to `created_iso` for clarity" under `### Changed`

## Test Results
- 120 scenarios passed, 9 failed (all plugin tests - known /dev/shm noexec issue)
- 838 steps passed, 9 failed, 9 skipped (all in plugin feature)
- The specific `created_iso timestamp` scenario passed

## Notes
- `_file_to_jsonl()` was NOT modified (it handles fields generically)
- No plugin references to `created` field exist
