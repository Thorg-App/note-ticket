# Fix: Frontmatter parsing in _file_to_jsonl()

## Summary

Fixed a bug where the awk frontmatter parser in `_file_to_jsonl()` would re-enter frontmatter mode when body content contained `---` horizontal rules. This caused body content like `fake_field: leaked_value` to leak into JSONL output.

## Root Cause

The parser used `in_front = !in_front` to toggle frontmatter mode on every `---` line. A third `---` in the body (markdown horizontal rule) would toggle `in_front` back to true, causing subsequent `key: value` lines to be parsed as frontmatter fields.

## Fix

Replaced the toggle with a counter-based approach (2-line change in awk):
- `front_count++` on each `---` line
- `in_front = (front_count == 1)` -- only true between the first and second `---`
- After the second `---`, `in_front` stays 0 permanently for that file

## Files Modified

- `ticket` -- Fixed `_file_to_jsonl()` awk parser (~line 202-208)
- `features/ticket_query.feature` -- Added regression test scenario
- `features/steps/ticket_steps.py` -- Added step definition for creating ticket with body containing HR and fake frontmatter

## Tests

- Added: "Query ignores horizontal rules and body content that looks like frontmatter" scenario
- Test confirmed to fail before fix and pass after fix
- All 121 non-plugin scenarios pass (9 pre-existing plugin permission failures unrelated to this change)
