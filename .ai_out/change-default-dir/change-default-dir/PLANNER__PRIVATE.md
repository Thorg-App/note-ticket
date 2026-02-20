# Private Context: Change Default Directory

## Implementation Notes for Implementor

### Execution Strategy

This is a pure mechanical find-and-replace task. The safest approach:

1. Use `sed` or editor replace-all on each file for `.tickets` -> `_tickets`
2. But be CAREFUL: do not blindly replace in CHANGELOG.md historical entries
3. The `_tickets` string does not appear anywhere currently, so there is zero risk of collision

### Gotcha: The grep pattern

When verifying, remember that `grep '\.tickets'` matches `.tickets` but the `.` is a regex wildcard. Use `grep -F '.tickets'` (fixed string) for verification to be precise.

### Exact line-by-line for `ticket` script

These are the 12 grep hits (confirmed via `grep -n '\.tickets' ticket`):

```
5:# Stores markdown files with YAML frontmatter in .tickets/
7:# Find .tickets directory by walking parent directories
12:    # Walk parents looking for .tickets or .git boundary
15:        if [[ -d "$dir/.tickets" ]]; then
16:            echo "$dir/.tickets"
21:            echo "$dir/.tickets"
28:    [[ -d "/.tickets" ]] && { echo "/.tickets"; return 0; }
34:# Commands that can create .tickets if not found
54:        TICKETS_DIR=".tickets"
58:    echo "Error: no .tickets directory found (searched parent directories)" >&2
1502:Searches parent directories for .tickets/, stopping at .git boundary (override with TICKETS_DIR env var)
1503:Tickets stored as markdown files in .tickets/ (filenames derived from title)
```

### Step definitions: What to watch out for

The step definitions have `.tickets` in two categories:
1. **Path construction** (functional): `Path(context.test_dir) / '.tickets'` -- these MUST change
2. **Docstrings and assertion messages** (cosmetic): `"""Ensure .tickets directory does not exist."""` -- these SHOULD change for consistency

Both must be changed.

### Feature files assertions

Two feature files have `.tickets` in assertion strings that are checked against actual output:
- `ticket_directory.feature` lines 41, 48: `"no .tickets directory found"` -- must match the error message in `ticket` line 58
- `ticket_edit.feature` line 14: `".tickets/editable-ticket.md"` -- must match actual path output

These are coupled to the script output. Changing the script first, then the features, keeps them in sync.

### CHANGELOG entry placement

The `## [Unreleased]` section currently has:
- `### Added` (one item)
- `### Fixed` (one item)
- `### Removed` (three items)
- `### Changed` (seven items)

Add the new entry at the END of the existing `### Changed` section (after the last `- ` item under Changed).

### Parent repo CLAUDE.md

The root CLAUDE.md at `/usr/local/workplace/mirror/thorg-root-mirror-4/CLAUDE.md` has `tk help` output embedded that references `.tickets/`. This is generated from `ai_input/memory/auto_load` files. The implementor should NOT touch these as part of this change -- it is a separate concern and the CLAUDE.md says it is generated. Flag it as a follow-up.

### Test execution

Run: `make test` from `/usr/local/workplace/mirror/thorg-root-mirror-4/submodules/note-ticket/`

This requires `uv` to be available. If `uv` is not available, the equivalent is:
```bash
cd /usr/local/workplace/mirror/thorg-root-mirror-4/submodules/note-ticket
uv run behave features/
```

### Order of operations

1. Change `ticket` script first (source of truth)
2. Change step definitions (test infrastructure)
3. Change feature files (test assertions)
4. Change documentation (README, CHANGELOG)
5. Run tests
6. Commit

This order matters because if you run tests between steps 1 and 2-3, you will see failures (expected). Changing all test files together before running tests avoids confusion.
