# Implementation Review: Change Default Directory from `.tickets` to `_tickets`

## Verdict: PASS

No implementation iteration needed.

## Summary

The change renames the default ticket storage directory from `.tickets` to `_tickets` across the entire note-ticket codebase. The motivation is that dot-prefixed directories are treated as hidden by tools like `fd`, `rg`, and file explorers, causing the ticket directory to be silently ignored.

The implementation is a clean, mechanical find-and-replace across 10 source files (excluding `.ai_out/` artifacts), with one new CHANGELOG entry. All 131 BDD scenarios (905 steps) pass. No tests were removed or weakened. No behavioral regressions detected.

## BLOCKING Issues

None.

## NON-BLOCKING Issues

### 1. Parent repo CLAUDE.md still references `.tickets/`

**File:** `/usr/local/workplace/mirror/thorg-root-mirror-4/CLAUDE.md` (lines 337-338)

The parent repo's CLAUDE.md embeds `tk help` output that still says:
```
Searches parent directories for .tickets/, stopping at .git boundary (override with TICKETS_DIR env var)
Tickets stored as markdown files in .tickets/ (filenames derived from title)
```

This was explicitly noted as out-of-scope in the implementation report. It should be updated as a follow-up after this change lands. The risk is that AI agents reading the parent CLAUDE.md will use the old `.tickets` directory name.

### 2. Submodule CLAUDE.md says "~1000 lines" but the script is ~1540 lines

**File:** `/usr/local/workplace/mirror/thorg-root-mirror-4/submodules/note-ticket/CLAUDE.md` (line 9)

This is a pre-existing documentation drift, not introduced by this change. Noting it for awareness.

## Verification Details

### Completeness Check

Searched all source files for remaining `.tickets` references (excluding `.ai_out/`, `.change_log/`, `.git/`, `.tmp/`):

- **Scripts (`ticket`, `bash_ticket`):** Zero `.tickets` references remain. All 12 occurrences in each file correctly changed to `_tickets`.
- **Test code (`features/steps/ticket_steps.py`):** All directory path references changed to `_tickets`. The `context.tickets` Python dict attribute (8 occurrences) was correctly preserved -- these are behave context object properties, not directory paths.
- **Feature files:** `ticket_directory.feature` and `ticket_edit.feature` both updated correctly.
- **CHANGELOG.md:** New BREAKING entry added under `[Unreleased] / Changed`. Historical entry at line 39 (`[0.3.1]`) correctly preserved with `.tickets/` as it documents past behavior.
- **ORIGINAL_README.md:** All 3 occurrences updated.
- **doc/ralph/ spec files:** All updated, zero `.tickets` remaining.

### Correctness Check

Spot-checked key files:

- **`ticket` `find_tickets_dir()`** (lines 8-32): Correctly walks parent dirs looking for `_tickets`, stops at `.git` boundary. Fallback default at line 54 is `_tickets`. Error message at line 58 says `no _tickets directory found`.
- **`bash_ticket`** (lines 10-63): Identical logic to `ticket`, all references consistent.
- **`features/steps/ticket_steps.py`**: `create_ticket()` at line 42 uses `_tickets`. `find_ticket_file()` at line 89 uses `_tickets`. All step definitions (`step_clean_tickets_directory`, `step_tickets_dir_not_exist`, assertion steps) use `_tickets`. Assertion error messages updated consistently.
- **`features/ticket_directory.feature`**: Error message assertions at lines 41 and 48 match `no _tickets directory found`. Scenario name at line 100 updated to `Existing _tickets takes priority over .git in same directory`.
- **`features/ticket_edit.feature`**: Line 14 correctly asserts `_tickets/editable-ticket.md`.

### Test Results

Independently ran `make test`:

```
11 features passed, 0 failed, 0 skipped
131 scenarios passed, 0 failed, 0 skipped
905 steps passed, 0 failed, 0 skipped
Took 0min 1.900s
```

### Backward Compatibility

The CHANGELOG entry clearly marks this as a **BREAKING** change and documents the escape hatch (`TICKETS_DIR=.tickets`). The exploration document considered dual-path lookup (checking `_tickets` first, then falling back to `.tickets`) but the simpler approach was chosen, which is appropriate given the BREAKING designation and clear migration path.
