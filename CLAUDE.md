# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

See @README.md for usage documentation. Run `tk help` for command reference. Always update the README.md usage content when adding/changing commands and flags.

## Architecture

**Core script:** Single-file bash implementation (`ticket`, ~1000 lines). Uses awk for performant bulk operations on large ticket sets.

Key functions:
- `generate_id()` - Creates 25-char random `[a-z0-9]` IDs (decoupled from filename)
- `title_to_filename()` - Converts title to slug for filename, handles collisions
- `ticket_path()` - Resolves partial IDs by searching frontmatter `id:` fields (single awk pass)
- `id_from_file()` - Extracts `id:` from a file's YAML frontmatter
- `_file_to_jsonl()` - Shared awk-based JSONL generator (used by create and query)
- `yaml_field()` / `update_yaml_field()` - YAML frontmatter manipulation via sed
- `cmd_*()` - Command handlers
- `cmd_ready()`, `cmd_blocked()`, `cmd_ls()` - awk-based bulk listing with sorting

Data model: Filenames are title-based (e.g., `my-note.md`). The `id` field in frontmatter is the stable identifier. `title` is stored in frontmatter (double-quoted). No `# heading` for title in body.

Dependencies: bash, sed, awk, find. Optional: ripgrep (faster grep).

## Testing

BDD tests using [Behave](https://behave.readthedocs.io/). Run with `make test` (requires `uv`).

- Feature files: `features/*.feature` - Gherkin scenarios covering all commands
- Step definitions: `features/steps/ticket_steps.py`
- CI runs tests on push to master and all PRs

Every new feature or behavior change MUST include BDD scenarios in the appropriate feature file.

## Changelog

Update CHANGELOG.md when committing notable changes:

### Core Script Changes
- New commands, flags, bug fixes, behavior changes
- Add under appropriate heading (Added, Fixed, Changed, Removed)

Example:
```markdown
## [Unreleased]

### Added
- New `foo` command
```

### What Doesn't Need Logging
- Documentation-only changes
- CI/workflow changes (unless they affect user-facing behavior)

## Releases & Packaging

### Package Structure

Single package:
- `ticket-core` - Core script and all commands

### Release Flow

1. Update CHANGELOG.md: change `## [Unreleased]` to version + date
2. Commit and tag:
   ```bash
   git commit -am "release: v0.4.0"
   git tag v0.4.0
   git push && git push origin v0.4.0
   ```

### CI Publishing

The release workflow (`.github/workflows/release.yml`) automatically:
1. Creates GitHub release with changelog body
2. Runs `scripts/publish-homebrew.sh` - updates all formulas in tap
3. Runs `scripts/publish-aur.sh` - updates all AUR packages

### Package Managers

- **Homebrew:** `wedow/homebrew-tools` tap
- **AUR:** Individual repos at `aur.archlinux.org/<pkgname>.git`

Both are updated automatically by CI. AUR repos are created on first push if they don't exist.
