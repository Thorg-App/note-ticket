# Pareto Assessment: PROCEED

**Value Delivered:** Ticket directory is now visible to standard UNIX tooling (`fd`, `rg`, file explorers, IDE tree views) that ignore dot-prefixed directories by default. This removes a recurring friction point for every user, every time they interact with their tickets outside of `tk`.

**Complexity Cost:** Mechanical find-and-replace of a single string literal (`.tickets` -> `_tickets`) across 10 files. One commit. No new code paths, no new logic, no architectural changes. All 131 pre-existing BDD scenarios pass without modification to assertions (only path strings updated).

**Ratio:** High

---

## Detailed Analysis

### 1. Value/Complexity Ratio

The effort is minimal: ~43 string replacements, zero logic changes. The value is disproportionately high -- this is the kind of default that affects every user on every interaction with external tooling. A single-character change in the default directory name eliminates an entire class of "why can't I see my tickets?" confusion. This is textbook Pareto: near-zero effort for outsized usability improvement.

### 2. Scope Creep Detection

None detected. The change touches exactly what it should:

- Core script (`ticket`, `bash_ticket`) -- the runtime behavior
- BDD tests (`features/`) -- updated path strings to match new default
- Documentation (`ORIGINAL_README.md`, `CHANGELOG.md`) -- user-facing docs
- Spec docs (`doc/ralph/`) -- future Kotlin port specs aligned with new default

What was correctly excluded:
- Historical CHANGELOG entries (they document past facts)
- `TICKETS_DIR` env var name (unchanged -- provides escape hatch)
- Parent repo CLAUDE.md (out of scope, noted as follow-up)

### 3. "No Backward Compatibility Fallback" Decision

**Correct per Pareto.** Adding fallback logic (e.g., "check `.tickets` first, then `_tickets`") would:

- Introduce a new code path that needs testing and maintenance forever
- Create ambiguity about which directory is authoritative if both exist
- Add complexity for a transitional concern that resolves itself (users rename the directory once)
- Violate the Explicit principle: two valid directories is confusing

The existing `TICKETS_DIR` env var already provides an escape hatch for users who prefer the old default. This is the 80/20 answer -- zero new code, full coverage of the migration need.

### 4. Unnecessary Work

None identified. Every file touched was necessary:

- `ticket` and `bash_ticket` are the runtime scripts -- must change
- Test files reference the directory path in setup/assertions -- must change
- Feature files contain the directory name in scenario text/assertions -- must change
- Documentation references the default -- must change
- CHANGELOG documents the breaking change -- required by project conventions

The only area worth scrutinizing is whether the `doc/ralph/` spec files needed updating. Since these describe the target behavior for a future Kotlin port, updating them is correct -- otherwise the Kotlin implementation would target the wrong default.

## Verdict

This is a model implementation: minimal, complete, well-documented breaking change. Single commit, clean diff, no new logic, no backward-compat complexity. The CHANGELOG entry is clear and includes the `TICKETS_DIR=.tickets` workaround. The decision to skip backward-compatibility fallback code is the right call -- it avoids permanent complexity for a one-time migration.

**Recommendation:** Proceed as-is. No simplification needed -- this is already the simplest possible implementation.
