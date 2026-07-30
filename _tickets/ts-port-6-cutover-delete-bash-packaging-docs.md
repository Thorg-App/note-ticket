---
id: nid_fhmxugci00tfkeu3eyeggv6gq_e
title: 'TS port 6: cutover, delete bash, packaging + docs'
status: in_progress
deps: [nid_zesi8c4t7lyw6jgmqqsjqd54k_e, nid_8cislepljqvv88ayndtjlw34k_e, nid_2ziai8ka9l0yak2lxnwlu9lk2_e]
links: []
created_iso: '2026-07-29T21:57:25Z'
status_updated_iso: '2026-07-30T22:23:06Z'
type: task
priority: 2
assignee: CC_WITH-nickolaykondratyev
tags: [ts-port]
pwd: /home/nickolaykondratyev/git_repos/note-ticket
---
Read docs-internal/migration-to-ts-high-level.md first (its Distribution section still carries the OLD recommendation - update it to the decision below as part of this ticket).

DECIDED (human, 2026-07-30): distribution is **build-on-demand from source**, NOT a
committed/attached prebuilt bundle. The plan doc's "commit dist at release time"
recommendation is superseded. WHY: this is currently a single-user build tool, and
build-on-demand keeps the release flow to "tag it" with no dist artifact to keep in sync.

Scope:
- Entrypoint: repo-root `ticket` becomes a THIN bash wrapper (the only bash left; it holds
  ZERO ticket logic) that resolves its own directory THROUGH symlinks (it is installed as
  `tk`), ensures `dist/ticket.mjs` exists, then `exec node "$bundle" "$@"` preserving
  `TICKET_INVOKED_AS="$0"`. Everything else in the current bash script - dispatch,
  `TS_COMMANDS`/`TS_DEP_SUBCOMMANDS`, every `cmd_*` body, the `Unknown command` fallback
  - is DELETED; the unknown-command behavior is already TS-side.
  Wrapper requirements:
  - Silent on the happy path. Any build chatter goes to **stderr only**, so `tk query | jq`
    and `tk ls | head` stay byte-clean on stdout.
  - Missing `node`/`npm`, or a failed build, exits non-zero with a clear message - never a
    partial/garbled run.
  - Staleness: rebuild when `dist/ticket.mjs` is missing OR older than any file under `src/`
    (`find src -newer dist/ticket.mjs -print -quit`) - a `git pull` must not leave a stale
    bundle serving stale behavior. Rebuild cost on the hot path is one `find`.
  - Concurrent invocations racing on the same build are accepted (80/20, single user).
- Packaging: the build-on-demand wrapper means an installed `tk` needs `nodejs` + `npm` +
  network on FIRST run. Update PKGBUILD depends from bash/coreutils/findutils/gawk to
  `nodejs`/`npm`/`git`, drop the ripgrep optdepends if the TS impl no longer shells out to
  rg, add `depends_on "node"` to the generated Homebrew formula, install the wrapper as `tk`,
  and verify scripts/publish-aur.sh still applies.
  - CALLED OUT: build-on-install is a poor fit for Homebrew/AUR users (network at first run,
    npm devDeps on an end-user box). Accepted for now because the tool is single-user. If it
    ever goes multi-user, revisit with a follow-up ticket for a prebuilt-bundle release
    artifact - do NOT silently re-add one here.
- Docs: README.md, ORIGINAL_README.md, CLAUDE.md (architecture section describes bash+awk internals - rewrite for src/core + src/cli), CHANGELOG.md entry, THIRD_PARTY_LICENSES.md if any dev-deps require it. Update the auto-memory files if present.
- Delete the bash-vs-TS parity harness, which has no purpose once bash is gone: scripts/parity/ (its README "Lifetime" is the delete-list), the parity target in Makefile, the build:parity script in package.json, the dist-parity/ entry in .gitignore, and the "Run bash-vs-TS parity harness" step in .github/workflows/test.yml. Fold any still-relevant declared divergence from scripts/parity/README.md into the BDD suite before deleting it.
- CI: BDD suite runs against the wrapper entrypoint on a fresh checkout; add a smoke test for the packaged install path (`tk help`) that starts with NO `dist/` present, so the build-on-demand path itself is what CI exercises.
- BDD: a scenario for the wrapper's build-on-demand arm (no bundle -> first invocation builds and succeeds, stdout uncontaminated by build output) and one for the stale-bundle arm (src newer than dist -> rebuilt).

Acceptance: git grep finds no awk-based ticket logic and no `cmd_*` bash function; the only bash left is the wrapper; make test green; fresh-clone install (no dist, no node_modules) verified end to end.
