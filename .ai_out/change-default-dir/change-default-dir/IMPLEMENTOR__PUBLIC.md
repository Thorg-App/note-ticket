# Implementation Complete: Change Default Directory from `.tickets` to `_tickets`

## Summary

Changed the default ticket storage directory from `.tickets` to `_tickets` across the entire note-ticket codebase. This ensures tools like `fd`, `rg`, and file explorers do not ignore the directory by default (dot-prefixed directories are treated as hidden/ignored by many tools).

## Files Modified

| File | Changes | Nature |
|------|---------|--------|
| `ticket` | 12 occurrences | `.tickets` -> `_tickets` in comments, paths, help text |
| `bash_ticket` | 12 occurrences | `.tickets` -> `_tickets` (same changes as `ticket`) |
| `features/steps/ticket_steps.py` | 22 occurrences | Path strings and docstrings only; `context.tickets` Python attribute preserved |
| `features/ticket_directory.feature` | 4 occurrences | Scenario names and assertion strings |
| `features/ticket_edit.feature` | 1 occurrence | Path in output assertion |
| `ORIGINAL_README.md` | 3 occurrences | Documentation text and help output |
| `CHANGELOG.md` | 1 new entry | BREAKING change documented under `[Unreleased]` / `Changed` |
| `doc/ralph/spec-port-to-kotlin/spec-port-to-kotlin-high-level.md` | 4 occurrences | Spec documentation |
| `doc/ralph/spec-port-to-kotlin/tasks/todo/01_module_bootstrap_and_core_infrastructure.md` | 5 occurrences | Task spec documentation |
| `doc/ralph/spec-port-to-kotlin/tasks/todo/02_crud_and_status_commands.md` | 1 occurrence | Task spec documentation |

## What Was NOT Changed

- **Historical CHANGELOG entries** (lines under `[0.3.1]` and earlier) -- these document what happened at that point in time
- **`TICKETS_DIR` env var name** -- stays the same, provides escape hatch for old behavior
- **`context.tickets` Python attribute** in `features/steps/ticket_steps.py` -- this is a Python dict on the behave context object, not a directory path
- **`ask.dnc.md` and `formatted_request.dnc.md`** -- original task request files, not user-facing
- **Parent repo CLAUDE.md** -- separate update needed (out of scope per plan)

## Test Results

All BDD tests pass: **11 features, 131 scenarios, 905 steps** -- 0 failures, 0 skipped.

## Decisions Made

1. **Updated `bash_ticket`** per reviewer recommendation (plan had missed this file). It is a near-copy of `ticket` and should stay consistent.
2. **Updated `doc/ralph/` spec files** per reviewer recommendation. These describe future behavior for the Kotlin port and should reflect the current default.
3. **CHANGELOG entry marked as BREAKING** to clearly communicate the behavior change to users.

## Follow-up Needed

- Parent repo CLAUDE.md at `/usr/local/workplace/mirror/thorg-root-mirror-4/CLAUDE.md` contains `tk help` output referencing `.tickets/`. This should be updated after this change lands (out of scope per plan).
