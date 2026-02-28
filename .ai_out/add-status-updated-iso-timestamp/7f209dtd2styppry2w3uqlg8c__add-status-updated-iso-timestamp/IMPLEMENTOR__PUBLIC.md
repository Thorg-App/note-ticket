# Implementation Summary: `status_updated_iso` Timestamp Field

## What Was Done

Added `status_updated_iso` field that tracks when a ticket's status was last changed. The field is set at creation time (same value as `created_iso`) and updated on every status change. Unlike `closed_iso`, it is never removed.

## Files Modified

### 1. `ticket` (core script) -- 2 lines added
- **`cmd_create()` (line 317):** Added `echo "status_updated_iso: $now"` after `created_iso`, reusing the existing `$now` variable so both timestamps are identical at creation.
- **`cmd_status()` (line 377):** Added `update_yaml_field "$file" "status_updated_iso" "$(_iso_date)"` unconditionally before the `closed_iso` conditional block.

### 2. `features/steps/ticket_steps.py` -- 3 changes
- **`create_ticket()` fixture (line 63):** Added `status_updated_iso: 2024-01-01T00:00:00Z` after `created_iso`.
- **`step_separate_tickets_dir()` fixture (line 317):** Added `status_updated_iso: 2024-01-01T00:00:00Z` after `created_iso` (reviewer-identified gap).
- **New step definition (line 603):** Added `the created ticket should have a valid "(?P<field>[^"]+)" timestamp` -- parameterized step for validating timestamp fields on created tickets. Existing hardcoded step for `created_iso` retained for backward compatibility.

### 3. `features/ticket_creation.feature` -- 1 scenario added
- **"Ticket has status_updated_iso timestamp at creation"**: Verifies the field is present with a valid ISO timestamp when a ticket is created.

### 4. `features/ticket_status.feature` -- 2 scenarios added
- **"Status change updates status_updated_iso"**: Verifies the field is updated when status changes to `in_progress`.
- **"Reopening preserves status_updated_iso"**: Verifies the field is preserved (not removed) across close->reopen transitions, contrasting with `closed_iso` behavior.

### 5. `CHANGELOG.md`
- Added entry under `[Unreleased] / Added`.

## Decisions

1. **Adopted reviewer's simplified scenario name:** Used "Reopening preserves status_updated_iso" instead of the plan's longer parenthetical version, per the reviewer's suggestion.
2. **Applied reviewer's second fixture fix:** Updated `step_separate_tickets_dir()` as identified by the plan reviewer.
3. **No changes to `_file_to_jsonl()`:** The awk-based JSONL generator auto-includes all frontmatter fields.

## Test Results

All tests pass: **134 scenarios passed, 0 failed, 0 skipped. 922 steps passed, 0 failed, 0 skipped.**

## Deviations from Plan

None. All plan items and reviewer adjustments implemented as specified.
