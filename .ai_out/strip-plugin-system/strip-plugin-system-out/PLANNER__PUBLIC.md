# Implementation Plan: Strip Plugin System from `ticket` CLI

## Problem Understanding

**Goal:** Remove the entire plugin system from the `ticket` (tk) CLI tool while preserving all other behavior.

**What the plugin system is:** An extensibility mechanism that discovers external executables named `tk-<cmd>` or `ticket-<cmd>` in `$PATH` and delegates unknown subcommands to them. It includes a `super` bypass command, help listing, environment variable exports, and multi-package distribution support.

**Key constraint:** `TICKETS_DIR` as an internal variable and `find_tickets_dir()` / `init_tickets_dir()` are used by core logic and MUST be preserved. Only the `export TICKETS_DIR` in the plugin dispatch context should be removed.

**Assumptions:**
- The `strip-plugin-system-out` branch is clean (no prior strip work).
- The 9 failing plugin test scenarios are expected environmental failures (compgen/exec in test runner) -- they will be deleted, not fixed.
- All 133 passing non-plugin scenarios must continue to pass after every phase.

---

## High-Level Architecture Change

Before: `ticket` script has a two-stage dispatch: (1) check for plugin executables, (2) built-in command dispatch.
After: `ticket` script has a single-stage dispatch: built-in commands only.

The change is purely subtractive. No new code paths are introduced.

---

## Implementation Phases

### Phase 1: Core Script -- Remove Plugin Logic from `ticket`

**Goal:** Strip all plugin-related code from the main `ticket` bash script.

**File:** `/usr/local/workplace/thorg-root/submodules/note-ticket/ticket`

**Key Steps:**

1. **Delete `_list_plugins()` function** (lines 1460-1493). This entire function is only called from `cmd_help()`.

2. **Simplify `cmd_help()`** (lines 1495-1557). Remove:
   - The `super <cmd> [args]` line from the usage block (line 1532)
   - The plugin listing block (lines 1535-1544 -- the `_list_plugins` call and conditional output)
   - The final `cat << EOF` block (lines 1546-1556) that describes plugin usage, `super`, env vars, and `--tk-describe`
   - KEEP the final 3 lines about searching parent dirs, storage format, and ID matching -- move them to be directly after the commands block

3. **Remove `super` bypass logic** (lines 1561-1566). Delete the `_tk_super` variable and the `if [[ "${1:-}" == "super" ]]` block.

4. **Remove plugin dispatch block** (lines 1568-1581). Delete the entire `if [[ $_tk_super -eq 0 ... ]]` block that searches for `tk-<cmd>` / `ticket-<cmd>` in PATH and execs them.

5. **Clean up the `case` dispatch.** No change needed to the built-in case statement -- it already handles `super` as unknown command (falls through to `*)`), but after removing the super handling block above, `super` will now correctly produce "Unknown command: super". This is desired behavior.

**Verification:** Run `make test`. All non-plugin scenarios (133) must pass. Plugin scenarios will fail because the feature file still exists, which is cleaned up in Phase 2.

---

### Phase 2: Delete Plugin Test Feature and Clean Up Test Infrastructure

**Goal:** Remove all plugin-specific test code.

**Key Steps:**

1. **Delete** `/usr/local/workplace/thorg-root/submodules/note-ticket/features/ticket_plugins.feature` (entire file).

2. **Remove plugin step definitions** from `/usr/local/workplace/thorg-root/submodules/note-ticket/features/steps/ticket_steps.py`:
   - Delete the entire `# Plugin Steps` section (lines 809-928): the section comment, `create_plugin()` helper, `run_with_plugin_path()` helper, and all `@given` / `@when` plugin step definitions.

3. **Clean up `step_run_command()`** in `ticket_steps.py` (around line 407):
   - Remove the plugin PATH injection (lines 420-422): the `if hasattr(context, 'plugin_dir')` block that prepends `plugin_dir` to `PATH`.
   - Simplify to just use `os.environ.copy()` directly (no `env` variable customization for plugins).

