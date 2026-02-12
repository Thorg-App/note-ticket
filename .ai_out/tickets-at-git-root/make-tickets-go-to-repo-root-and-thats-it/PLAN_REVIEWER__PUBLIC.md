# Plan Review: find_tickets_dir stops at .git boundary

## Executive Summary

The plan is well-scoped and correct. A 2-line code change with solid test coverage. I have one behavioral concern about `.tickets/` in ancestor taking priority over `.git` boundary in descendant, one test scenario that is misleading in its naming, and a few minor adjustments. None are blockers -- PLAN_ITERATION can be skipped if the inline adjustments below are adopted.

## Critical Issues (BLOCKERS)

None.

## Major Concerns

### 1. Semantic confusion: `.tickets in ancestor takes priority over .git in descendant`

- **Concern:** The test scenario "`.tickets in ancestor takes priority over .git in descendant`" is named misleadingly. The scenario has `.tickets/` at `test_root/` and `.git` at `test_root/child-repo/`. The user is in `test_root/src/`. The `.git` at `child-repo/` is completely irrelevant -- the user is NOT in the `child-repo` subtree. This scenario does NOT test priority at all; it just tests normal `.tickets/` discovery from a sibling subtree.

- **Why:** The name implies a priority decision is being made between `.tickets` and `.git`, but no such decision occurs. The walk from `test_root/src` goes to `test_root/`, finds `.tickets/`, and stops. It never encounters `child-repo/.git` because `child-repo` is not an ancestor of `src`.

- **Suggestion:** Rename to something like "`.tickets found normally when .git exists in unrelated subdirectory`" or simply remove it -- the existing "Find tickets in parent directory" scenario already covers finding `.tickets/` in an ancestor. If kept, the scenario name must not imply a priority decision that is not being tested.

### 2. Missing critical scenario: `.git` at current level, `.tickets/` at parent level

- **Concern:** The plan does not test the most important submodule scenario: you are IN a submodule (`.git` file exists at its root), and the PARENT repo has `.tickets/`. The `.git` boundary should PREVENT walking up to the parent's `.tickets/`. This is the entire reason for the feature.

- **Why:** This is the motivating use case from the problem statement ("submodules leak into parent repo ticket directories"). Without this test, we have not captured the primary user behavior.

- **Suggestion:** The "Do not walk past .git boundary into parent" scenario is close but tests from `inner-repo/deep/path/` which adds unnecessary depth. More importantly, we should have an explicit scenario where:
  1. Parent has `.tickets/` (the outer repo)
  2. Current directory has `.git` (the submodule root -- use a `.git` file to simulate submodule)
  3. Running `tk create` should create `.tickets/` at the CURRENT level (beside the `.git` file), NOT use the parent's `.tickets/`

  This scenario is subtly different from "Do not walk past .git boundary" because it tests a WRITE command (create) that should anchor to the submodule root, not a READ command that should fail.

  Proposed additional scenario:
  ```gherkin
  Scenario: Create in submodule does not use parent repo tickets
    Given a ticket exists with ID "parent-001" and title "Parent ticket"
    And a .git file exists in subdirectory "my-submodule"
    And I am in subdirectory "my-submodule"
    When I run "ticket create 'Submodule ticket'"
    Then the command should succeed
    And the output should be valid JSON with an id field
    And tickets directory should exist in subdirectory "my-submodule"
  ```

  This requires one new step: `tickets directory should exist in subdirectory "<path>"`.

## Simplification Opportunities (PARETO)

- The plan is already simple. One function change, 2 new lines of bash. No simplification needed.

## Minor Suggestions

### 1. Step definition: `.git file exists in subdirectory` is missing

The plan defines `a .git directory exists in subdirectory "<subdir>"` but does NOT define `a .git file exists in subdirectory "<subdir>"`. The "Do not walk past .git boundary" scenario uses `a .git directory exists in subdirectory "inner-repo"` which works, but for completeness and for the new submodule-at-subdir scenario, consider adding the file variant too.

### 2. The `/.tickets` check at root

After the new `.git` boundary logic, the `/.tickets` root check at line 23 is still present. This is fine (no change needed), but worth noting: if someone has `.git` at `/` (unlikely but theoretically possible), the loop would already return `/` + `.tickets` before reaching this check. The check is now only reachable if there is no `.git` anywhere in the path AND no `.tickets` anywhere. This is correct and harmless.

### 3. CHANGELOG entry should be under "Changed" not "Added"

The plan proposes adding the entry under "### Added". However, this is modifying existing behavior of `find_tickets_dir`, not adding a new feature. It should go under "### Changed":

```markdown
### Changed
- `find_tickets_dir` now stops at `.git` boundaries (file or directory), anchoring tickets to the repository root instead of walking into parent repositories
```

### 4. Existing test "Create ticket initializes in current directory when no parent has tickets"

The plan correctly identifies this test still works because temp dirs have no `.git`. However, this test's behavior semantically changes: before this change, "no parent has tickets" meant "walked all the way to `/` without finding `.tickets/`". After this change, if there were a `.git` somewhere in `/tmp/ticket_test_XXXX/`'s ancestry, the walk would stop earlier. Since `/tmp/` has no `.git`, the behavior is identical in practice. No action needed, just worth noting.

## Strengths

1. **Minimal code change**: 2 lines added to one function. Everything else works as-is. This is the ideal 80/20 solution.
2. **Correct use of `-e` instead of `-d`**: Catches both `.git` directories (regular repos) and `.git` files (submodules) with one test.
3. **No changes to `init_tickets_dir`**: The analysis correctly identifies that the existing read/write handling already covers the new return value semantics.
4. **Good test coverage**: 6 new scenarios covering regular repos, submodules, priority, boundary enforcement, and graceful failure.
5. **Implementation order**: Tests first, then implementation. Correct approach.
6. **Thorough analysis table**: The impact table in section 4 clearly maps all cases.

## Verdict

- [x] APPROVED WITH MINOR REVISIONS

**Required revisions (can be done inline by implementor):**
1. Add the "Create in submodule does not use parent repo tickets" scenario (the primary use case).
2. Rename or remove the misleading "`.tickets in ancestor takes priority over .git in descendant`" scenario.
3. Move CHANGELOG entry from "Added" to "Changed".
4. Add a step definition for `.git file exists in subdirectory "<subdir>"` (needed for the new scenario in item 1).
5. Add step definition for `tickets directory should exist in subdirectory "<path>"` (needed for the new scenario in item 1).

**PLAN_ITERATION can be skipped** -- these are small, well-defined adjustments that the implementor can incorporate directly.
