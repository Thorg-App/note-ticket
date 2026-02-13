# Phase 3 & 4: Delete Plugin/Packaging Files and Simplify Publishing Scripts

## What Was Done

### Phase 3: Deleted Plugin and Packaging Files

- **Deleted** `plugins/README.md` -- plugin conventions documentation
- **Deleted** `plugins/` directory (was empty after README removal)
- **Deleted** `pkg/extras.txt` -- plugin meta-package list
- **Deleted** `pkg/aur/ticket-extras/PKGBUILD` and directory -- extras meta-package
- **Deleted** `pkg/aur/ticket/PKGBUILD` and directory -- full install meta-package
- **Kept** `pkg/aur/ticket-core/PKGBUILD` -- core script package (unchanged)

### Phase 4: Simplified Publishing Scripts

#### `scripts/publish-homebrew.sh`
Removed:
- `parse_plugin_metadata()` function
- `generate_plugin_formula()` function
- Plugin formula generation loop (scanning plugins/ directory)
- `ticket-extras` formula generation
- `ticket` meta-formula generation
- `REPO_ROOT` variable (no longer needed)

Kept: ticket-core formula generation, tap clone, git commit/push logic.

#### `scripts/publish-aur.sh`
Removed:
- `parse_plugin_metadata()` function
- `generate_plugin_pkgbuild()` function
- Plugin PKGBUILD generation loop
- `ticket-extras` AUR package generation
- `ticket` meta-package AUR generation
- `failed` array tracking (only one package now, failure exits immediately)

Kept: `setup_ssh()`, `generate_srcinfo()`, `push_to_aur()`, `update_pkgbuild()`, ticket-core publishing, and git push logic.

#### `.github/workflows/release.yml`
No changes needed. The workflow steps call the publish scripts, which now only handle ticket-core. The workflow structure remains correct.

## Files Modified
- `scripts/publish-homebrew.sh` -- stripped from 164 to 61 lines
- `scripts/publish-aur.sh` -- stripped from 199 to 100 lines

## Files Deleted
- `plugins/README.md`
- `plugins/` (directory)
- `pkg/extras.txt`
- `pkg/aur/ticket-extras/PKGBUILD` and directory
- `pkg/aur/ticket/PKGBUILD` and directory

## Files Kept (Unchanged)
- `pkg/aur/ticket-core/PKGBUILD`
- `.github/workflows/release.yml`

## Tests
- All 131 scenarios passed, 905 steps passed, 0 failures
- Output in `.tmp/test_phase34.txt`
