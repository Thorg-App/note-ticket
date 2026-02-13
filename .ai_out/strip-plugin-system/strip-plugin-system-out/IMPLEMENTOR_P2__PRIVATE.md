## Phase 2: Remove Plugin Test Code -- Private Context

### State
- COMPLETE. All plugin test code removed. All 131 scenarios pass.

### What was removed
1. `features/ticket_plugins.feature` -- entire file deleted
2. `features/steps/ticket_steps.py`:
   - `import tempfile` (line 7)
   - Plugin PATH injection in `step_run_command()` (lines 419-422: comment + if block)
   - Entire Plugin Steps section (lines 809-928): section header, `create_plugin()`, `run_with_plugin_path()`, 7 `@given` steps, 1 `@when` step
3. `features/environment.py`:
   - `if hasattr(context, 'plugin_dir')` cleanup in `after_scenario()` (lines 32-33)

### Observations
- `register_type` (from behave) and `import parse` in ticket_steps.py are unused imports but not plugin-specific. Could be cleaned up in a separate chore.
- `env = os.environ.copy()` in `step_run_command()` was kept since it's passed to subprocess.run(). Without it, the env param would need to be removed from the subprocess call or left as None.

### Next phases (if applicable)
- Phase 3+ would handle removing plugin code from the core `ticket` script itself, CLAUDE.md, README.md, plugins/ directory, etc.
