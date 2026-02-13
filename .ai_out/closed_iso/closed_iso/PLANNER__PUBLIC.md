# Implementation Plan: `closed_iso` Field

## 1. Problem Understanding

**Goal:** When a ticket's status transitions to "closed", record the timestamp in a `closed_iso` frontmatter field. When the ticket is reopened (status set to anything other than "closed"), remove that field.

**Constraints:**
- Portable bash (BSD and GNU compatible)
- Reuse existing infrastructure: `_sed_i()`, `_iso_date()`, `update_yaml_field()`
- Minimal changes -- this is a small, focused feature
- BDD test coverage required

**Assumptions:**
- The `closed_iso` field uses the same UTC ISO format as `created_iso` (i.e., `_iso_date()` output: `YYYY-MM-DDTHH:MM:SSZ`)
- The field is purely metadata managed by the status command; `cmd_create()` never sets it
- The `closed_iso` field should appear in JSONL output from `_file_to_jsonl()` automatically (it already emits all frontmatter key-value pairs)

---

## 2. High-Level Architecture

No architectural changes. This is a behavioral enhancement to the existing `cmd_status()` function, plus one new utility function.

**Data flow:**
```
cmd_close / cmd_reopen / cmd_status
    --> cmd_status(id, new_status)
        --> update_yaml_field(file, "status", new_status)
        --> IF new_status == "closed": update_yaml_field(file, "closed_iso", timestamp)
        --> IF new_status != "closed": remove_yaml_field(file, "closed_iso")
```

---

## 3. Implementation Phases

### Phase 1: Add `remove_yaml_field()` utility function

**Goal:** Provide a reusable function to remove a YAML frontmatter field from a ticket file.

**File:** `/usr/local/workplace/thorg-root/submodules/note-ticket/ticket`

**Key Steps:**
1. Add `remove_yaml_field()` function immediately after `update_yaml_field()` (around line 201).
2. The function takes two arguments: `file` and `field`.
3. It should use `_sed_i` to delete the line matching `^${field}:` within the frontmatter block only (between the first pair of `---` delimiters).
4. If the field does not exist, the function should be a no-op (idempotent).

**Implementation approach:**
```
remove_yaml_field() {
    local file="$1"
    local field="$2"
    # Only remove if field exists (avoid unnecessary file writes)
    if _grep -q "^${field}:" "$file"; then
        _sed_i "$file" "/^${field}:/d"
    fi
}
```

**Note:** The `_grep` + `_sed_i` pattern mirrors how `update_yaml_field()` checks for field existence. The `_sed_i` function already handles BSD/GNU portability via the temp-file-and-mv approach. The `/d` sed command deletes matching lines. Since YAML frontmatter fields are unique and single-line (no multi-line values in this codebase), this simple approach is sufficient.

**Verification:** Phase 3 tests will exercise this.

---

### Phase 2: Modify `cmd_status()` to manage `closed_iso`

**Goal:** Add/remove the `closed_iso` field based on the target status.

**File:** `/usr/local/workplace/thorg-root/submodules/note-ticket/ticket`

**Location:** `cmd_status()` function (lines 351-368)

**Key Steps:**
1. After the existing `update_yaml_field "$file" "status" "$status"` call (line 366), add logic:
   - If `$status` is `"closed"`: call `update_yaml_field "$file" "closed_iso" "$(_iso_date)"`
   - If `$status` is NOT `"closed"`: call `remove_yaml_field "$file" "closed_iso"`

**The modified `cmd_status()` should look like:**
```bash
cmd_status() {
    if [[ $# -lt 2 ]]; then
        echo "Usage: $(basename "$0") status <id> <status>" >&2
        echo "Valid statuses: $VALID_STATUSES" >&2
        return 1
    fi

    local id="$1"
    local status="$2"

    validate_status "$status" || return 1

    local file
    file=$(ticket_path "$id") || return 1

    update_yaml_field "$file" "status" "$status"

    if [[ "$status" == "closed" ]]; then
        update_yaml_field "$file" "closed_iso" "$(_iso_date)"
    else
        remove_yaml_field "$file" "closed_iso"
    fi

    echo "Updated $(id_from_file "$file") -> $status"
}
```

**Design decisions:**
- The `remove_yaml_field` call in the `else` branch is idempotent -- if the ticket was never closed, it simply does nothing. This keeps the logic unconditional and simple.
- No changes needed to `cmd_start()`, `cmd_close()`, `cmd_reopen()` since they all delegate to `cmd_status()`.

