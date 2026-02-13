# Phase 1 Implementation: Strip Plugin Code from `ticket` Script

## Summary

Removed all plugin-related code from the core `ticket` bash script. This is a purely subtractive change -- no new code paths were introduced.

## Changes Made

### File: `ticket`

**1. Deleted `_list_plugins()` function** (was at lines 1460-1493)
- Entire function removed. It discovered `tk-<cmd>` / `ticket-<cmd>` executables in PATH and extracted their descriptions.

**2. Simplified `cmd_help()`** (was at lines 1495-1557)
- Removed the `super <cmd> [args]` line from the commands listing.
- Removed the plugin listing block (call to `_list_plugins` and conditional output).
- Removed the footer block about plugin usage, `super` command, env vars, and `--tk-describe`.
- Kept the 3 closing lines about searching parent dirs, storage format, and ID matching.

**3. Removed super bypass and plugin dispatch from main flow** (was at lines 1561-1581)
- Removed `_tk_super` variable and the `if [[ "${1:-}" == "super" ]]` block.
- Removed the plugin dispatch block that searched for `tk-<cmd>` / `ticket-<cmd>` in PATH.
- Removed `export TICKETS_DIR` and `export TK_SCRIPT` for plugins.
- Removed the `exec "$_plugin" "$@"` call.

### What Was Preserved
- `TICKETS_DIR` as an internal variable (used by core logic).
- `find_tickets_dir()` and `init_tickets_dir()` functions (used by core logic).
- All built-in commands (create, start, close, reopen, status, dep, undep, link, unlink, ls/list, ready, blocked, closed, show, edit, add-note, query, help).
- The built-in case/esac dispatch is unchanged -- `super` now correctly falls through to "Unknown command: super".

## Verification

### bash -n
- `bash -n ticket` -- **PASS** (no syntax errors)

### Grep for plugin references
- `grep -i 'plugin\|_list_plugins\|_tk_super\|TK_SCRIPT\|super'` on `ticket` -- **0 matches**

### Test Results
- **132 scenarios passed, 10 failed** (all 10 failures are in `ticket_plugins.feature`, which is expected -- Phase 2 will delete that file)
- All 11 non-plugin feature files pass completely.

### Manual Checks
- `./ticket help` output does NOT contain: "super", "plugin", "Plugin", "TK_SCRIPT", "tk-plugin", "--tk-describe"
- `./ticket help` output DOES contain all built-in commands.
- `./ticket super create "test"` produces "Unknown command: super" (exit 1).

## Deviations from Plan

None. Implementation followed the plan exactly.

## Next Phase

Phase 2: Delete `features/ticket_plugins.feature`, remove plugin step definitions from `features/steps/ticket_steps.py`, clean up `step_run_command()` plugin PATH injection, and clean up `after_scenario()` in `features/environment.py`.
