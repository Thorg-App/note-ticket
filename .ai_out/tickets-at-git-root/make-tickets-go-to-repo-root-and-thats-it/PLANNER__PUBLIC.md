# Implementation Plan: find_tickets_dir stops at .git boundary

## 1. Problem Understanding

**Goal:** Make `find_tickets_dir()` respect git repository boundaries. Currently it walks up indefinitely looking for `.tickets/`, which causes submodules to leak into parent repo ticket directories.

**Desired behavior:** Walk up from `$PWD`, at each level check:
1. `.tickets/` directory exists -- use it (unchanged)
2. `.git` (file OR directory) exists -- stop here, return `<dir>/.tickets`

Walking NEVER continues past a `.git` boundary. This means:
- Submodules (`.git` file) get their own `.tickets/` beside the `.git` file
- Regular repos (`.git` directory) get `.tickets/` at repo root
- If neither `.tickets/` nor `.git` is found all the way to `/`, same behavior as today (return 1)

**Constraints:**
- `TICKETS_DIR` env var still takes absolute priority (no change)
- Read commands must fail gracefully when the resolved `.tickets` path does not exist yet
- Write commands (`create`) must create `.tickets/` at the resolved location

## 2. Code Changes

### 2.1 Modify `find_tickets_dir()` in `/usr/local/workplace/mirror/thorg-root-mirror-6/submodules/note-ticket/ticket` (lines 8-27)

**Current code:**
```bash
find_tickets_dir() {
    [[ -n "${TICKETS_DIR:-}" ]] && { echo "$TICKETS_DIR"; return 0; }
    local dir="$PWD"
    while [[ "$dir" != "/" ]]; do
        if [[ -d "$dir/.tickets" ]]; then
            echo "$dir/.tickets"
            return 0
        fi
        dir=$(dirname "$dir")
    done
    [[ -d "/.tickets" ]] && { echo "/.tickets"; return 0; }
    return 1
}
```

**New code:**
```bash
find_tickets_dir() {
    # Explicit env var takes priority
    [[ -n "${TICKETS_DIR:-}" ]] && { echo "$TICKETS_DIR"; return 0; }

    # Walk parents looking for .tickets or .git boundary
    local dir="$PWD"
    while [[ "$dir" != "/" ]]; do
        if [[ -d "$dir/.tickets" ]]; then
            echo "$dir/.tickets"
            return 0
        fi
        # .git (file for submodules, directory for regular repos) = repo root boundary
        if [[ -e "$dir/.git" ]]; then
            echo "$dir/.tickets"
            return 0
        fi
        dir=$(dirname "$dir")
    done

    # Check root too
    [[ -d "/.tickets" ]] && { echo "/.tickets"; return 0; }

    # Not found
    return 1
}
```

**Key design decisions:**
- Use `[[ -e "$dir/.git" ]]` which matches both files and directories. This is the simplest, most correct check.
- `.tickets/` check comes BEFORE `.git` check. This preserves existing behavior: if `.tickets/` exists at some ancestor, it wins. The `.git` check is purely a boundary -- it prevents walking further up.
- When `.git` is found without `.tickets/`, we still return success (return 0) with the path `<dir>/.tickets`. The directory may not exist yet -- that is handled by `init_tickets_dir()`.

### 2.2 Modify `init_tickets_dir()` in `/usr/local/workplace/mirror/thorg-root-mirror-6/submodules/note-ticket/ticket` (lines 33-56)

**Current fallback logic (when `find_tickets_dir` returns 1):**
```bash
    if [[ $is_write_cmd -eq 1 ]]; then
        TICKETS_DIR=".tickets"
        return 0
    fi
```

This fallback is for the case where NO `.tickets/` AND NO `.git` was found anywhere. In that case, write commands still default to `$PWD/.tickets` (current directory). **This fallback remains unchanged.**

The important change is that `find_tickets_dir` now returns success (return 0) with a potentially non-existent `.tickets` path when `.git` is found. The existing `init_tickets_dir` already handles this correctly:

