# Review Private Notes -- Final Iteration

## Status: PASS

## Verification Summary

All three items from the conditional pass have been properly addressed:

1. **9 remaining awk parsers fixed** -- Confirmed via `grep -n 'in_front = !in_front'` returning zero matches, and `grep -c 'front_count++; in_front = (front_count == 1)'` returning 9 (plus 1 `show_front_count` variant = 10 total).

2. **CHANGELOG entry added** -- Wording is appropriately scoped to "awk frontmatter parsers" (plural), not just `_file_to_jsonl()`.

3. **Positive assertions added** -- Both `query-001` and `HR ticket` are now asserted present.

## cmd_show() show_front_count Detail

The `cmd_show()` function has two awk frontmatter parsing locations within the same awk program:
- Line 1238: Multi-file first pass (uses `front_count`)
- Line 1283: Single-file getline re-read loop (uses `show_front_count`)

Using `show_front_count` for the second location avoids collision with the `front_count` variable used in the first pass. This is correct because both blocks are in the same awk invocation, so they share the same variable namespace.

## DRY Observation (Still Applicable, Out of Scope)

The frontmatter parsing pattern is still duplicated 10 times. A future refactor to extract a shared mechanism remains a good idea but is correctly out of scope for this bug fix PR.

## Grep Tool Limitation Noted

The Grep tool (ripgrep) did not find matches for `in_front` or `front_count` in the `ticket` file. This appears to be because the patterns are inside single-quoted awk heredoc strings embedded in bash, which ripgrep may not index. Had to fall back to `bash grep` for verification. This is a tooling quirk to be aware of.

## No Security or Correctness Concerns

- No existing tests removed
- No anchor points affected
- No behavioral changes beyond the bug fix
- The counter-based approach is strictly more correct than the toggle
