# Fix: Frontmatter parsing across all awk blocks

## Summary

Addressed all review feedback from the CONDITIONAL PASS review. The `in_front = !in_front` toggle bug that was originally fixed in `_file_to_jsonl()` has now been fixed in all 9 remaining awk frontmatter parsers throughout the `ticket` script. Added CHANGELOG entry and strengthened the regression test with positive assertions.

## Root Cause

The parser used `in_front = !in_front` to toggle frontmatter mode on every `---` line. A third `---` in the body (markdown horizontal rule) would toggle `in_front` back to true, causing subsequent `key: value` lines to be parsed as frontmatter fields. This same bug existed in 10 separate awk blocks.

## Fix

Replaced the toggle with a counter-based approach in all 10 awk frontmatter parsers:
- `front_count++` on each `---` line
- `in_front = (front_count == 1)` -- only true between the first and second `---`
- After the second `---`, `in_front` stays 0 permanently for that file

## Changes in This Round (Review Feedback)

1. **Fixed 9 remaining awk parsers** in: `ticket_path()`, `cmd_dep_tree()`, `cmd_dep_cycle()`, `cmd_ls()`, `cmd_ready()`, `cmd_closed()`, `cmd_blocked()`, `cmd_show()` (2 occurrences)
2. **Added CHANGELOG entry** under `## [Unreleased]` / `### Fixed`
3. **Added positive test assertions** -- the regression test now verifies that legitimate fields (ticket ID, title) ARE present in output, not just that fake fields are absent

## Files Modified

- `ticket` -- Fixed 9 awk frontmatter parsers (plus the original `_file_to_jsonl()` fix from the first round)
- `CHANGELOG.md` -- Added Fixed entry
- `features/ticket_query.feature` -- Added positive assertions to regression test scenario

## Tests

- All 121 non-plugin scenarios pass
- 9 pre-existing plugin failures (exit code 126, environment/permission-related, unrelated to this change)
- Zero remaining instances of `in_front = !in_front` in the codebase