4. **Clean up `after_scenario()`** in `/usr/local/workplace/thorg-root/submodules/note-ticket/features/environment.py`:
   - Remove lines 32-33: `if hasattr(context, 'plugin_dir') and os.path.exists(context.plugin_dir): shutil.rmtree(context.plugin_dir)`

**Verification:** Run `make test`. All 133 scenarios should pass, 0 should fail. The 11 features should now be 11 (was 12 with plugins).

---

### Phase 3: Delete Plugin and Packaging Files

**Goal:** Remove plugin directory, plugin-only packaging files, and simplify remaining packaging.

**Key Steps:**

1. **Delete directory** `plugins/` (contains only `README.md`).

2. **Delete file** `pkg/extras.txt`.

3. **Delete directory** `pkg/aur/ticket-extras/` (the extras meta-package PKGBUILD -- exists only for bundling plugins).

4. **Delete directory** `pkg/aur/ticket/` (the full meta-package PKGBUILD -- exists only as `ticket-core + ticket-extras`).

5. **Keep** `pkg/aur/ticket-core/PKGBUILD` -- this is the core package and remains valid.

**Verification:** Confirm the deleted files/dirs no longer exist. Tests still pass.

---

### Phase 4: Simplify Publishing Scripts and CI

**Goal:** Remove plugin-related logic from publishing scripts and CI workflow.

**Files affected:**

#### `/usr/local/workplace/thorg-root/submodules/note-ticket/scripts/publish-homebrew.sh`

Simplify to only publish a single `ticket` formula (what was `ticket-core`):

1. Delete `parse_plugin_metadata()` function.
2. Delete `generate_plugin_formula()` function.
3. Remove the plugin formula generation loop (step 2 in `main()`).
4. Remove the `ticket-extras` formula generation (step 3 in `main()`).
5. Remove the `ticket` meta-formula generation (step 4 in `main()`).
6. Rename the `ticket-core` formula to just `ticket` (single formula). Update the class name from `TicketCore` to `Ticket`, and install as `tk` just like before.

#### `/usr/local/workplace/thorg-root/submodules/note-ticket/scripts/publish-aur.sh`

Simplify to only publish `ticket-core`:

1. Delete `parse_plugin_metadata()` function.
2. Delete `generate_plugin_pkgbuild()` function.
3. Remove step 2 (individual plugin publishing loop).
4. Remove step 3 (ticket-extras publishing).
5. Remove step 4 (ticket meta-package publishing).
6. Keep step 1 (ticket-core) -- but rename the AUR package from `ticket-core` to `ticket` for simplicity. Update the PKGBUILD in `pkg/aur/ticket-core/` accordingly (rename to `pkg/aur/ticket/`).

**Decision needed:** Whether to rename `ticket-core` to `ticket` in the package managers. This is a packaging concern. For the plan, I recommend renaming since `ticket-extras` no longer exists and having `ticket-core` without a `ticket` meta-package is confusing. However, this is a **separate concern** that can be done as a follow-up. For this task, simply removing the plugin-specific code from the scripts is sufficient. Keep `ticket-core` naming as-is for now.

**Revised approach (simpler):** Just remove the plugin-related sections from both scripts. Keep `ticket-core` naming. Remove extras/meta-package sections.

#### `/usr/local/workplace/thorg-root/submodules/note-ticket/.github/workflows/release.yml`

The workflow calls both publish scripts. No structural change needed -- the scripts themselves are simplified. No changes to the YAML file required.

**Verification:** Scripts are valid bash (no syntax errors). `bash -n scripts/publish-homebrew.sh` and `bash -n scripts/publish-aur.sh` should succeed.

---

### Phase 5: Update Documentation

**Goal:** Remove all plugin references from README.md and CLAUDE.md.

#### `/usr/local/workplace/thorg-root/submodules/note-ticket/README.md`

1. Remove `super <cmd> [args]` line from the Usage code block.
2. Remove the entire `## Plugins` section (from `## Plugins` through the end of the plugin code examples, roughly lines 87-122 equivalent).
3. Remove plugin references from `## Install` section if any mention plugin packages (check: the install section mentions `brew install ticket` which is fine as-is).

