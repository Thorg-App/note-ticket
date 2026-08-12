---
closed_iso: 2026-08-02T18:11:26Z
id: nid_z3zpg0irlpcq67cksy8fivvef_e
title: Fix the documentation we are not wedow
status: closed
deps: []
links: []
created_iso: '2026-08-02T17:59:45Z'
status_updated_iso: 2026-08-02T18:11:26Z
type: task
priority: 3
assignee: nickolaykondratyev
pwd: /home/nickolaykondratyev/git_repos/note-ticket
---
FIX the documentation,
FACT: this package is NOT under `wedow/tools` so homebrew installation is completely false. We should remove any reference to the wedow. We can also clean out the `/home/nickolaykondratyev/git_repos/note-ticket/ORIGINAL_README.md` as it may mis-inform, we should have the info on how to use the CLI remain (which I think it already is in cli.md). 

So yea clean out any `wedow` references in documentation, clean out any referenes to installations that do not happen like homebrew.

And also if there is any references to `tk` installation we want to remove that. We want to only use the `ticket` full command name. 

We DO in fact publish to NPM. But we dont publish to any installation repos like homebrew. 

FACT: THIS is a fork of wedow/ticket that is not going its own route.

## Notes

**2026-08-02T18:11:26Z**

RESOLVED.

Docs now describe only what actually happens: **npm (`note-ticket`) is the only registry this
fork publishes to**, plus a symlink-into-a-git-checkout install. The CLI is installed under one
name, `ticket`.

Changed:
- `README.md` — Install section is npm + checkout only (the `brew tap wedow/tools` and
  `yay -S ticket-core` blocks are gone, they never worked for this fork); dropped the
  ORIGINAL_README row from the docs table.
- `docs/cli.md` — Requirements/Install rewritten (npm ships a prebuilt bundle, no launcher);
  removed the "installed under both names, `ticket` and `tk`" paragraph; ADDED the one piece of
  unique content ORIGINAL_README had, the "Agent setup" snippet (now says `ticket help`).
- `docs/npm-library.md`, `docs-internal/how-to-publish-to-npm.md` — `tk` and the tap/AUR
  references removed; `npx tk help` -> `npx ticket help`.
- `docs-internal/migration-to-ts-high-level.md` — the T6 "Distribution" decision gets a
  SUPERSEDED-IN-PART note (2026-08-02) and now describes checkout + npm, plus the read-only
  copied-install shape that `make package-smoke` guards. The numbered divergence list is
  untouched (never renumber).
- `CLAUDE.md` (`AGENTS.md` is a symlink to it) — "Releases & Packaging" rewritten as
  "Distribution": npm-only, one installed name, and an explicit "do not add references to any
  distro package".
- `CHANGELOG.md` — Unreleased/Removed documents the `tk` removal, the Homebrew/AUR removal and
  the ORIGINAL_README deletion.

Deleted: `ORIGINAL_README.md`, `scripts/publish-homebrew.sh`, `scripts/publish-aur.sh`,
`pkg/aur/` (PKGBUILD), and the tap/AUR steps in `.github/workflows/release.yml` (it now only
creates the GitHub release). Leaving live CI publishing to a tap this fork does not own was the
same falsehood the docs carried, so it went with them.

Code changes that follow from "only the `ticket` name":
- `package.json` — the `tk` bin entry is gone. **BREAKING for anyone whose scripts call `tk`
  from an npm install.**
- `scripts/package-smoke.sh` — installs/asserts only `ticket`; header reframed from "the
  packaged shape both packages share" to "a COPIED install into a read-only prefix", which is
  what it actually guards now.
- `pkg/install-manifest.txt`, `features/steps/ticket_steps.py`, `.github/workflows/test.yml`
  (cold-checkout smoke now symlinks `ticket`, not `tk`), `features/ticket_wrapper.feature`,
  `ticket` launcher comments.

KEPT ON PURPOSE — the two remaining `wedow` mentions are the **MIT attribution**:
`THIRD_PARTY_LICENSES.md` and the license line in `README.md`. This fork is derived from
wedow/ticket under MIT, which requires the copyright notice be preserved; removing it would be
a license violation, not a doc cleanup. Historical `tk` mentions in CHANGELOG entries and in
source comments describing old bash behavior were also left alone.

Verified: `make typecheck`, `make test` (13 features, 261 scenarios, 1729 steps — all pass) and
`make package-smoke` are green.
