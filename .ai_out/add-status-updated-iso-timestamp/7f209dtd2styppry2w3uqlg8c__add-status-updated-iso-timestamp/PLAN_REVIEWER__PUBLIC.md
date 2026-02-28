# Plan Review: Add `status_updated_iso` Timestamp Field

## Executive Summary

The plan is well-structured, minimal, and correctly identifies all implementation points. Line references are verified accurate. The approach is KISS and PARETO-aligned -- two lines of script change, one fixture update, and targeted BDD scenarios. One minor gap found (second test fixture). Plan iteration can be skipped; inline adjustments below are sufficient.

## Critical Issues (BLOCKERS)

None.

## Major Concerns

None.

## Minor Issues (Inline Adjustments Applied)

### 1. Missing second test fixture update

**Issue:** The plan updates `create_ticket()` at line 62 but misses `step_separate_tickets_dir()` at line 310-323 (`features/steps/ticket_steps.py`). This second helper also hardcodes frontmatter without `status_updated_iso`. While no current status tests use this fixture, it would cause inconsistency -- tickets created by this helper would lack the field that real tickets have.

**Inline adjustment:** Add to Phase 2:

> **2b. `step_separate_tickets_dir()` helper -- line ~316**
>
> Add `status_updated_iso` to the hardcoded frontmatter, using the same hardcoded timestamp.
>
> **Location:** After `created_iso: 2024-01-01T00:00:00Z` (line 316)
> **Add:** `status_updated_iso: 2024-01-01T00:00:00Z`

### 2. New step definition may not be needed for creation scenario

**Issue:** The plan proposes a new parameterized step `the created ticket should have a valid "(?P<field>[^"]+)" timestamp` for the creation test. This is DRY-forward thinking, but the scenario could alternatively just run `ticket show` and use the existing `ticket "X" should have a valid "Y" timestamp` step (line 786). However, the plan's approach is actually cleaner -- it follows the existing pattern of "created ticket" steps used throughout `ticket_creation.feature`, and it generalizes a hardcoded step.

**Verdict:** Accepted as-is. The generalization is warranted since it may be reused for other timestamp fields in the future.

### 3. Scenario naming clarification

**Minor:** The status test scenario "status_updated_iso is preserved when reopening (not removed like closed_iso)" is a good contrast scenario, but the parenthetical could be dropped from the scenario name for cleanliness. The behavior speaks for itself -- the absence of a "should not have field" assertion makes the contrast implicit.

**Suggestion (non-blocking):** Consider simplifying to:
```gherkin
Scenario: Reopening preserves status_updated_iso
```

## Simplification Opportunities (PARETO)

None needed. The plan is already minimal -- 2 lines of bash, 1 fixture line, 2-3 BDD scenarios. This IS the 80/20 solution.

## Verification of Line References

All line references verified against actual source:

| Reference | Plan Says | Actual | Status |
|-----------|-----------|--------|--------|
| `_iso_date()` | ~73 | 73-75 | CORRECT |
| `update_yaml_field()` | ~188 | 188-201 | CORRECT |
| `cmd_create()` / `$now` | ~306 | 306 | CORRECT |
| `echo "created_iso: $now"` | ~316 | 316 | CORRECT |
| `cmd_status()` / `update_yaml_field` | ~375 | 375 | CORRECT |
| `closed_iso` if-block | ~377 | 377-381 | CORRECT |
| Test fixture `created_iso` | ~62 | 62 | CORRECT |
| Hardcoded timestamp step | ~590 | 590-599 | CORRECT |
| Generic timestamp step | ~786 | 786-793 | CORRECT |

## BDD Scenario Coverage Assessment

The proposed scenarios cover:

1. **Creation**: Field exists with valid timestamp at creation -- GOOD
2. **Status change**: Field updated on status transition -- GOOD
3. **Reopen**: Field preserved (not removed like `closed_iso`) -- GOOD, important contrast

**Missing but acceptable to skip (PARETO):**
- Testing that `status_updated_iso` appears in JSONL output -- already covered implicitly because `_file_to_jsonl()` auto-includes all frontmatter fields. The existing `query` tests would catch a regression in that mechanism.
- Testing that `status_updated_iso` differs from `created_iso` after a status change -- would require `sleep 1` or time mocking. Not worth the complexity.

## Strengths

- **Exact reuse of `$now`** in `cmd_create()` is the right call. Single `_iso_date()` call means `created_iso` and `status_updated_iso` are guaranteed identical at creation.
- **Unconditional update** in `cmd_status()` is simpler than the conditional `closed_iso` logic. Correctly follows KISS.
- **No changes to `_file_to_jsonl()`** -- leverages the existing generic awk parser. Zero coupling.
- **Placement** of the new line (after status update, before `closed_iso` logic) is logical and reads well.
- **Correct identification** that this is simpler than `closed_iso` (no conditional, no removal).

## Verdict

- [x] **APPROVED WITH MINOR REVISIONS**
- The only required revision is adding the second fixture update (item 1 above).
- **PLAN_ITERATION can be skipped** -- the adjustment is minor and clearly defined. The implementer can apply it directly.
