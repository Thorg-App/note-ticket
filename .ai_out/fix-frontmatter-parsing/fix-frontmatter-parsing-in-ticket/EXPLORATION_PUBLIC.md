# Exploration: Fix frontmatter parsing in _file_to_jsonl()

## Bug

In `ticket` script, function `_file_to_jsonl()` (line ~198-252), the awk frontmatter parser uses:
```awk
/^---$/ { in_front = !in_front; next }
```

This **toggles** `in_front` on every `---` line. If the markdown body contains a `---` horizontal rule, the parser re-enters frontmatter mode and leaks body content into JSONL output.

## Fix

Replace toggle with counter-based approach:
- Track `front_count` incremented on each `---`
- `in_front` is true only when `front_count == 1` (between first and second `---`)
- After second `---`, never re-enter frontmatter mode

## Key File Locations

- **Script**: `./ticket` - main bash script
- **Bug location**: Line ~208 in `_file_to_jsonl()`: `/^---$/ { in_front = !in_front; next }`
- **Tests**: `features/ticket_query.feature` - query/JSONL tests
- **Step defs**: `features/steps/ticket_steps.py`
- **Run tests**: `make test`

## Test Strategy

1. Add a failing test: create a ticket with body content containing `---` and `key: value` lines after it
2. Run `query` and verify the fake key:value does NOT appear in JSONL output
3. Fix the awk code
4. Verify all tests pass
