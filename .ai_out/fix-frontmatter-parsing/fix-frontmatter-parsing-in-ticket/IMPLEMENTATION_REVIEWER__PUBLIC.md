# Review: Fix frontmatter parsing -- Final Iteration

## Verdict: PASS

All three items from the previous review have been addressed correctly. The branch is ready to merge.

---

## Summary

This PR fixes a bug where awk frontmatter parsers would re-enter frontmatter parsing mode when ticket body content contained `---` horizontal rules. The fix replaces `in_front = !in_front` (boolean toggle) with a counter-based approach (`front_count++; in_front = (front_count == 1)`) across all 10 awk frontmatter parsers in the `ticket` script.

Two commits:
1. `f0d01ab` -- Original fix for `_file_to_jsonl()` plus regression test
2. `dafd7cf` -- Fixes remaining 9 awk parsers, adds CHANGELOG entry, strengthens test assertions

---

## Verification of Previous Review Items

### 1. BLOCKING: Fix remaining 9 awk parsers -- RESOLVED

**Zero** instances of `in_front = !in_front` remain in the codebase. All 10 awk frontmatter parsers now use the counter-based pattern:

| Line | Function | Status |
|------|----------|--------|
| 153 | `ticket_path()` | Fixed (uses `front_count`) |
| 208 | `_file_to_jsonl()` | Fixed (uses `front_count`) -- original fix |
| 412 | `cmd_dep_tree()` | Fixed (uses `front_count`) |
| 596 | `cmd_dep_cycle()` | Fixed (uses `front_count`) |
| 771 | `cmd_ls()` | Fixed (uses `front_count`) |
| 817 | `cmd_ready()` | Fixed (uses `front_count`) |
| 912 | `cmd_closed()` | Fixed (uses `front_count`) |
| 954 | `cmd_blocked()` | Fixed (uses `front_count`) |
| 1238 | `cmd_show()` first pass | Fixed (uses `front_count`) |
| 1283 | `cmd_show()` getline re-read | Fixed (uses `show_front_count`) |

The `cmd_show()` getline loop at line 1283 correctly uses `show_front_count` instead of `front_count` to avoid variable collision with the first-pass awk block in the same program. This is the right approach.

### 2. BLOCKING: Add CHANGELOG entry -- RESOLVED

Entry added under `## [Unreleased]` / `### Fixed` in `/usr/local/workplace/mirror/thorg-root-mirror-5/submodules/note-ticket/CHANGELOG.md`:
```
- Awk frontmatter parsers no longer re-enter frontmatter parsing when body contains `---` horizontal rules
```

The wording correctly reflects the broader scope (all awk parsers, not just `_file_to_jsonl()`).

### 3. Non-blocking: Add positive assertions to test -- RESOLVED

The regression test scenario at `/usr/local/workplace/mirror/thorg-root-mirror-5/submodules/note-ticket/features/ticket_query.feature:65-75` now includes both positive and negative assertions:

```gherkin
And the output should contain "query-001"      # positive: ID present
And the output should contain "HR ticket"       # positive: title present
And the output should not contain "fake_field"  # negative: body field excluded
And the output should not contain "leaked_value" # negative: body value excluded
```

This ensures the test would catch both the original bug (body content leaking into frontmatter) and a hypothetical regression where the fix accidentally breaks frontmatter parsing entirely.

---

## Test Results

- **121 scenarios passed** (all non-plugin scenarios)
- **9 scenarios failed** -- all in `features/ticket_plugins.feature`, all pre-existing (exit code 126, plugin permission/environment issues unrelated to this change)
- **No existing tests removed or modified** -- only additions to test files

---

## No Remaining Issues

No CRITICAL, IMPORTANT, or Suggestion-level issues identified in this iteration.

---

## Convergence Signal

**PASS** -- Ready to merge.
