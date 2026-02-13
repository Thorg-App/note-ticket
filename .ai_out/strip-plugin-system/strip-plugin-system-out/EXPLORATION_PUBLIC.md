# Exploration: Plugin System Footprint

## Files to Modify

| File | What to Change |
|------|---------------|
| `ticket` | Remove `_list_plugins()`, plugin dispatch logic, `super` command, plugin help text |
| `README.md` | Remove "## Plugins" section (lines 87-122), `super` from usage |
| `CLAUDE.md` | Remove plugin system description and "## Plugins" section |
| `CHANGELOG.md` | Update to record plugin removal |
| `features/ticket_plugins.feature` | Delete entire file |
| `features/steps/ticket_steps.py` | Remove plugin test helpers (~lines 813-921) |
| `features/environment.py` | Remove plugin cleanup (lines 28-33) |

## Files to Delete

| File | Reason |
|------|--------|
| `plugins/README.md` | Plugin documentation |
| `plugins/` directory | No longer needed |
| `pkg/extras.txt` | Plugin meta-package list |
| `pkg/aur/ticket-extras/PKGBUILD` | Plugin extras meta-package |
| `pkg/aur/ticket/PKGBUILD` | Full install meta-package (depends on extras) |

## Packaging Scripts to Simplify

| File | Change |
|------|--------|
| `scripts/publish-homebrew.sh` | Remove plugin formula generation, simplify to core-only |
| `scripts/publish-aur.sh` | Remove plugin PKGBUILD generation, simplify to core-only |
| `.github/workflows/release.yml` | May simplify but keep core publishing |

## Key Observations

- `TICKETS_DIR` is used both by plugins AND by core logic — KEEP the internal variable
- Only REMOVE the `export TICKETS_DIR` in plugin dispatch context
- `super` command ONLY exists to bypass plugins — remove entirely
- `_list_plugins()` is ONLY called from `cmd_help()` — remove and simplify help
- Plugin test feature file is self-contained — clean deletion