```bash
    if TICKETS_DIR=$(find_tickets_dir); then
        # For read commands, verify the directory exists
        if [[ $is_write_cmd -eq 0 ]] && [[ ! -d "$TICKETS_DIR" ]]; then
            echo "Error: tickets directory '$TICKETS_DIR' does not exist" >&2
            return 1
        fi
        return 0
    fi
```

- Read commands: the `-d` check catches non-existent `.tickets` and errors. **No change needed.**
- Write commands: `TICKETS_DIR` is set to the path, `cmd_create` (line 254) calls `ensure_dir` (line 125) which does `mkdir -p "$TICKETS_DIR"`. **No change needed.**

**Verified:** `cmd_create` at line 254 calls `ensure_dir()` (line 125-127: `mkdir -p "$TICKETS_DIR"`).

### 2.3 Summary of code changes

Only `find_tickets_dir()` changes. One new condition added inside the while loop. Everything else works as-is.

## 3. Test Changes

### 3.1 Update existing scenario in `/usr/local/workplace/mirror/thorg-root-mirror-6/submodules/note-ticket/features/ticket_directory.feature`

**Scenario: "Create ticket initializes in current directory when no parent has tickets"** (line 29)

This scenario currently creates a subdirectory `new-project/`, navigates there, runs `create`, and expects `.tickets/` in `new-project/`. With the new behavior, this still works correctly IF there is no `.git` in any parent. Since tests run in a temp dir that has no `.git`, the fallback path (`TICKETS_DIR=".tickets"`) still triggers. **No change needed to this scenario.**

However, we should ADD new scenarios to cover the `.git` boundary behavior:

### 3.2 New test scenarios

Add these to `ticket_directory.feature`:

```gherkin
  Scenario: Stop at .git directory (regular repo root)
    Given the tickets directory does not exist
    And a .git directory exists in the test root
    And I am in subdirectory "src/components"
    When I run "ticket create 'Repo root ticket'"
    Then the command should succeed
    And the output should be valid JSON with an id field
    And tickets directory should exist in test root

  Scenario: Stop at .git file (submodule root)
    Given the tickets directory does not exist
    And a .git file exists in the test root
    And I am in subdirectory "lib/utils"
    When I run "ticket create 'Submodule ticket'"
    Then the command should succeed
    And the output should be valid JSON with an id field
    And tickets directory should exist in test root

  Scenario: Existing .tickets takes priority over .git in same directory
    Given a .git directory exists in the test root
    And a ticket exists with ID "existing-001" and title "Existing ticket"
    And I am in subdirectory "src"
    When I run "ticket ls"
    Then the command should succeed
    And the output should contain "existing-001"

  Scenario: .tickets in ancestor takes priority over .git in descendant
    Given a ticket exists with ID "ancestor-001" and title "Ancestor ticket"
    And a .git directory exists in subdirectory "child-repo"
    And I am in subdirectory "src"
    When I run "ticket ls"
    Then the command should succeed
    And the output should contain "ancestor-001"

  Scenario: Read command fails gracefully at .git boundary with no tickets
    Given the tickets directory does not exist
    And a .git directory exists in the test root
    And I am in subdirectory "src"
    When I run "ticket ls"
    Then the command should fail
    And the output should contain "does not exist"

  Scenario: Do not walk past .git boundary into parent
    Given a ticket exists with ID "outer-001" and title "Outer ticket"
    And a .git directory exists in subdirectory "inner-repo"
    And I am in subdirectory "inner-repo/deep/path"
    When I run "ticket ls"
    Then the command should fail
    And the output should contain "does not exist"
```

**How this scenario works:**
- Background creates `.tickets/` at `context.test_dir` (the outer repo)
- `create_ticket` puts "outer-001" in `context.test_dir/.tickets/`
- `.git` is created at `context.test_dir/inner-repo/.git/`
- Working dir is `context.test_dir/inner-repo/deep/path/`
- `find_tickets_dir` walks up, finds `.git` at `inner-repo/`, returns `inner-repo/.tickets` (does not exist)
- Read command fails with "does not exist" -- correctly proving the walk did NOT reach the outer `.tickets/`

