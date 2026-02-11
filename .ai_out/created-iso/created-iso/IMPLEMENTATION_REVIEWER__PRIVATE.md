# Implementation Review: Rename `created` to `created_iso`

## Verdict: PASS (with minor suggestion)

## Review Checklist

### Completeness
- [x] Core script `ticket` line 302: `created:` -> `created_iso:` -- DONE
- [x] `features/steps/ticket_steps.py` line 63: test helper `create_ticket()` -- DONE
- [x] `features/steps/ticket_steps.py` line 276: test helper `step_separate_tickets_dir()` -- DONE
- [x] `features/steps/ticket_steps.py` line 545: regex validation pattern -- DONE
- [x] `features/steps/ticket_steps.py` line 547: error message -- DONE
- [x] `features/ticket_creation.feature` line 89: scenario name -- DONE
- [x] `.tickets/test-ticket-1.md` line 7: sample data -- DONE
- [x] `CHANGELOG.md`: entry added -- DONE
- [x] No remaining `created:` (as frontmatter field) in codebase -- CONFIRMED via grep
- [x] No plugin references to old field name -- CONFIRMED
- [x] `_file_to_jsonl()` correctly NOT modified (generic field handling) -- CONFIRMED

### Correctness
- All changes are syntactically correct
- No typos found
- Field name consistent across all locations

### Tests
- 120 scenarios passed, 9 failed (all plugin tests -- pre-existing /dev/shm noexec)
- `created_iso timestamp` scenario specifically passed
- 838 steps passed

### No Over-engineering
- Change is minimal and focused -- only the field name was renamed
- No unrelated changes introduced (aside from .ai_out process files)

### Minor Issue
- CHANGELOG.md has duplicate `### Changed` sections under `[Unreleased]` (lines 5 and 11)
  - The new entry was added as a separate `### Changed` before `### Removed` instead of appending to the existing `### Changed` section
  - This is a pre-existing structural issue that was made slightly worse by this change
