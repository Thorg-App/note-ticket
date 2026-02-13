# Implementation Summary: `closed_iso` Field

## Changes Made

### 1. `ticket` (core script)

**`remove_yaml_field()` function** (after `update_yaml_field()`, ~line 203):
- New utility function that removes a YAML frontmatter field by line-matching `^${field}:`.
- Uses `_grep` guard for idempotency (no-op if field absent, no unnecessary file writes).
- Uses `_sed_i` for portable BSD/GNU sed support.

**`cmd_status()` modification** (~line 374):
- After `update_yaml_field "$file" "status" "$status"`, added:
  - If status is `"closed"`: sets `closed_iso` via `update_yaml_field` with `_iso_date()`.
  - Otherwise: removes `closed_iso` via `remove_yaml_field` (idempotent).
- All status transitions (`cmd_close`, `cmd_reopen`, `cmd_start`, `cmd_status`) go through `cmd_status()`, so `closed_iso` management is centralized.

### 2. `features/steps/ticket_steps.py`

Two new step definitions:
- `ticket "<id>" should not have field "<field>"` -- asserts a field does NOT exist in frontmatter.
- `ticket "<id>" should have a valid "<field>" timestamp` -- asserts a valid ISO 8601 timestamp in a field.

### 3. `features/ticket_status.feature`

Six new scenarios:
1. **Closing a ticket sets closed_iso timestamp** -- verifies `closed_iso` is added on close.
2. **Reopening a closed ticket removes closed_iso** -- closes first via command, then reopens and verifies removal.
3. **Setting status to in_progress removes closed_iso** -- closes first via command, then transitions and verifies removal.
4. **Ticket that was never closed has no closed_iso** -- verifies `start` on a fresh ticket does not add `closed_iso`.
5. **Closing via status command sets closed_iso** -- verifies `ticket status <id> closed` also sets the field.
6. **Close-reopen-close cycle updates closed_iso** -- full end-to-end cycle.

### 4. `CLAUDE.md`

Replaced the narrower sentence "When adding new commands or flags, add corresponding scenarios to the appropriate feature file." with the broader "Every new feature or behavior change MUST include BDD scenarios in the appropriate feature file." (per user request).

### 5. `CHANGELOG.md`

Added under `[Unreleased]` / `Added`:
```
- `closed_iso` field automatically set when ticket is closed, removed when reopened
```

## Test Results

- All 6 new scenarios pass.
- All 127 pre-existing passing scenarios still pass (133 total passing).
- 9 pre-existing plugin test failures are unchanged (unrelated to this feature; they existed in the baseline).

## Reviewer Feedback Applied

1. **Test scenarios for reopen/status-change** now first close the ticket via `ticket close` command (not the `Given ticket has status` step), ensuring actual field removal is tested.
2. **CLAUDE.md update** was kept per user override of reviewer recommendation. The narrower sentence was replaced (not duplicated).

## Design Decisions

- `remove_yaml_field()` operates on the entire file (not scoped to frontmatter), consistent with `update_yaml_field()`. Safe because `closed_iso` is machine-managed and never appears in body text.
- `closed_iso` timestamp is updated on every close (re-closing updates the timestamp). This records the most recent close time.
- JSONL output automatically includes `closed_iso` when present -- `_file_to_jsonl()` emits all frontmatter fields.
