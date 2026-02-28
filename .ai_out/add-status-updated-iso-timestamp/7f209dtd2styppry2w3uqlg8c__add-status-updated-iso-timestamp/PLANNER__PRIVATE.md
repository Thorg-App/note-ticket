# Planner Private Context

## What I verified

- `_iso_date()` at line 73: `date -u +%Y-%m-%dT%H:%M:%SZ`
- `cmd_create()` captures `now=$(_iso_date)` at line 306, emits `created_iso: $now` at line 316
- `cmd_status()` at lines 360-384: calls `update_yaml_field` for status, then conditional `closed_iso` logic
- `cmd_start`, `cmd_close`, `cmd_reopen` all delegate to `cmd_status` -- so only `cmd_status` needs modification
- `_file_to_jsonl()` uses generic awk that auto-includes all frontmatter -- no changes needed
- `update_yaml_field()` at line 188: handles both update (sed) and insert (after first `---`)
- Test fixture `create_ticket()` at line 56-65: hardcoded frontmatter, needs `status_updated_iso` added
- Existing step `ticket "X" should have a valid "Y" timestamp` at line 786: reusable for status tests
- Existing step `the created ticket should have a valid created timestamp` at line 590: hardcoded to `created_iso`, need generic version for creation tests
- `should not have field` step exists at line 776: NOT needed for this feature (we never remove `status_updated_iso`)

## Complexity Assessment

Very low complexity. Two lines of script code, one line in test fixture, a few BDD scenarios, one new step definition. All following existing patterns exactly.