**Verification:** Phase 3 tests.

---

### Phase 3: Add BDD scenarios to `ticket_status.feature`

**Goal:** Cover the `closed_iso` behavior with BDD tests.

**File:** `/usr/local/workplace/thorg-root/submodules/note-ticket/features/ticket_status.feature`

**New step definition needed:** A step to assert a field does NOT exist in a ticket's frontmatter.

**File:** `/usr/local/workplace/thorg-root/submodules/note-ticket/features/steps/ticket_steps.py`

Add a new `@then` step:
```python
@then(r'ticket "(?P<ticket_id>[^"]+)" should not have field "(?P<field>[^"]+)"')
def step_ticket_should_not_have_field(context, ticket_id, field):
    """Assert ticket does not have a specific field in frontmatter."""
    ticket_path = find_ticket_file(context, ticket_id)
    content = ticket_path.read_text()
    pattern = rf'^{re.escape(field)}:'
    assert not re.search(pattern, content, re.MULTILINE), \
        f"Field '{field}' should not exist in ticket but was found\nContent: {content}"
```

Also add a step to assert `closed_iso` contains a valid ISO timestamp:
```python
@then(r'ticket "(?P<ticket_id>[^"]+)" should have a valid "(?P<field>[^"]+)" timestamp')
def step_ticket_has_valid_timestamp(context, ticket_id, field):
    """Assert ticket has a valid ISO timestamp in the specified field."""
    ticket_path = find_ticket_file(context, ticket_id)
    content = ticket_path.read_text()
    pattern = rf'^{re.escape(field)}:\s*\d{{4}}-\d{{2}}-\d{{2}}T\d{{2}}:\d{{2}}:\d{{2}}Z'
    assert re.search(pattern, content, re.MULTILINE), \
        f"No valid ISO timestamp found in field '{field}'\nContent: {content}"
```

**Scenarios to add** (append to end of `ticket_status.feature`):

```gherkin
  Scenario: Closing a ticket sets closed_iso timestamp
    When I run "ticket close test-0001"
    Then the command should succeed
    And ticket "test-0001" should have field "status" with value "closed"
    And ticket "test-0001" should have a valid "closed_iso" timestamp

  Scenario: Reopening a closed ticket removes closed_iso
    Given ticket "test-0001" has status "closed"
    When I run "ticket reopen test-0001"
    Then the command should succeed
    And ticket "test-0001" should have field "status" with value "open"
    And ticket "test-0001" should not have field "closed_iso"

  Scenario: Setting status to in_progress removes closed_iso
    Given ticket "test-0001" has status "closed"
    When I run "ticket status test-0001 in_progress"
    Then the command should succeed
    And ticket "test-0001" should have field "status" with value "in_progress"
    And ticket "test-0001" should not have field "closed_iso"

  Scenario: Ticket that was never closed has no closed_iso
    When I run "ticket start test-0001"
    Then the command should succeed
    And ticket "test-0001" should not have field "closed_iso"

  Scenario: Closing via status command sets closed_iso
    When I run "ticket status test-0001 closed"
    Then the command should succeed
    And ticket "test-0001" should have a valid "closed_iso" timestamp

  Scenario: Close-reopen-close cycle updates closed_iso
    When I run "ticket close test-0001"
    Then the command should succeed
    And ticket "test-0001" should have a valid "closed_iso" timestamp
    When I run "ticket reopen test-0001"
    Then the command should succeed
    And ticket "test-0001" should not have field "closed_iso"
    When I run "ticket close test-0001"
    Then the command should succeed
    And ticket "test-0001" should have a valid "closed_iso" timestamp
```

**Note:** All scenarios reuse the existing Background which creates a ticket with ID "test-0001". The `step_ticket_has_status` Given step in `ticket_steps.py` directly modifies the file (setting status field), so the "Reopening a closed ticket" scenario correctly sets the ticket to closed state before running the reopen command. However, note that this direct file manipulation does NOT add `closed_iso` -- but that is fine because the `remove_yaml_field` is idempotent. If we want to also test that `closed_iso` is actually present before reopen removes it, we should use `ticket close` command instead of the Given step. The "Close-reopen-close cycle" scenario covers this end-to-end.

---

### Phase 4: Update CLAUDE.md

**Goal:** Add a note that every new feature requires BDD test coverage.

