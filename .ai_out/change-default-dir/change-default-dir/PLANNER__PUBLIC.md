# Implementation Plan: Change Default Directory from `.tickets` to `_tickets`

## Problem Understanding

**Goal:** Change the default ticket storage directory name from `.tickets` to `_tickets` so that common tools like `fd`, `rg`, and file explorers do not ignore it by default (dot-prefixed directories are treated as hidden/ignored).

**Constraints:**
- `TICKETS_DIR` env var override must continue working unchanged
- All existing BDD tests must pass after the change
- No backward compatibility fallback (KISS -- users with existing `.tickets` can use `TICKETS_DIR=.tickets`)
- Single atomic change -- no phased migration

**Assumptions:**
- This is a breaking change for existing users who have `.tickets/` directories. Acceptable because the `TICKETS_DIR` env var provides an escape hatch.
- No need for an automatic migration command at this time.

## High-Level Architecture

No architectural changes. This is a rename of a single hardcoded string constant that appears in:
1. The main `ticket` script (source of truth)
2. BDD test infrastructure (step definitions)
3. BDD feature files (scenario descriptions and assertions)
4. Documentation (README, CHANGELOG)

## Implementation Phases

### Phase 1: Update Main Script (`ticket`)

**Goal:** Change all `.tickets` references to `_tickets` in the core script.

**File:** `ticket` (12 occurrences across 10 lines)

**Key Steps:**

1. Line 5 (comment): `.tickets/` -> `_tickets/`
2. Line 7 (comment): `.tickets` -> `_tickets`
3. Line 12 (comment): `.tickets` -> `_tickets`
4. Line 15: `"$dir/.tickets"` -> `"$dir/_tickets"`
5. Line 16: `"$dir/.tickets"` -> `"$dir/_tickets"`
6. Line 21: `"$dir/.tickets"` -> `"$dir/_tickets"`
7. Line 28: `"/.tickets"` -> `"/_tickets"` (root check, both occurrences)
8. Line 34 (comment): `.tickets` -> `_tickets`
9. Line 54: `TICKETS_DIR=".tickets"` -> `TICKETS_DIR="_tickets"`
10. Line 58: `no .tickets directory found` -> `no _tickets directory found`
11. Line 1502: `.tickets/` -> `_tickets/`
12. Line 1503: `.tickets/` -> `_tickets/`

**Verification:** `grep -c '\.tickets' ticket` should return 0. `grep -c '_tickets' ticket` should return 12 (same count).

### Phase 2: Update BDD Step Definitions (`features/steps/ticket_steps.py`)

**Goal:** Update all hardcoded `.tickets` path references in test helpers.

**File:** `features/steps/ticket_steps.py`

**Key Steps:**

All changes are mechanical `.tickets` -> `_tickets` replacements:

1. Line 42: `Path(context.test_dir) / '.tickets'` -> `Path(context.test_dir) / '_tickets'`
2. Line 88 (comment): `.tickets/` -> `_tickets/`
3. Line 89: `Path(context.test_dir) / '.tickets'` -> `Path(context.test_dir) / '_tickets'`
4. Line 138 (docstring): `.tickets` -> `_tickets`
5. Line 139: `Path(context.test_dir) / '.tickets'` -> `Path(context.test_dir) / '_tickets'`
6. Line 148 (docstring): `.tickets` -> `_tickets`
7. Line 149: `Path(context.test_dir) / '.tickets'` -> `Path(context.test_dir) / '_tickets'`
8. Line 536 (docstring): `.tickets` -> `_tickets`
9. Line 537: `Path(context.test_dir) / '.tickets'` -> `Path(context.test_dir) / '_tickets'`
10. Line 538 (assertion message): `.tickets` -> `_tickets`
11. Line 543 (docstring): `.tickets` -> `_tickets`
12. Line 545: `Path(cwd) / '.tickets'` -> `Path(cwd) / '_tickets'`
13. Line 546 (assertion message): `.tickets` -> `_tickets`
14. Line 551 (docstring): `.tickets` -> `_tickets`
15. Line 552: `Path(context.test_dir) / '.tickets'` -> `Path(context.test_dir) / '_tickets'`
16. Line 553 (assertion message): `.tickets` -> `_tickets`
17. Line 558 (docstring): `.tickets` -> `_tickets`
18. Line 560: `subdir_path / '.tickets'` -> `subdir_path / '_tickets'`
19. Line 561 (assertion message): `.tickets` -> `_tickets`
20. Line 798 (docstring): `.tickets/` -> `_tickets/`
21. Line 799: `Path(context.test_dir) / '.tickets'` -> `Path(context.test_dir) / '_tickets'`
22. Line 802 (assertion message): `.tickets/` -> `_tickets/`

**Verification:** `grep -c '\.tickets' features/steps/ticket_steps.py` should return 0.

### Phase 3: Update BDD Feature Files

**Goal:** Update scenario descriptions and assertion strings that reference `.tickets`.

**Files and changes:**

