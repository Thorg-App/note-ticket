# Review Private Notes

## Status: CONDITIONAL PASS

## Key Finding: Same Bug in 9 Other Locations

This is the most important finding. The fix is correct for `_file_to_jsonl()` but the same `in_front = !in_front` toggle pattern exists in 9 other awk blocks. Full list:

- Line 153: `ticket_path()` -- only reads `id:`, low practical risk but still semantically wrong
- Line 412: `cmd_dep_tree()` -- reads multiple fields
- Line 596: `cmd_dep_cycle()` -- reads multiple fields
- Line 771: `cmd_ls()` -- reads multiple fields
- Line 817: `cmd_ready()` -- reads multiple fields
- Line 912: `cmd_closed()` -- reads multiple fields
- Line 954: `cmd_blocked()` -- reads multiple fields
- Line 1238: `cmd_show()` first pass -- reads multiple fields
- Line 1283: `cmd_show()` getline re-read -- only checks parent

The practical risk depends on whether ticket body content ever contains `---` with subsequent `key: value` patterns that match field names like `status:`, `deps:`, `priority:`, etc. With AI agents writing ticket body content (which is the stated use case), this is plausible.

## DRY Observation

The frontmatter parsing awk pattern is duplicated ~10 times. Each has:
```awk
BEGIN { FS=": "; in_front=0 }
FNR==1 { ...; in_front=0; ... }
/^---$/ { in_front = !in_front; next }
in_front && /^field:/ { ... }
```

A proper fix would extract this into a shared mechanism, but that's a larger refactor.

## CHANGELOG Missing

The `[Unreleased]` section has `### Removed` and `### Changed` and `### Added` but no `### Fixed`. Need to add one.

## Test Quality

The test is good. The step definition creates a realistic scenario. One minor suggestion: also assert the legitimate fields ARE present (positive assertion alongside the negative ones).

## `yaml_field` is safe

Uses `sed -n '/^---$/,/^---$/p'` which correctly limits to the first range. The sed range syntax stops after the second delimiter and does NOT re-enter.

## `cmd_show` line 1283 context

This is in a `getline` loop for re-reading the target file, not the multi-file awk pass. It uses the toggle for displaying frontmatter content with enhancements (parent title). The risk is lower since it only checks `parent:` pattern, but it's still semantically wrong.
