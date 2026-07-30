---
id: nid_fhmxugci00tfkeu3eyeggv6gq_e
title: "TS port 6: cutover, delete bash, packaging + docs"
status: open
deps: [nid_zesi8c4t7lyw6jgmqqsjqd54k_e, nid_8cislepljqvv88ayndtjlw34k_e, nid_2ziai8ka9l0yak2lxnwlu9lk2_e]
links: []
created_iso: 2026-07-29T21:57:25Z
status_updated_iso: 2026-07-29T21:57:25Z
type: task
priority: 2
assignee: CC_WITH-nickolaykondratyev
tags: [ts-port, decide]
---

Read docs-internal/migration-to-ts-high-level.md first (Distribution section holds the recommendation for the decision below).

Scope:
- Replace the bash ./ticket entrypoint with the Node one (repo-root file named ticket, #!/usr/bin/env node) and DELETE the bash implementation entirely - no compatibility shims left behind.
- DECIDE (human): how dist reaches packagers. Homebrew formula (scripts/publish-homebrew.sh) and AUR PKGBUILD (pkg/aur/ticket-core/PKGBUILD) install straight from the git tag tarball with no build step. Recommendation in the plan doc: commit the built bundle at release time and have CI verify it matches src at tag; alternative: build in the release workflow and attach. Pick one with the human before implementing.
- Packaging updates: PKGBUILD depends changes from bash/coreutils/findutils/gawk to nodejs and git; drop the ripgrep optdepends if the TS impl no longer shells out to rg; Homebrew formula generation gains depends_on node and installs the Node entrypoint as tk; verify scripts/publish-aur.sh still applies.
- Docs: README.md, ORIGINAL_README.md, CLAUDE.md (architecture section describes bash+awk internals - rewrite for src/core + src/cli), CHANGELOG.md entry, THIRD_PARTY_LICENSES.md if any dev-deps require it. Update the auto-memory files if present.
- Delete the bash-vs-TS parity harness, which has no purpose once bash is gone: scripts/parity/ (its README "Lifetime" is the delete-list), the parity target in Makefile, the build:parity script in package.json, the dist-parity/ entry in .gitignore, and the "Run bash-vs-TS parity harness" step in .github/workflows/test.yml. Fold any still-relevant declared divergence from scripts/parity/README.md into the BDD suite before deleting it.
- CI: BDD suite runs against the Node entrypoint on a fresh checkout; add a smoke test for the packaged install path (tk help).

Acceptance: git grep finds no awk-based ticket logic; make test green; fresh-clone install instructions verified.

