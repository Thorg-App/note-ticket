---
closed_iso: 2026-08-02T16:16:41Z
id: nid_guxqqi5vozkjgviicj23psamc_e
title: create a document on how to publish this to NPM
status: closed
deps: []
links: []
created_iso: '2026-08-02T16:12:54Z'
status_updated_iso: 2026-08-02T16:16:41Z
type: task
priority: 3
assignee: nickolaykondratyev
pwd: /home/nickolaykondratyev/git_repos/note-ticket
---
Create a document on how to publish this library to NPM,

I have NPM publish token at 'NPM_PUBLISH_TOKEN' environment variable,
DONT leak the contents of this token, but do create scripts using this ENV variable for publishing.

Put instructions on how to publish in /home/nickolaykondratyev/git_repos/note-ticket/docs-internal/how-to-publish-to-npm.md (be CONCISE)

## Resolution

Done.

- `docs-internal/how-to-publish-to-npm.md` — concise publish guide: prerequisites, the
  two commands, versioning/changelog/tag order, what ships in the tarball, post-publish
  verification, unpublish caveats.
- `scripts/publish-npm.sh` — `--dry-run` and real publish. Reads `$NPM_PUBLISH_TOKEN`,
  writes it only to a `0600` npmrc under `mktemp -d` selected via `NPM_CONFIG_USERCONFIG`
  and removed by an EXIT trap; never in the repo, `~/.npmrc`, argv, or output. Refuses a
  dirty tree, runs typecheck/build/build-lib/unit tests before publishing.
- `CLAUDE.md` — one line noting npm publishing is a deliberate LOCAL manual step, not part
  of the tag-triggered release workflow.

Verified: `--dry-run` packs `note-ticket@0.1.0` (44 files, dist/ + dist-lib/ + docs) with a
dummy token, exit 0; dirty-tree guard and missing-token guard both exit 1.

`npm view note-ticket` returned 404 on 2026-08-02 — the name is unclaimed, so `0.1.0`
would be a first publish. Nothing was published.