#### `/usr/local/workplace/thorg-root/submodules/note-ticket/CLAUDE.md`

1. Remove the entire `**Plugin system:**` paragraph and its bullet points from the Architecture section.
2. Remove the entire `## Plugins` section (directory structure, file conventions, extracting commands, creating new plugins).
3. Remove plugin mentions from the `## Releases & Packaging` section:
   - Simplify the "Package Structure" to describe only `ticket-core` (or just `ticket`).
   - Remove mention of `ticket-extras`, individual plugin packages, and `pkg/extras.txt`.
   - Simplify the user install examples.
4. Remove plugin mentions from the "CI Publishing" section (remove references to `publish-homebrew.sh` plugin formula generation and `publish-aur.sh` plugin PKGBUILD generation).
5. Remove from "Extracting Commands to Plugins" and "Creating New Plugins" subsections entirely.

**Verification:** Read through both files to confirm no plugin references remain. Search for "plugin" (case-insensitive) in both files.

---

### Phase 6: Update CHANGELOG.md

**Goal:** Record the plugin system removal in the changelog.

**File:** `/usr/local/workplace/thorg-root/submodules/note-ticket/CHANGELOG.md`

**Key Steps:**

1. Under `## [Unreleased]`, add a `### Removed` section (or append to existing one) with:
   - `- Plugin system: removed external command dispatch (tk-<cmd> / ticket-<cmd>), super command, and plugin help listing`
   - `- Multi-package distribution: removed ticket-extras meta-package and individual plugin packages`
2. Remove the plugin-related items from the existing `### Added` section under `[Unreleased]`:
   - Remove all 6 bullet points about plugins (lines 25-31)

**Verification:** CHANGELOG reads correctly and accurately reflects the state.

---

## Testing Strategy / Acceptance Criteria

### Automated (must all pass)

1. **`make test` passes with 0 failures.** Expected: 11 features, 133 scenarios, all passing.
2. **`bash -n ticket` succeeds** (no syntax errors in modified script).
3. **`bash -n scripts/publish-homebrew.sh` succeeds.**
4. **`bash -n scripts/publish-aur.sh` succeeds.**

### Manual Verification

5. **`./ticket help` output:**
   - Does NOT contain "super"
   - Does NOT contain "plugin" or "Plugin"
   - Does NOT contain "TK_SCRIPT"
   - Does NOT contain "tk-plugin" or "--tk-describe"
   - DOES contain all built-in commands (create, start, close, reopen, status, dep, undep, link, unlink, ls, list, ready, blocked, closed, show, edit, add-note, query, help)

6. **`./ticket super create "test"` fails** with "Unknown command: super"

7. **Deleted files/dirs do not exist:**
   - `features/ticket_plugins.feature`
   - `plugins/`
   - `pkg/extras.txt`
   - `pkg/aur/ticket-extras/`
   - `pkg/aur/ticket/`

8. **Preserved files/dirs exist and are correct:**
   - `pkg/aur/ticket-core/PKGBUILD`
   - `features/environment.py`
   - `features/steps/ticket_steps.py`

9. **Grep for "plugin" (case-insensitive) in these files returns nothing:**
   - `ticket`
   - `README.md`
   - `CLAUDE.md`
   - `features/steps/ticket_steps.py`
   - `features/environment.py`

10. **`TICKETS_DIR` internal variable still works** -- verified implicitly by passing tests that use `TICKETS_DIR` env var override.

---

## Open Questions / Decisions Needed

1. **Package renaming:** Should `ticket-core` be renamed to `ticket` in Homebrew/AUR now that there is no multi-package split? Recommendation: defer to a follow-up task. The core package still works fine as `ticket-core`.

2. **Git commits:** The plan is structured as 6 phases. Recommend committing at the following milestones:
   - After Phase 1+2 (core script + tests -- one atomic commit since broken tests between phases)
   - After Phase 3 (file deletions)
   - After Phase 4 (script simplification)
   - After Phase 5+6 (docs + changelog)
   - Or: single commit for the whole thing since it is one logical change.
