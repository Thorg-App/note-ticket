---
closed_iso: 2026-02-28T02:33:36Z
status_updated_iso: 2026-02-28T02:33:36Z
id: 7f209dtd2styppry2w3uqlg8c
title: "Add status updated iso timestamp"
status: closed
deps: []
links: []
created_iso: 2026-02-28T01:53:54Z
type: task
priority: 0
assignee: nickolaykondratyev
---

Add 'status_updated_iso' timestamp

It should be similar to `created_iso` as it should also contain ISO8601 timestamp.
```
created_iso
```

However, instead of created timestamp it should contain the timestamp when last time 'status' was updated/changed. Hence, anytime we updated the status the 'status_updated_iso' timestamp should reflect this change in ISO8601 format.

Make sure there are sufficient new testing added for this use case.

## Resolution

**Completed.** Added `status_updated_iso` ISO8601 timestamp field.

### Changes Made
- **`ticket`**: 2 lines added
  - `cmd_create()` line 317: Initializes `status_updated_iso` at creation (reuses existing `$now` variable, identical to `created_iso`)
  - `cmd_status()` line 377: Unconditionally updates `status_updated_iso` on every status change
- **`features/ticket_creation.feature`**: 1 new scenario verifying timestamp at creation
- **`features/ticket_status.feature`**: 2 new scenarios — status change updates timestamp, reopen preserves timestamp
- **`features/steps/ticket_steps.py`**: Updated 2 test fixtures + added parameterized step definition for `the created ticket should have a valid "X" timestamp`
- **`CHANGELOG.md`**: Entry under `[Unreleased] / Added`

### Test Results
134 scenarios passed, 0 failed, 0 skipped. 922 steps passed.