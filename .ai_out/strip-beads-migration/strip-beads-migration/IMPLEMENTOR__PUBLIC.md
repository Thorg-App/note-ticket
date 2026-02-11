# Implementor: Strip migrate-beads

## Summary

Removed the `migrate-beads` command and all references to it from the codebase. This command was used to import tickets from the legacy `.beads/issues.jsonl` format and is no longer needed.

## Changes Made

### `ticket` (core script)
- Removed `migrate-beads` from `WRITE_COMMANDS` (now just `"create"`)
- Deleted entire `cmd_migrate_beads()` function (~56 lines)
- Removed `migrate-beads` from help text
- Removed `migrate-beads)` dispatch case

### `README.md`
- Removed intro paragraph referencing beads as predecessor
- Removed `migrate-beads` from usage command list
- Removed entire "Migrating from Beads" section (including banteg uninstall script reference)

### `CLAUDE.md`
- Removed `ticket-migrate-beads` from plugin directory structure example
- Removed `ticket-migrate-beads` from changelog example

### `CHANGELOG.md`
- Added `### Removed` section under `[Unreleased]` with removal note
- Removed v0.2.0 entry about migrate-beads importing parent-child dependencies

### `pkg/extras.txt`
- Removed `# migrate-beads` comment line

### `scripts/publish-aur.sh`
- Simplified jq dependency case to only match `query` (removed `migrate-beads`)

## Testing

All 120 non-plugin scenarios pass (838 steps). The 9 failing plugin tests are pre-existing (caused by `/dev/shm` noexec on this machine).

## Deviations

None. All changes followed the plan exactly.
