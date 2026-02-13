# Phase 3 & 4 Implementation Notes

## State
- Phase 3: COMPLETE -- all plugin/packaging files deleted
- Phase 4: COMPLETE -- publishing scripts simplified to ticket-core only

## Decisions Made
1. `.github/workflows/release.yml` was NOT modified because its steps just invoke the publish scripts. The scripts themselves now only handle ticket-core, so the workflow behavior is correct without changes.
2. In `publish-homebrew.sh`, removed `REPO_ROOT` since it was only used for scanning plugins/ and reading pkg/extras.txt.
3. In `publish-aur.sh`, kept `REPO_ROOT` because it's still used to locate `pkg/aur/ticket-core/PKGBUILD`.
4. In `publish-aur.sh`, removed the `failed` array pattern since there's only one package to publish now -- a failure will just exit the script via `set -euo pipefail`.

## Remaining Work for Other Phases
- CLAUDE.md references to plugins (Plugin system section, Package Structure section) still need cleanup -- that is in a different phase.
- README.md plugin documentation still needs cleanup -- that is in a different phase.
- CHANGELOG.md entry for the full plugin removal -- should be done as part of the final phase.
