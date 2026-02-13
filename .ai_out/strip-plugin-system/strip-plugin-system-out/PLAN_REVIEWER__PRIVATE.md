# Plan Review -- Private Notes

## Verification Work Done

1. Read the full plan (`PLANNER__PUBLIC.md`) and exploration (`EXPLORATION_PUBLIC.md`).
2. Read the core `ticket` script from line 1450 to end (1615) -- verified all line numbers for plugin-related code.
3. Read `features/steps/ticket_steps.py` at the plugin step definitions (lines 800-929) and at `step_run_command()` (lines 407-441).
4. Read `features/environment.py` (44 lines total) -- confirmed plugin cleanup on lines 32-33.
5. Read `features/ticket_plugins.feature` -- 11 scenarios, all plugin-specific.
6. Read both publishing scripts (`publish-homebrew.sh`, `publish-aur.sh`) in full.
7. Read `CHANGELOG.md` in full -- found the duplicate `### Added` heading issue.
8. Read all PKGBUILD files in `pkg/aur/`.
9. Counted scenarios across all non-plugin feature files: 131 total (not 133).
10. Grepped for `TK_SCRIPT` across the codebase -- only in plugin-related code.
11. Grepped for `TICKETS_DIR` in the ticket script -- confirmed it is used extensively by core logic (not just plugins).
12. Grepped for `_tk_super` -- only in the plugin bypass block.
13. Full repo grep for "plugin" -- found references in `ask.dnc.md` and `formatted_request.dnc.md` (request files, not project code).

## Key Risk Assessment

- **Risk of breaking core TICKETS_DIR logic:** LOW. The plan correctly identifies that only the `export TICKETS_DIR` on line 1575 is plugin-specific. All other TICKETS_DIR references are core logic.
- **Risk of breaking tests:** LOW. The plugin test infrastructure is well-isolated. The only cross-cutting concern is the `plugin_dir` PATH injection in `step_run_command()`, which the plan addresses.
- **Risk of syntax errors in modified scripts:** LOW. The changes are deletions, not modifications. `bash -n` validation is included in acceptance criteria.

## Scenario Count Detail

| Feature File | Scenarios |
|---|---|
| id_resolution.feature | 10 |
| ticket_creation.feature | 21 |
| ticket_dependencies.feature | 15 |
| ticket_directory.feature | 16 |
| ticket_edit.feature | 3 |
| ticket_links.feature | 7 |
| ticket_listing.feature | 19 |
| ticket_notes.feature | 7 |
| ticket_query.feature | 8 |
| ticket_show.feature | 10 |
| ticket_status.feature | 15 |
| **Total** | **131** |

The plan states 133. The exploration document does not state a count, so this likely came from the planner's own count.

## CHANGELOG Detailed Analysis

The current CHANGELOG has two `### Added` sections under `## [Unreleased]`:
- Line 5: `### Added` with 1 bullet (closed_iso)
- Line 24: `### Added` with 7 bullets (all plugin-related, plus CI scripts)

Line 31 (`- CI scripts for publishing to Homebrew tap and AUR`) is debatable. The publishing scripts will still exist after this change (simplified for ticket-core only). However, they were ADDED as part of the plugin work, and they existed before that too (arguably). The safest approach: remove all 7 lines (25-31) plus the heading (line 24), and add a new bullet under the existing `### Removed` section. The CI scripts are not new -- they are existing infrastructure being simplified.

## Files Summary

Files the plan correctly identifies for modification/deletion:
- `ticket` (modify) -- VERIFIED
- `features/ticket_plugins.feature` (delete) -- VERIFIED
- `features/steps/ticket_steps.py` (modify) -- VERIFIED
- `features/environment.py` (modify) -- VERIFIED
- `plugins/` directory (delete) -- VERIFIED (contains only README.md)
- `pkg/extras.txt` (delete) -- VERIFIED
- `pkg/aur/ticket-extras/` (delete) -- VERIFIED
- `pkg/aur/ticket/` (delete) -- VERIFIED
- `scripts/publish-homebrew.sh` (modify) -- VERIFIED
- `scripts/publish-aur.sh` (modify) -- VERIFIED
- `README.md` (modify) -- VERIFIED
- `CLAUDE.md` (modify) -- VERIFIED
- `CHANGELOG.md` (modify) -- VERIFIED

Files NOT covered by the plan (acceptable omissions):
- `.github/workflows/release.yml` -- plan correctly notes no changes needed
- `ask.dnc.md`, `formatted_request.dnc.md` -- request files, not project code
- `pkg/aur/ticket-core/PKGBUILD` -- correctly preserved
