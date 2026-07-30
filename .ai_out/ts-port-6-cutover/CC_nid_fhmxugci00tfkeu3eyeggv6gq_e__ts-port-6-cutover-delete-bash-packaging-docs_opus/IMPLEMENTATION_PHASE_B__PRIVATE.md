# PHASE_B plan (packaging + docs)

**Goal**: packaging that actually works for the build-on-demand launcher, plus docs/CHANGELOG/
memory brought to post-cutover reality.

## Key empirical finding (drives everything)

Simulated a root-owned install prefix (`.tmp/prefix-sim`, `chmod -R a-w`):

- prefix WITH a prebuilt `dist/ticket.mjs` and NO `node_modules/`: `tk help`, `tk create`,
  `tk ls` all work, stdout clean. ✅
- same prefix WITHOUT `dist/`: esbuild `mkdir dist: permission denied` → `Error: failed to
  build ...`, exit 1. ❌

⇒ a package MUST run the build in its own build/install phase and ship the bundle inside the
prefix. That is still build-from-source (nothing prebuilt is committed or attached to a
release), it just moves the build from first-run to install-time — which is what a package
build phase is for.

## Steps

1. `pkg/install-manifest.txt` — single source of truth for "what a complete install needs"
   (S5 resolution). Consumed by PKGBUILD, `publish-homebrew.sh` (interpolated at publish
   time), and `features/steps/ticket_steps.py`.
2. `pkg/aur/ticket-core/PKGBUILD`: `build()` = npm install + npm run build; `package()` =
   install the manifest set + dist into `/usr/share/ticket-core`, symlink `/usr/bin/tk`.
   depends nodejs/git/bash/coreutils/findutils, makedepends npm, optdepends jq. Drop ripgrep.
3. `scripts/publish-homebrew.sh`: build in `def install`, `libexec.install` the manifest set +
   dist, `bin.install_symlink`. `depends_on "node"`/`"git"`. New `desc`.
4. Docs: README.md, ORIGINAL_README.md, CLAUDE.md (rewrite Architecture), CHANGELOG.md,
   docs-internal/migration-to-ts-high-level.md (whitelist #1-#19 verbatim + #20, Distribution
   rewrite), THIRD_PARTY_LICENSES.md (judge), auto-memory.
5. Verify: `make typecheck`, `make test`, install-layout simulation, `bash -n` on both publish
   scripts.
