# IMPLEMENTOR Private Context: `closed_iso`

## Implementation Status: COMPLETE

All plan items implemented, all tests green (except pre-existing plugin failures).

## Files Modified

| File | Lines Changed |
|------|--------------|
| `ticket` | +10 (remove_yaml_field function + cmd_status closed_iso logic) |
| `features/steps/ticket_steps.py` | +16 (2 new step definitions) |
| `features/ticket_status.feature` | +42 (6 new scenarios) |
| `CLAUDE.md` | 1 line replaced |
| `CHANGELOG.md` | +3 lines |

## Key Implementation Notes

- `remove_yaml_field()` is at line ~203 (after `update_yaml_field()`).
- `cmd_status()` closed_iso logic is at line ~374 (after the `update_yaml_field` for status).
- Step definitions were added before the "Plugin Steps" section in ticket_steps.py.
- All 6 new BDD scenarios follow reviewer feedback: reopen/status-change scenarios close via `ticket close` command first.

## Pre-existing Issues

- 9 plugin tests in `ticket_plugins.feature` fail in baseline. These are environment-dependent (likely `compgen` not finding plugins in test PATH). Not related to this change.
