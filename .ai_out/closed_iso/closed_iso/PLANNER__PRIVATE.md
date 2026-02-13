# Planner Private Context: closed_iso

## Codebase Analysis Completed

### Key locations in `ticket` script:
- `_iso_date()`: line 73 -- generates UTC ISO timestamp
- `_sed_i()`: line 78 -- portable sed in-place (temp file + mv approach)
- `_grep()`: line 66 -- ripgrep or grep wrapper
- `update_yaml_field()`: line 188 -- adds or updates a YAML frontmatter field
- `cmd_status()`: line 351 -- the function to modify
- `cmd_close()`: line 378 -- delegates to `cmd_status "$1" "closed"`
- `cmd_reopen()`: line 386 -- delegates to `cmd_status "$1" "open"`
- `cmd_start()`: line 370 -- delegates to `cmd_status "$1" "in_progress"`

### Test infrastructure:
- Behave BDD with `uv run --with behave behave`
- Feature file: `features/ticket_status.feature` -- 9 existing scenarios, all passing
- Step definitions: `features/steps/ticket_steps.py` -- uses regex matcher
- Environment: `features/environment.py` -- creates temp dirs per scenario
- Existing step `step_ticket_has_status` (line 175) sets status via direct file manipulation (regex sub)
- Existing step `step_ticket_has_field_value` (line 606) checks field existence and value
- NO existing step for asserting field absence -- must add one

### Important patterns observed:
- `_file_to_jsonl()` emits ALL frontmatter fields automatically (awk loop), so `closed_iso` will appear in JSONL without any changes
- `update_yaml_field()` inserts after first `---` if field doesn't exist, replaces if it does
- No existing `remove_yaml_field()` -- this is new
- The `_sed_i` function uses temp file approach: `sed "$@" "$file" > "$tmp" && mv "$tmp" "$file"` -- fully portable

### Risk assessment:
- LOW risk. The changes are minimal and follow established patterns.
- The `remove_yaml_field` using `/d` sed command on the whole file (not scoped to frontmatter) is acceptable because `closed_iso:` will never appear as a line-start in ticket body content.
- All existing tests pass (verified).

### CLAUDE.md note:
- CLAUDE.md in this repo is NOT generated from auto_load. It is directly edited (there is no `ai_input/` directory in this submodule).
