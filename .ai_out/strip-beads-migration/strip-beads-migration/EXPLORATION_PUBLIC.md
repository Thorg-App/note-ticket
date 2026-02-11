# Exploration: Strip migrate-beads

## Scope of Changes

### Core script (`ticket`)
- Line 30: `WRITE_COMMANDS="create migrate-beads"` — remove `migrate-beads`
- Lines 1438-1493: `cmd_migrate_beads()` function — delete entirely
- Line 1567: help text entry — delete
- Line 1643: dispatch case `migrate-beads)` — delete

### README.md
- Line 5: Intro paragraph referencing beads as predecessor — update/trim
- Line 82: `migrate-beads` in usage command list — delete
- Lines 137-157: "Migrating from Beads" section — delete entirely

### CLAUDE.md
- Line 39: `ticket-migrate-beads` in plugin directory example — remove
- Line 108: `ticket-migrate-beads` in changelog example — remove

### CHANGELOG.md
- Line 60: v0.2.0 entry about migrate-beads — keep as historical, add removal under [Unreleased]

### pkg/extras.txt
- Line 7: `# migrate-beads` comment — remove

### scripts/publish-aur.sh
- Line 109: `migrate-beads` in jq dependency case — remove

## What Does NOT Exist
- No `ticket-migrate-beads` plugin file (only referenced as example)
- No feature tests for migrate-beads
