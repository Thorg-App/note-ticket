# Implementation Plan: Add `status_updated_iso` Timestamp Field

## Problem Understanding

Add a `status_updated_iso` field that tracks when a ticket's status was last changed. Unlike `closed_iso` (which is conditionally set/removed), this field is:
- Set at creation time (same value as `created_iso`)
- Updated on every status change
- Never removed

This follows the existing `closed_iso` pattern but is simpler (unconditional set, no removal).

## Changes Required

### Phase 1: Script Changes (`ticket`, 2 locations)

#### 1a. `cmd_create()` -- line ~316

Add `status_updated_iso` to the frontmatter block, immediately after `created_iso`. The `$now` variable is already captured from `_iso_date()` at line 306, so reuse it.

**Location:** After `echo "created_iso: $now"` (line 316)
**Add:** `echo "status_updated_iso: $now"`

#### 1b. `cmd_status()` -- line ~375-381

Add an unconditional `update_yaml_field` call for `status_updated_iso` on every status change. Place it after the status field update and before the conditional `closed_iso` logic.

**Location:** After `update_yaml_field "$file" "status" "$status"` (line 375), before the `closed_iso` if-block (line 377)
**Add:** `update_yaml_field "$file" "status_updated_iso" "$(_iso_date)"`

No other script changes needed. `_file_to_jsonl()` auto-includes all frontmatter fields.

### Phase 2: Test Fixture Update (`features/steps/ticket_steps.py`)

#### 2a. `create_ticket()` helper -- line ~62

Add `status_updated_iso` to the hardcoded frontmatter in the test fixture, using the same hardcoded timestamp as `created_iso`.

**Location:** After `created_iso: 2024-01-01T00:00:00Z` (line 62)
**Add:** `status_updated_iso: 2024-01-01T00:00:00Z`

### Phase 3: BDD Test Scenarios

#### 3a. Creation test (`features/ticket_creation.feature`)

Add one scenario after the existing `created_iso` scenario (line 92):

```gherkin
Scenario: Ticket has status_updated_iso timestamp at creation
  When I run "ticket create 'Status tracked'"
  Then the command should succeed
  And the created ticket should have a valid "status_updated_iso" timestamp
```

This requires a **new step definition** since the existing `the created ticket should have a valid created timestamp` is hardcoded to `created_iso`. Add a generic version:

```python
@then(r'the created ticket should have a valid "(?P<field>[^"]+)" timestamp')
def step_created_ticket_has_valid_field_timestamp(context, field):
    """Assert the created ticket has a valid ISO timestamp in the specified field."""
    ticket_id = context.last_created_id
    ticket_path = find_ticket_file(context, ticket_id)
    content = ticket_path.read_text()
    pattern = rf'^{re.escape(field)}:\s*\d{{4}}-\d{{2}}-\d{{2}}T\d{{2}}:\d{{2}}:\d{{2}}Z'
    assert re.search(pattern, content, re.MULTILINE), \
        f"No valid ISO timestamp found in field '{field}'\nContent: {content}"
```

Place this near the existing hardcoded step (line ~590). The existing hardcoded step for `created_iso` can remain as-is to avoid breaking existing tests.

#### 3b. Status tests (`features/ticket_status.feature`)

Add the following scenarios at the end of the file:

```gherkin
Scenario: Status change updates status_updated_iso
  When I run "ticket status test-0001 in_progress"
  Then the command should succeed
  And ticket "test-0001" should have a valid "status_updated_iso" timestamp

Scenario: status_updated_iso is preserved when reopening (not removed like closed_iso)
  When I run "ticket close test-0001"
  Then the command should succeed
  And ticket "test-0001" should have a valid "status_updated_iso" timestamp
  When I run "ticket reopen test-0001"
  Then the command should succeed
  And ticket "test-0001" should have a valid "status_updated_iso" timestamp
```

The existing generic step `ticket "X" should have a valid "Y" timestamp` (line 786 in step defs) already handles validation -- no new step definition needed for these.

### Phase 4: CHANGELOG.md

Add under `## [Unreleased]` / `### Added`:
```
- `status_updated_iso` field: ISO8601 timestamp set at creation and updated on every status change
```

## Verification

Run `make test` -- all existing tests must pass, plus the new scenarios.

## Key Design Decisions

1. **Reuse `$now`** in `cmd_create()` so `created_iso` and `status_updated_iso` are identical at creation time (single `_iso_date()` call).
2. **Unconditional update** in `cmd_status()` -- simpler than `closed_iso`'s conditional logic. Every status transition (open, in_progress, closed) updates it.
3. **No removal** -- unlike `closed_iso`, `status_updated_iso` is never removed via `remove_yaml_field`.
4. **No changes to `_file_to_jsonl()`** -- it already auto-includes all frontmatter fields in JSONL output.
5. **Test fixture includes the field** -- so existing tests that read ticket content won't break when the field appears in real tickets but not in fixtures.
