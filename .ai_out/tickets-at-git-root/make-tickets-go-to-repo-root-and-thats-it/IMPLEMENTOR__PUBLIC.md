# Implementation: find_tickets_dir stops at .git boundary

## Summary

Implemented the `.git` boundary check in `find_tickets_dir()` so that ticket directory resolution stops at the git repository root instead of walking indefinitely into parent repositories. This prevents submodules from leaking into parent repo ticket directories.

## Changes Made

### 1. `ticket` (core script) -- lines 12-22

Added 4 lines (comment + condition) to `find_tickets_dir()` after the `.tickets/` check in the while loop:

```bash
# .git (file for submodules, directory for regular repos) = repo root boundary
if [[ -e "$dir/.git" ]]; then
    echo "$dir/.tickets"
    return 0
fi
```

Uses `-e` to match both `.git` directories (regular repos) and `.git` files (submodules). No changes to `init_tickets_dir()` -- existing logic handles the new return values correctly.

### 2. `features/ticket_directory.feature` -- 6 new scenarios

| Scenario | Tests |
|----------|-------|
| Stop at .git directory (regular repo root) | Create from subdirectory anchors to repo root |
| Stop at .git file (submodule root) | Create from subdirectory anchors to submodule root |
| Existing .tickets takes priority over .git in same directory | .tickets found before .git check |
| Read command fails gracefully at .git boundary with no tickets | Error message when .tickets does not exist |
| Do not walk past .git boundary into parent | Inner repo does not see outer repo tickets |
| Create in submodule does not use parent repo tickets | Write command anchors to submodule, not parent |

### 3. `features/steps/ticket_steps.py` -- 6 new step definitions

- `a .git directory exists in the test root`
- `a .git file exists in the test root`
- `a .git directory exists in subdirectory "<subdir>"`
- `a .git file exists in subdirectory "<subdir>"`
- `tickets directory should exist in test root`
- `tickets directory should exist in subdirectory "<subdir>"`

### 4. `CHANGELOG.md`

Added entry under `## [Unreleased]` / `### Changed`.

## Test Results

- All 16 ticket_directory.feature scenarios pass (10 existing + 6 new)
- All other feature files pass (except 9 pre-existing plugin permission failures unrelated to this change)
- New tests were verified to FAIL before the code change, confirming they capture the intended behavior

## Reviewer Feedback Incorporated

1. Added "Create in submodule does not use parent repo tickets" scenario (primary use case)
2. Removed misleading "`.tickets in ancestor takes priority over .git in descendant`" scenario (was testing normal discovery, not priority)
3. Moved CHANGELOG entry from "Added" to "Changed"
4. Added step definition for `.git file exists in subdirectory "<subdir>"`
5. Added step definition for `tickets directory should exist in subdirectory "<path>"`
