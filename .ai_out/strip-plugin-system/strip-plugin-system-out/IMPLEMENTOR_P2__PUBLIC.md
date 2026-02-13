## Completed: Remove Plugin-Related Test Code (Phase 2)

**What was done:**
- Deleted `features/ticket_plugins.feature` (78 lines, 12 plugin scenarios)
- Removed all plugin step definitions and helpers from `features/steps/ticket_steps.py`:
  - `create_plugin()` helper function
  - `run_with_plugin_path()` helper function
  - 7 `@given` plugin step definitions (outputs string, echoes args, outputs TICKETS_DIR, outputs TK_SCRIPT, with description, without metadata, calls super create)
  - `@when('I run ... with plugins')` step definition
  - Plugin PATH injection in `step_run_command()` (the `if hasattr(context, 'plugin_dir')` block)
  - Plugin Steps section header comment
  - `import tempfile` (only used by plugin code)
- Removed plugin directory cleanup from `features/environment.py` (`if hasattr(context, 'plugin_dir')` block in `after_scenario`)

**Files modified:**
- `features/ticket_plugins.feature` -- deleted
- `features/steps/ticket_steps.py` -- removed ~120 lines of plugin code
- `features/environment.py` -- removed 2 lines of plugin_dir cleanup

**Tests:**
- All 131 scenarios pass across 11 features (905 steps), zero failures
- Test output in `.tmp/test_phase2.txt`

**Notes:**
- `env = os.environ.copy()` was preserved in `step_run_command()` since it is still used to pass env to `subprocess.run()`
- `register_type` and `parse` imports in ticket_steps.py are unused but are not plugin-specific; left untouched to stay within scope
