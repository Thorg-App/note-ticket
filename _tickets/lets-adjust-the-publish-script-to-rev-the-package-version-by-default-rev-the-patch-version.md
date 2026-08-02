---
closed_iso: 2026-08-02T17:18:18Z
id: nid_4yugvbrxw1i1vip94q4kl0rrv_e
title: Lets adjust the publish script to rev the package version - by default rev
  the patch version
status: closed
deps: []
links: []
created_iso: '2026-08-02T17:12:29Z'
status_updated_iso: 2026-08-02T17:18:18Z
type: task
priority: 3
assignee: nickolaykondratyev
pwd: /home/nickolaykondratyev/git_repos/note-ticket
---


## Resolution

`scripts/publish-npm.sh` now revs the version itself. Default is a **patch** bump.

```
./scripts/publish-npm.sh [--dry-run] [--no-bump] [patch|minor|major|<x.y.z>]
```

- The bump argument goes straight to `npm version <spec> --no-git-tag-version`, so
  `prerelease`/`premajor`/etc. work too; `--no-bump` publishes `package.json` as-is.
- Order: dirty-tree guard -> gates (`typecheck`/`build`/`build-lib`/`npm test`) -> bump ->
  commit `release: v<version>` -> `npm publish`. The commit happens BEFORE the upload so
  every published tarball corresponds to a commit.
- An EXIT trap reverts the bump (`git checkout -- package.json package-lock.json`) on any
  failure before the commit and at the end of every dry run. Safe because the script
  already refuses a dirty tree, so the bump is the only uncommitted change in flight.
- Tagging stays manual (the script still prints the `git tag` line), and the changelog is
  still moved by hand.

Docs updated: `docs-internal/how-to-publish-to-npm.md` (usage + versioning sections),
`CLAUDE.md` (one-line note under Releases & Packaging). No CHANGELOG entry — release
tooling only, no user-facing CLI behavior change.

### Verification (in a throwaway clone under `.tmp/`, gates stubbed where noted)

- Real `--dry-run`, nothing stubbed: 0.1.0 -> 0.1.1, tarball packed as
  `note-ticket-0.1.1.tgz`, bump reverted, tree clean at 0.1.0, exit 0.
- Bump specs (default/`minor`/`major`/`2.5.0`/`--no-bump`): 0.1.1 / 0.2.0 / 1.0.0 / 2.5.0 /
  no bump. Each reverted; version back to 0.1.0 after all five.
- Real publish path (upload + `whoami` stubbed): bumped, `Committed release: v0.1.1`,
  published, tree clean, no spurious revert.
- Failure after the bump (`npm whoami` forced to fail): bump reverted, no commit, exit 1.
- `--bogus` -> usage error, exit 1.
