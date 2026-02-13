# Exploration: closed_iso Feature

## Task
When ticket is "closed", add `closed_iso` ISO date field. When re-opened, remove `closed_iso`.

## Key Findings

### Current Close/Reopen Flow
- `cmd_close()` (ticket:378) delegates to `cmd_status "$1" "closed"`
- `cmd_reopen()` (ticket:386) delegates to `cmd_status "$1" "open"`
- `cmd_status()` (ticket:351-368) validates status, resolves ticket path, calls `update_yaml_field`

### Existing Infrastructure
- `_iso_date()` (ticket:73): returns `YYYY-MM-DDTHH:MM:SSZ` (UTC)
- `update_yaml_field()` (ticket:188): sets/inserts YAML fields
- `yaml_field()` (ticket:181): reads YAML field values
- `_file_to_jsonl()` (ticket:205): auto-exposes ALL frontmatter fields to JSON - no changes needed
- `_sed_i()` (ticket:78): portable sed in-place editing

### Missing Infrastructure
- **No `remove_yaml_field()` function exists** - needed for reopen to remove `closed_iso`

### BDD Testing Patterns
- Feature files: `features/ticket_status.feature` (existing close/reopen tests)
- Step defs: `features/steps/ticket_steps.py`
- Key step: `ticket should have field "X" with value "Y"` (ticket_steps.py:606)
- Test helper `create_ticket()` uses fixed `created_iso: 2024-01-01T00:00:00Z`
- Timestamp validation pattern exists for `created_iso` (ticket_creation.feature:89)

### Implementation Points
1. Add `remove_yaml_field()` function near `update_yaml_field()` (~line 201)
2. Modify `cmd_status()` to add `closed_iso` when status="closed", remove when status!="closed"
3. Add BDD scenarios to `ticket_status.feature`
4. Add step for "ticket should not have field" in `ticket_steps.py`