### 3.3 New step definitions

Add to `/usr/local/workplace/mirror/thorg-root-mirror-6/submodules/note-ticket/features/steps/ticket_steps.py`:

```python
@given(r'a \.git directory exists in the test root')
def step_git_dir_in_test_root(context):
    """Create a .git directory in the test root (simulates regular repo)."""
    git_dir = Path(context.test_dir) / '.git'
    git_dir.mkdir(parents=True, exist_ok=True)


@given(r'a \.git file exists in the test root')
def step_git_file_in_test_root(context):
    """Create a .git file in the test root (simulates submodule)."""
    git_file = Path(context.test_dir) / '.git'
    git_file.write_text('gitdir: ../../../.git/modules/my-submodule\n')


@given(r'a \.git directory exists in subdirectory "(?P<subdir>[^"]+)"')
def step_git_dir_in_subdir(context, subdir):
    """Create a .git directory in the specified subdirectory."""
    subdir_path = Path(context.test_dir) / subdir
    subdir_path.mkdir(parents=True, exist_ok=True)
    git_dir = subdir_path / '.git'
    git_dir.mkdir(parents=True, exist_ok=True)


@then(r'tickets directory should exist in test root')
def step_tickets_dir_exists_in_test_root(context):
    """Assert .tickets directory exists in the test root directory."""
    tickets_dir = Path(context.test_dir) / '.tickets'
    assert tickets_dir.exists(), f".tickets directory does not exist in test root {context.test_dir}"
```

### 3.4 Test step for "tickets directory should exist in test root"

Already defined above. Note this is different from the existing `tickets directory should exist in current subdirectory` step -- the new step checks `context.test_dir` (the root) rather than `context.working_dir`.

## 4. Impact on init_tickets_dir

As analyzed in section 2.2, **no changes needed to `init_tickets_dir()`**. The existing logic handles the new return values correctly:

| find_tickets_dir result | .tickets exists? | Write cmd | Read cmd |
|---|---|---|---|
| Returns path (found .tickets/) | Yes | Works (existing) | Works (existing) |
| Returns path (found .git, no .tickets/) | No | mkdir -p creates it | Fails with "does not exist" |
| Returns 1 (nothing found) | N/A | Falls back to `$PWD/.tickets` | Fails with "no .tickets directory found" |

**Verified:** `cmd_create` (line 254) calls `ensure_dir()` (line 125) which does `mkdir -p "$TICKETS_DIR"`.

## 5. Acceptance Criteria

1. `find_tickets_dir()` stops at `.git` boundary (file or directory)
2. `.tickets/` found before `.git` still wins (no behavior change for existing repos)
3. `.git` found before `.tickets/` returns `<git_root>/.tickets` (may not exist yet)
4. `create` command at a `.git` boundary creates `.tickets/` at that root
5. Read commands at a `.git` boundary fail gracefully when `.tickets/` does not exist
6. Walking never continues past a `.git` boundary
7. `TICKETS_DIR` env var still overrides everything
8. All existing tests pass (backward compatible)
9. New tests cover: regular repo `.git` dir, submodule `.git` file, priority order, boundary enforcement

## 6. CHANGELOG Entry

Add under `## [Unreleased]` in the `### Added` section (or create one):

```markdown
### Added
- `find_tickets_dir` now stops at `.git` boundaries (file or directory), anchoring tickets to the repository root instead of walking into parent repositories
```

## 7. Implementation Order

1. **Write the new test scenarios first** (they should fail against current code)
2. **Modify `find_tickets_dir()`** (the 2-line addition)
3. **Run all tests** -- new and existing should pass
4. **Update CHANGELOG.md**
5. **Commit**

## 8. Open Questions

None. This is a focused, well-scoped change.
