# Implementation Review: Strip Plugin System from `ticket` CLI

## Verdict: APPROVED

The implementation is clean, thorough, and correct. All plugin-related code has been completely removed. All non-plugin tests pass (11 features, 131 scenarios, 905 steps). No regressions detected.

---

## Summary

The plugin system was stripped across 5 commits:

1. **Core script** (`ticket`): Removed `_list_plugins()`, `super` command, plugin dispatch block, `export TICKETS_DIR`/`TK_SCRIPT` for plugins. 78 lines removed.
2. **Test infrastructure**: Deleted `features/ticket_plugins.feature`, removed ~126 lines of plugin step definitions from `ticket_steps.py`, removed plugin cleanup from `environment.py`.
3. **Packaging files**: Deleted `plugins/` directory, `pkg/extras.txt`, `pkg/aur/ticket-extras/`, `pkg/aur/ticket/`. Preserved `pkg/aur/ticket-core/PKGBUILD`.
4. **Publishing scripts**: Simplified `publish-homebrew.sh` (164 -> 61 lines) and `publish-aur.sh` (199 -> 100 lines) to core-only.
5. **Documentation**: Removed all plugin references from `README.md`, `CLAUDE.md`, and `CHANGELOG.md`.

The change is purely subtractive. No new code paths were introduced.

---

## Verification Results

| Check | Result |
|-------|--------|
| `make test` (131 scenarios, 905 steps) | PASS |
| `bash -n ticket` | PASS |
| `bash -n scripts/publish-homebrew.sh` | PASS |
| `bash -n scripts/publish-aur.sh` | PASS |
| `./ticket help` contains no plugin references | PASS |
| `./ticket super create "test"` -> "Unknown command: super" | PASS |
| Grep for "plugin" (case-insensitive) across codebase | 0 matches |
| Grep for "_list_plugins", "_tk_super", "TK_SCRIPT", "tk-plugin", "--tk-describe" | 0 matches |
| Grep for "ticket-extras" | 0 matches |
| Grep for "super" (word boundary) | 0 matches |
| Grep for "tk-" | 0 matches |
| Deleted files/dirs confirmed gone | PASS |
| `pkg/aur/ticket-core/PKGBUILD` preserved | PASS |
| `TICKETS_DIR` internal variable intact | PASS (verified by passing tests) |

---

## File-by-File Analysis

### `ticket` (1537 lines)

The main dispatch flow is now a clean single-stage design: `init_tickets_dir` -> `case` dispatch -> built-in commands only. No trace of plugin logic remains:
- No `_list_plugins()` function
- No `super` handling
- No plugin dispatch (`tk-<cmd>` / `ticket-<cmd>` search)
- No `export TICKETS_DIR` or `export TK_SCRIPT`
- `cmd_help()` lists only built-in commands with the standard footer

`TICKETS_DIR` is correctly preserved as an internal variable used by core logic (`find_tickets_dir`, `init_tickets_dir`, `ticket_path`, etc.).

### `features/steps/ticket_steps.py` (803 lines)

All plugin step definitions removed. The `step_run_command()` function no longer has the `if hasattr(context, 'plugin_dir')` PATH injection. Clean.

### `features/environment.py` (42 lines)

Plugin cleanup (`plugin_dir` rmtree) removed from `after_scenario()`. Clean.

### `scripts/publish-homebrew.sh` (61 lines)

Simplified to single `ticket-core` formula. Removed `parse_plugin_metadata()`, `generate_plugin_formula()`, extras/meta-formula generation. Clean.

### `scripts/publish-aur.sh` (100 lines)

Simplified to single `ticket-core` package. Removed `parse_plugin_metadata()`, `generate_plugin_pkgbuild()`, extras/meta-package generation. Clean.

### `README.md` (101 lines)

Plugin section completely removed. `super` line removed from usage block. No plugin references remain.

### `CLAUDE.md` (85 lines)

Plugin system description, plugin directory structure, plugin conventions, extracting/creating plugins sections all removed. Packaging simplified to describe `ticket-core` only. No plugin references remain.

### `CHANGELOG.md`

Plugin system removal correctly recorded under `### Removed` in `[Unreleased]`. The previous plugin-related additions (which were in `[Unreleased]`) were correctly removed since those features no longer ship.

---

## CRITICAL Issues

None.

## IMPORTANT Issues

None.

## Suggestions

None. This was a clean, well-executed subtractive change.
