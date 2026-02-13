# Plan Review: `closed_iso` Field

## Executive Summary

The plan is well-scoped, minimal, and correct. It follows existing codebase patterns faithfully, introduces no unnecessary complexity, and includes thorough BDD test coverage. There are two minor issues worth adjusting before implementation, but no blockers. **PLAN_ITERATION can be skipped** -- the implementer can apply these minor adjustments inline.

## Critical Issues (BLOCKERS)

None.

## Major Concerns

None.

## Minor Issues (apply during implementation)

### 1. `remove_yaml_field` operates on entire file, not just frontmatter

- **Issue:** The proposed `_sed_i "$file" "/^${field}:/d"` deletes any line in the file matching `^closed_iso:`, not just within the YAML frontmatter block. The plan acknowledges this in the "Edge cases" section and correctly notes it is safe in practice since `closed_iso` is a machine-managed field that would never appear as a line-start pattern in the body.
- **Assessment:** This is consistent with `update_yaml_field()` which also operates on the whole file via `_grep -q "^${field}:"`. Since both functions share the same scope assumption, this is acceptable. No change needed.

### 2. Test scenario "Reopening a closed ticket removes closed_iso" uses Given step that bypasses `cmd_status`

- **Issue:** The `step_ticket_has_status` Given step (line 175 of `ticket_steps.py`) directly edits the file with regex substitution, so it sets `status: closed` but does NOT add a `closed_iso` field. This means the "Reopening" scenario tests that `remove_yaml_field` is a no-op when the field is absent, rather than testing the full close-then-reopen flow.
- **Assessment:** The plan correctly identifies this at line 196 and notes the "Close-reopen-close cycle" scenario covers the full end-to-end flow. However, for better test clarity, I recommend changing the "Reopening a closed ticket" scenario to use `ticket close test-0001` command instead of the Given step, so it actually tests removal of an existing `closed_iso` field. This makes the scenario name match its actual behavior.
- **Recommendation:** Change the scenario to:

```gherkin
  Scenario: Reopening a closed ticket removes closed_iso
    When I run "ticket close test-0001"
    Then the command should succeed
    And ticket "test-0001" should have a valid "closed_iso" timestamp
    When I run "ticket reopen test-0001"
    Then the command should succeed
    And ticket "test-0001" should have field "status" with value "open"
    And ticket "test-0001" should not have field "closed_iso"
```

Similarly for "Setting status to in_progress removes closed_iso":

```gherkin
  Scenario: Setting status to in_progress removes closed_iso
    When I run "ticket close test-0001"
    Then the command should succeed
    And ticket "test-0001" should have a valid "closed_iso" timestamp
    When I run "ticket status test-0001 in_progress"
    Then the command should succeed
    And ticket "test-0001" should have field "status" with value "in_progress"
    And ticket "test-0001" should not have field "closed_iso"
```

This ensures both scenarios actually test field removal, not just no-op idempotency.

### 3. CLAUDE.md update is unnecessary scope creep

- **Issue:** Phase 4 adds "Every new feature or behavior change MUST include BDD scenarios" to CLAUDE.md. This is a documentation principle change unrelated to the `closed_iso` feature itself.
- **Recommendation:** Drop Phase 4. The existing CLAUDE.md already says "When adding new commands or flags, add corresponding scenarios to the appropriate feature file." That is sufficient. Adding redundant guidance violates DRY.

## Simplification Opportunities (PARETO)

None needed. The plan is already minimal -- approximately 60 lines of change across 4 files for a well-defined feature. This is a textbook 80/20 implementation.

## Strengths

- **Reuses existing infrastructure perfectly**: `_sed_i()`, `_iso_date()`, `update_yaml_field()`, `_grep()` -- no new plumbing needed.
- **Single point of change**: All status transitions go through `cmd_status()`, so `closed_iso` management is centralized.
- **Idempotency**: Both `update_yaml_field` (for re-closing) and `remove_yaml_field` (for reopening never-closed tickets) are properly idempotent.
- **JSONL output comes free**: `_file_to_jsonl()` auto-emits all frontmatter fields, so `closed_iso` appears in query output with zero additional work.
- **Comprehensive test scenarios**: 6 scenarios covering close, reopen, status-to-in_progress, never-closed, status-close, and the critical close-reopen-close cycle.
- **Portable**: All new code uses existing portable primitives (`_sed_i`, `_grep`). No new portability concerns.
- **Consistent with existing patterns**: `remove_yaml_field` mirrors `update_yaml_field` style exactly.

## Future Opportunity (out of scope, noting for awareness)

`cmd_closed()` currently sorts by file mtime. With `closed_iso` now available, a future enhancement could sort by `closed_iso` for more reliable ordering. Not in scope for this change.

## Verdict

- [x] APPROVED WITH MINOR REVISIONS
- Minor revision 1: Adjust "Reopening" and "Setting status to in_progress" scenarios to use `ticket close` command instead of Given step (ensures field removal is actually tested, not just no-op)
- Minor revision 2: Drop Phase 4 (CLAUDE.md update) -- it duplicates existing guidance
- PLAN_ITERATION can be skipped. These adjustments are small enough for the implementer to apply inline.
