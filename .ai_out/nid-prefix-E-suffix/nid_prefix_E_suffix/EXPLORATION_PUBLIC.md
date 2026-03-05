# EXPLORATION_PUBLIC.md — nid_ prefix + _E suffix for ticket IDs

## Task
Add `nid_` prefix and `_E` suffix to newly generated ticket IDs. No backfill.

## Current ID Format
- **Function:** `generate_id()` in `ticket` script (lines 85-90) and `bash_ticket`
- **Current:** 25 lowercase alphanumeric chars, e.g. `7f209dtd2styppry2w3uqlg8c`
- **Target:** `nid_<25chars>_E`, e.g. `nid_7f209dtd2styppry2w3uqlg8c_E`

## Current `generate_id()` Implementation
```bash
generate_id() {
    local id
    id=$(LC_ALL=C tr -dc 'a-z0-9' < /dev/urandom | head -c 25 || true)
    printf '%s' "$id"
}
```

## Where generate_id() is Used
- `ticket` script line ~303 in `cmd_create()`: `id=$(generate_id)`
- `bash_ticket` script: same pattern

## Files to Modify
1. `ticket` — `generate_id()` function
2. `bash_ticket` — `generate_id()` function
3. `features/ticket_creation.feature` — update ID pattern expectations
4. `features/id_resolution.feature` — uses explicit test IDs; may need new scenarios
5. `features/steps/ticket_steps.py` — update regex patterns for ID format
6. `CHANGELOG.md` — update ID format documentation

## Test Structure
- BDD tests using Behave
- `features/ticket_creation.feature` tests that output is valid JSON with `id` field
- `features/id_resolution.feature` tests partial ID matching (prefix, suffix, substring)
- `ticket_steps.py` has `step_output_matches_id_pattern` that checks `id` is non-empty string

## Key Constraints
- No backfill of existing tickets
- ID resolution (partial matching) must still work with new format
- Tests must be updated to expect new format
