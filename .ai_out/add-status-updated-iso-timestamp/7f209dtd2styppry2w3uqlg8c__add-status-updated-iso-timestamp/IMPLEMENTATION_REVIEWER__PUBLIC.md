# Implementation Review: `status_updated_iso` Timestamp Field

## Summary

This change adds a `status_updated_iso` frontmatter field to the `ticket` CLI tool. The field is set at ticket creation (identical to `created_iso`) and updated unconditionally on every status change. The implementation is minimal: 2 lines in the core script, 2 fixture updates, 1 new step definition, 3 new BDD scenarios, and 1 changelog entry.

**Overall assessment: APPROVED.** Clean, minimal implementation that follows existing patterns and satisfies the requirements. All 134 scenarios pass (922 steps, 0 failures). No pre-existing tests were removed or modified in behavior.

## CRITICAL Issues

None.

## IMPORTANT Issues

None.

## Suggestions

### 1. Timestamp consistency in `cmd_status()` (low priority, pre-existing pattern)

In `/usr/local/workplace/mirror/thorg-root-mirror-8/submodules/note-ticket/ticket` lines 376-383, `_iso_date` is called separately for `status_updated_iso` (line 377) and `closed_iso` (line 380):

```bash
update_yaml_field "$file" "status" "$status"
update_yaml_field "$file" "status_updated_iso" "$(_iso_date)"

if [[ "$status" == "closed" ]]; then
    update_yaml_field "$file" "closed_iso" "$(_iso_date)"
```

If the system clock crosses a second boundary between calls, `status_updated_iso` and `closed_iso` will have different timestamps. This is a pre-existing pattern (the `closed_iso` code was already calling `_iso_date` independently), and the practical impact is negligible (at most 1 second drift), but for symmetry with `cmd_create()` (which captures `$now` once and reuses it), a future cleanup could capture `$now` once in `cmd_status()` as well:

```bash
local now=$(_iso_date)
update_yaml_field "$file" "status_updated_iso" "$now"
if [[ "$status" == "closed" ]]; then
    update_yaml_field "$file" "closed_iso" "$now"
```

**Verdict:** Non-blocking. The pre-existing `closed_iso` code already has this pattern. Could be a separate follow-up ticket if desired.

## Verification Checklist

| Check | Result |
|-------|--------|
| Tests pass (`make test`) | 134 scenarios, 922 steps, 0 failures |
| No pre-existing tests removed | CONFIRMED (diff shows only additions) |
| No pre-existing test behavior modified | CONFIRMED |
| Fixtures updated (both `create_ticket()` and `step_separate_tickets_dir()`) | CONFIRMED |
| Backward compatibility (old tickets without field) | CONFIRMED (`update_yaml_field` inserts field if absent) |
| JSONL output includes new field | CONFIRMED (`_file_to_jsonl()` is generic) |
| Plan reviewer feedback addressed | CONFIRMED (all 3 items) |
| CHANGELOG updated | CONFIRMED |
| Matches original ticket requirements | CONFIRMED |

## What Was Reviewed

| File | Lines Changed | Assessment |
|------|---------------|------------|
| `ticket` (line 317) | +1 (cmd_create) | Correct: reuses `$now` for identical timestamp |
| `ticket` (line 377) | +1 (cmd_status) | Correct: unconditional update on every status change |
| `features/steps/ticket_steps.py` (line 63) | +1 (create_ticket fixture) | Correct: mirrors real ticket structure |
| `features/steps/ticket_steps.py` (line 318) | +1 (step_separate_tickets_dir fixture) | Correct: second fixture also updated |
| `features/steps/ticket_steps.py` (lines 604-612) | +9 (new step definition) | Correct: parameterized, DRY, reusable |
| `features/ticket_creation.feature` (lines 94-97) | +4 (creation scenario) | Correct: validates field at creation |
| `features/ticket_status.feature` (lines 109-120) | +12 (2 status scenarios) | Correct: covers update and preserve-on-reopen |
| `CHANGELOG.md` (line 6) | +1 | Correct: clear description |

## BDD Coverage Assessment

The three new scenarios cover the key behaviors:

1. **Creation**: `status_updated_iso` exists with valid ISO timestamp at creation
2. **Status change**: Field is updated when status transitions to `in_progress`
3. **Reopen cycle**: Field is preserved across close/reopen (contrasts with `closed_iso` which is removed)

**Acceptable gaps (PARETO):**
- No test that `status_updated_iso` differs from `created_iso` after status change (would require `sleep 1` or time mocking -- not worth the complexity)
- No explicit JSONL output test for the field (`_file_to_jsonl()` is generic; existing query tests cover the mechanism)