#### `features/ticket_directory.feature` (4 changes)
1. Line 3: `find .tickets` -> `find _tickets`
2. Line 41: `"no .tickets directory found"` -> `"no _tickets directory found"`
3. Line 48: `"no .tickets directory found"` -> `"no _tickets directory found"`
4. Line 100: `Existing .tickets takes priority` -> `Existing _tickets takes priority`

#### `features/ticket_edit.feature` (1 change)
1. Line 14: `".tickets/editable-ticket.md"` -> `"_tickets/editable-ticket.md"`

**Verification:** `grep -rc '\.tickets' features/` should return 0.

### Phase 4: Update Documentation

**Goal:** Update all user-facing documentation.

#### `ORIGINAL_README.md` (3 changes)
1. Line 5: `in .tickets/` -> `in _tickets/`
2. Line 83: `.tickets/` -> `_tickets/`
3. Line 84: `.tickets/` -> `_tickets/`

#### `CHANGELOG.md` (add entry under `## [Unreleased]`)
Add under the existing `### Changed` section (or create one if already consumed):
```
- Default tickets directory changed from `.tickets` to `_tickets` so tools like `fd` and `rg` do not ignore it by default. Use `TICKETS_DIR=.tickets` to keep the old behavior.
```

Also update historical references if desired (lines 17, 38, 51). **Decision:** Do NOT change historical changelog entries. They document what happened at that point in time. Only add the new entry under `[Unreleased]`.

#### `CLAUDE.md`
The CLAUDE.md references `.tickets/` in two places:
- "Entries stored as markdown in `./.tickets/`" -- but this is within a help text block that should match the actual `ticket help` output. Once the script is updated, the CLAUDE.md help block will be stale. However, per CLAUDE.md's own instructions, it says "Run `tk help` for command reference." The help text in CLAUDE.md appears to be a copy of the `tk help` output from the root project CLAUDE.md, not from this submodule's CLAUDE.md. **This is in the parent repo's CLAUDE.md, not this submodule.** Leave it for a separate update, or note it as a follow-up.

**Verification:** `grep -c '\.tickets' ORIGINAL_README.md` should return 0 (for non-historical content).

### Phase 5: Run Tests and Verify

**Goal:** Confirm all tests pass.

**Steps:**
1. Run `make test` from the project root
2. Verify all BDD scenarios pass (there should be ~80+ scenarios)
3. Manually verify: `grep -rn '\.tickets' ticket features/ ORIGINAL_README.md` returns nothing (confirming no stale references in source or tests)

## Backward Compatibility Decision

**Decision: NO fallback.** Do not add `.tickets` fallback search to `find_tickets_dir()`.

**Rationale:**
- KISS: Adding fallback logic increases complexity for a temporary transition period
- The `TICKETS_DIR` env var already provides a clean escape hatch
- Users can simply rename their directory: `mv .tickets _tickets`
- Adding fallback creates ambiguity about which directory is authoritative
- The CHANGELOG entry documents the change and the workaround

## Testing Strategy

### Acceptance Criteria

All existing BDD scenarios must pass with `_tickets` as the default directory. Specifically:

1. **Directory resolution:** `ticket ls` from subdirectories finds `_tickets/` by walking parents
2. **Creation:** `ticket create` initializes `_tickets/` when none exists
3. **Error messages:** Read commands show `no _tickets directory found` when directory is missing
4. **TICKETS_DIR override:** Setting `TICKETS_DIR` to any path (including `.tickets`) still works
5. **Git boundary:** `find_tickets_dir()` stops at `.git` and creates `_tickets/` at repo root
6. **Edit output:** Non-TTY edit shows `_tickets/` in file path
7. **Help text:** `ticket help` output shows `_tickets/` references

### What NOT to Test

- No new test scenarios needed. The existing ~80+ BDD scenarios cover all the behavior.
- No migration test needed (we are not providing migration).

## Open Questions

1. **Parent repo CLAUDE.md:** The root project CLAUDE.md (`/usr/local/workplace/mirror/thorg-root-mirror-4/CLAUDE.md`) contains `tk help` output referencing `.tickets/`. This should be updated separately after this change lands. Create a follow-up ticket or note.

## Summary of Changes by File

| File | Changes | Nature |
|------|---------|--------|
| `ticket` | 12 occurrences | `.tickets` -> `_tickets` (mechanical) |
| `features/steps/ticket_steps.py` | ~22 occurrences | `.tickets` -> `_tickets` (mechanical) |
| `features/ticket_directory.feature` | 4 occurrences | `.tickets` -> `_tickets` (mechanical) |
| `features/ticket_edit.feature` | 1 occurrence | `.tickets` -> `_tickets` (mechanical) |
| `ORIGINAL_README.md` | 3 occurrences | `.tickets` -> `_tickets` (mechanical) |
| `CHANGELOG.md` | 1 new entry | Document the change |

Total: ~43 string replacements across 6 files, plus 1 new changelog entry.
