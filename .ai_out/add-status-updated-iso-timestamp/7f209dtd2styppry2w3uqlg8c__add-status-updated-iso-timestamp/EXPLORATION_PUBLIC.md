# Exploration Summary: Add status_updated_iso Timestamp

## Key Findings

### Core Implementation Points
- **`_iso_date()`** (line ~73): Returns `YYYY-MM-DDTHH:MM:SSZ` UTC timestamp
- **`cmd_create()`** (line ~316): Where `created_iso` is set — add `status_updated_iso` here too
- **`cmd_status()`** (line ~360-384): Single entry point for ALL status changes — add `status_updated_iso` update here
- **`update_yaml_field()`** (line ~188): Already exists for setting YAML fields
- **`_file_to_jsonl()`** (line ~214): Generic awk — auto-includes any frontmatter field, NO changes needed

### Existing Pattern: `closed_iso`
In `cmd_status()` lines 377-381:
```bash
if [[ "$status" == "closed" ]]; then
    update_yaml_field "$file" "closed_iso" "$(_iso_date)"
else
    remove_yaml_field "$file" "closed_iso"
fi
```

### Difference for `status_updated_iso`
- Set on EVERY status change (not conditional like `closed_iso`)
- Never removed
- Also initialized at creation time

### Files to Modify
| File | Change |
|------|--------|
| `ticket` | Add `status_updated_iso` in `cmd_create()` and `cmd_status()` |
| `features/ticket_status.feature` | Add BDD scenarios for the new timestamp |
| `features/steps/ticket_steps.py` | Update `create_ticket()` fixture to include field |
| `features/ticket_creation.feature` | Add creation scenario for new field |
| `features/ticket_query.feature` | Optionally verify field in JSONL output |

### BDD Test Patterns
- Timestamp validation: `ticket "X" should have a valid "Y" timestamp`
- Field absence: `ticket "X" should not have field "Y"`
- Step definition for timestamp: regex `^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}Z`
- Test fixture uses hardcoded `created_iso: 2024-01-01T00:00:00Z`
