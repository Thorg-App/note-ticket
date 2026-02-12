# Review: Fix frontmatter parsing in _file_to_jsonl()

## Verdict: CONDITIONAL PASS

The fix for `_file_to_jsonl()` is **correct and minimal**. However, there is one **IMPORTANT** issue (same bug exists in 9 other awk parsers) and one **IMPORTANT** issue (missing CHANGELOG entry). These should be addressed before merge.

---

## Summary

The change replaces a boolean toggle (`in_front = !in_front`) with a counter-based approach (`front_count++; in_front = (front_count == 1)`) in the `_file_to_jsonl()` function's awk parser. This prevents body content containing `---` horizontal rules from being re-parsed as frontmatter. The fix is a 2-line change, includes a well-written regression test, and all 121 non-plugin tests pass.

---

## IMPORTANT Issues

### 1. Same bug exists in 9 other awk frontmatter parsers

**Severity:** IMPORTANT -- same class of bug, different attack surface

The fix was applied only to `_file_to_jsonl()` (line 208). However, **9 other locations** in `ticket` still use the vulnerable `in_front = !in_front` toggle pattern:

| Line | Function | Risk |
|------|----------|------|
| 153 | `ticket_path()` | LOW -- only reads `id:` field; unlikely to find an `id:` in body that matches a search query, but semantically wrong |
| 412 | `cmd_dep_tree()` | MEDIUM -- reads id, status, deps, title. A `---` in body could cause false deps/status to be picked up |
| 596 | `cmd_dep_cycle()` | MEDIUM -- same fields as dep_tree |
| 771 | `cmd_ls()` | MEDIUM -- reads id, status, assignee, tags, deps, title |
| 817 | `cmd_ready()` | MEDIUM -- reads id, status, priority, assignee, tags, deps, title |
| 912 | `cmd_closed()` | MEDIUM -- reads id, status, assignee, tags, title |
| 954 | `cmd_blocked()` | MEDIUM -- reads id, status, priority, assignee, tags, deps, title |
| 1238 | `cmd_show()` (first pass) | MEDIUM -- reads id, status, deps, links, parent, title |
| 1283 | `cmd_show()` (getline re-read) | LOW -- only checks `parent:` field for enhancement |

**Recommendation:** Fix all of them in this same PR since the fix pattern is identical and well-understood. This also screams DRY -- the frontmatter parsing pattern is duplicated ~10 times across the codebase, which is a pre-existing issue worth noting but out of scope for this bug fix.

**At minimum**, create a follow-up ticket (`tk create`) for fixing the remaining 9 instances if not fixing them in this PR.

### 2. Missing CHANGELOG entry

Per `CLAUDE.md`: "Update CHANGELOG.md when committing notable changes" and "Bug fixes" are listed under changes that need logging.

The `[Unreleased]` section of `CHANGELOG.md` does not include an entry for this fix. Add:

```markdown
### Fixed
- `_file_to_jsonl()` no longer re-enters frontmatter parsing when body contains `---` horizontal rules
```

---

## Suggestions

### 1. Test could additionally verify the legitimate frontmatter fields ARE still present

The test at `features/ticket_query.feature:65-72` verifies that `fake_field` and `leaked_value` are NOT in the output, but does not verify that the legitimate frontmatter fields (e.g., `query-001`, `HR ticket`) ARE still present. Adding one more assertion line would make the test more robust against a scenario where the fix accidentally breaks all parsing:

```gherkin
    And the output should contain "query-001"
    And the output should contain "HR ticket"
```

This is non-blocking but would strengthen the test.

### 2. Consider extracting a shared awk frontmatter preamble (follow-up)

The frontmatter parsing logic (BEGIN, FNR==1 reset, `---` detection) is duplicated across ~10 awk invocations. A future refactor could extract this into a shared awk include/function or a shell function that generates the common preamble. This is explicitly out-of-scope for this PR but worth a follow-up ticket.

---

## Correctness Analysis

### The counter-based fix is correct

- `front_count` starts at 0, incremented on each `---`
- `in_front = (front_count == 1)` is true ONLY between the first and second `---`
- After the second `---`, `front_count >= 2`, so `in_front` stays 0 permanently
- `front_count` is reset to 0 in the `FNR==1` block, so multi-file processing works correctly

### Edge cases

- **No frontmatter (no `---` at all):** `front_count` stays 0, `in_front` never becomes 1 -- correct, nothing parsed
- **Only opening `---` (malformed):** `front_count` becomes 1, `in_front` becomes 1, entire file treated as frontmatter until next file resets -- same behavior as before, acceptable for malformed input
- **Multiple files in one awk invocation:** `front_count` reset in `FNR==1` block alongside `in_front` -- correct

### Existing tests

All 121 non-plugin scenarios pass. The 9 plugin failures are pre-existing (exit code 126, permission/environment issues). No existing tests were removed or modified.

---

## Test Coverage Assessment

The new scenario at `features/ticket_query.feature:65-72` covers the core regression case well:

1. Creates a ticket with known ID
2. Appends body content with `---` and `fake_field: leaked_value`
3. Runs `query`
4. Verifies JSONL is valid
5. Verifies `fake_field` and `leaked_value` are NOT in output

The step definition at `features/steps/ticket_steps.py:252-258` creates a realistic scenario with prose before the `---` and a `key: value` line after it.

---

## Files Reviewed

- `/usr/local/workplace/mirror/thorg-root-mirror-5/submodules/note-ticket/ticket` (line 200-215) -- the fix
- `/usr/local/workplace/mirror/thorg-root-mirror-5/submodules/note-ticket/features/ticket_query.feature` (line 65-72) -- new test
- `/usr/local/workplace/mirror/thorg-root-mirror-5/submodules/note-ticket/features/steps/ticket_steps.py` (line 252-258) -- new step def
- `/usr/local/workplace/mirror/thorg-root-mirror-5/submodules/note-ticket/CHANGELOG.md` -- missing entry

---

## Convergence Signal

**Not ready for convergence.** Two IMPORTANT items need addressing:

1. Fix the remaining 9 instances of the same bug (or create follow-up ticket with explicit justification for deferral)
2. Add CHANGELOG entry
