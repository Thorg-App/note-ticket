# Plan Review -- Private Context

## Implementer Notes

### Implementation approach recommendation

Do NOT manually edit each line. Use bulk replacement per file:

```bash
# For each file that needs changes:
sed -i 's/\.tickets/_tickets/g' ticket
sed -i 's/\.tickets/_tickets/g' features/steps/ticket_steps.py
sed -i 's/\.tickets/_tickets/g' features/ticket_directory.feature
sed -i 's/\.tickets/_tickets/g' features/ticket_edit.feature
sed -i 's/\.tickets/_tickets/g' ORIGINAL_README.md
```

Then verify: `grep -rn '\.tickets' ticket features/ ORIGINAL_README.md` returns nothing.

For CHANGELOG.md: add a single entry under `## [Unreleased]` -> `### Changed` section. Do NOT sed-replace historical entries.

### `bash_ticket` decision

`bash_ticket` appears to be a backup/reference copy of the original `ticket` script (line 4 says "Almost original ticket. (some modifications)"). It is ~1556 lines vs `ticket`'s ~1542 lines. The implementer should:
1. Ask the human engineer whether `bash_ticket` should be updated or if it is a frozen reference.
2. If unsure, update it for consistency.

### `doc/ralph/` files

These are spec documents for a potential Kotlin port. They reference `.tickets` in the context of describing the bash tool's behavior. Updating them is low priority but prevents future confusion when someone reads the spec and sees `.tickets` while the tool uses `_tickets`.

Files:
- `doc/ralph/spec-port-to-kotlin/spec-port-to-kotlin-high-level.md` (4 occurrences)
- `doc/ralph/spec-port-to-kotlin/tasks/todo/01_module_bootstrap_and_core_infrastructure.md` (5 occurrences)
- `doc/ralph/spec-port-to-kotlin/tasks/todo/02_crud_and_status_commands.md` (1 occurrence)

### `context.tickets` false positive

The grep `\.tickets` pattern matches `context.tickets` in Python files because `.` matches any character. In `features/steps/ticket_steps.py`, lines 75, 76, 82, 83, 84, 126, 127 contain `context.tickets` -- these are Python dict attribute accesses, NOT directory references. Do NOT change these.

The plan correctly only lists the lines that reference `'.tickets'` (as a directory path string). The implementer should use:
```bash
# This is safe because the directory string '.tickets' won't match context.tickets
sed -i "s/'\\.tickets'/'_tickets'/g" features/steps/ticket_steps.py
```

Actually, a simpler approach: just do the global replace and verify. `context.tickets` does not contain `.tickets` as a quoted string with dot-prefix, so `sed 's/\.tickets/_tickets/g'` would incorrectly change `context.tickets` to `context_tickets`.

**IMPORTANT:** The sed replacement in `features/steps/ticket_steps.py` must be done carefully:
- Lines with `Path(context.test_dir) / '.tickets'` -> `Path(context.test_dir) / '_tickets'` (change the quoted string)
- Lines with `context.tickets` -> DO NOT CHANGE (Python attribute)
- Lines with docstring text `".tickets directory"` -> `"_tickets directory"`
- Lines with assertion messages `".tickets directory"` -> `"_tickets directory"`

The safest approach: manually replace the 22 specific occurrences listed in the plan, NOT a blind `sed` on the whole file. Or use a more targeted sed pattern like `s/'\.tickets'/'_tickets'/g` to only match the quoted directory name, combined with `s/\.tickets directory/_tickets directory/g` for docstrings and messages, and `s/\.tickets\//_tickets\//g` for paths with trailing slashes.

### Verification checklist

After all changes:
```bash
# Should return 0 matches (excluding .ai_out, .change_log, .git, doc/, bash_ticket if excluded):
grep -rn '\.tickets' ticket features/ ORIGINAL_README.md

# Run the test suite:
make test

# Verify help text updated:
./ticket help | grep _tickets
```