**File:** `/usr/local/workplace/thorg-root/submodules/note-ticket/CLAUDE.md`

**Key Steps:**
1. In the "Testing" section (currently reads "BDD tests using Behave..."), add a statement: "Every new feature or behavior change MUST include BDD scenarios in the appropriate feature file."

The updated Testing section should read:
```markdown
## Testing

BDD tests using [Behave](https://behave.readthedocs.io/). Run with `make test` (requires `uv`).

- Feature files: `features/*.feature` - Gherkin scenarios covering all commands
- Step definitions: `features/steps/ticket_steps.py`
- CI runs tests on push to master and all PRs
- **Every new feature or behavior change MUST include BDD scenarios in the appropriate feature file.**

When adding new commands or flags, add corresponding scenarios to the appropriate feature file.
```

---

### Phase 5: Update CHANGELOG.md

**File:** `/usr/local/workplace/thorg-root/submodules/note-ticket/CHANGELOG.md`

Under `## [Unreleased]` / `### Added`, add:
```
- `closed_iso` field automatically set when ticket is closed, removed when reopened
```

---

## 4. Technical Considerations

### Portability
- `_sed_i()` already handles BSD/GNU differences via temp file + mv. No new portability concerns.
- `_grep` (ripgrep or grep) is used for existence checks. Both support `-q` mode.
- The sed `/d` command for line deletion is POSIX-standard.

### Idempotency
- `remove_yaml_field()` is a no-op if the field does not exist.
- `update_yaml_field()` overwrites the field if it already exists (handles re-closing).
- The `closed_iso` timestamp is updated on every close, which is the correct behavior (it represents the most recent close time).

### Edge cases
- Closing an already-closed ticket: `closed_iso` gets updated to current time. This is intentional -- it records the most recent close.
- Reopening a ticket that was never closed: `remove_yaml_field` is a no-op. No error.
- The `_sed_i "/^${field}:/d"` pattern operates on the entire file, not just frontmatter. However, since `closed_iso` is a machine-managed field that only appears in frontmatter (never in body text as a line-start pattern), this is safe in practice. The `_grep` guard prevents unnecessary writes.

### Query/JSONL
- `_file_to_jsonl()` already emits all frontmatter fields. The `closed_iso` field will automatically appear in JSONL output when present.

---

## 5. Testing Strategy

### Acceptance Criteria

| # | Criterion | Verified By |
|---|-----------|-------------|
| AC1 | `ticket close <id>` adds `closed_iso` with valid ISO timestamp | Scenario: "Closing a ticket sets closed_iso timestamp" |
| AC2 | `ticket status <id> closed` adds `closed_iso` with valid ISO timestamp | Scenario: "Closing via status command sets closed_iso" |
| AC3 | `ticket reopen <id>` removes `closed_iso` field entirely | Scenario: "Reopening a closed ticket removes closed_iso" |
| AC4 | `ticket status <id> in_progress` removes `closed_iso` field | Scenario: "Setting status to in_progress removes closed_iso" |
| AC5 | `ticket start <id>` on never-closed ticket does not add `closed_iso` | Scenario: "Ticket that was never closed has no closed_iso" |
| AC6 | Close-reopen-close cycle correctly manages `closed_iso` | Scenario: "Close-reopen-close cycle updates closed_iso" |
| AC7 | All 9 existing status scenarios continue to pass | Baseline regression check |

### Running Tests
```bash
# Run only status tests during development
make test  # or: uv run --with behave behave features/ticket_status.feature

# Run full suite before committing
make test
```

---

## 6. Summary of Files to Modify

| File | Change |
|------|--------|
| `ticket` | Add `remove_yaml_field()` function (~5 lines) |
| `ticket` | Modify `cmd_status()` to add/remove `closed_iso` (~4 lines) |
| `features/ticket_status.feature` | Add 6 new scenarios (~35 lines) |
| `features/steps/ticket_steps.py` | Add 2 new step definitions (~15 lines) |
| `CLAUDE.md` | Add BDD test requirement sentence (~1 line) |
| `CHANGELOG.md` | Add entry under Unreleased/Added (~1 line) |

**Total estimated changes:** ~60 lines across 4 files (excluding CLAUDE.md and CHANGELOG.md which are docs-only).

---

## 7. Open Questions / Decisions

None. The feature is well-scoped and follows existing patterns. All implementation decisions are straightforward applications of existing infrastructure.
