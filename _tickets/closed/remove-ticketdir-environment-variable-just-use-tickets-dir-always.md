---
closed_iso: 2026-08-03T01:22:06Z
id: nid_qww0tzdmc8g2njyc4fnmsn0da_e
title: Remove TICKET_DIR environment variable just use /_tickets dir always
status: closed
deps: []
links: []
created_iso: '2026-08-02T23:40:31Z'
status_updated_iso: 2026-08-03T01:22:06Z
type: task
priority: 3
assignee: nickolaykondratyev
pwd: /home/nickolaykondratyev/git_repos/note-ticket
---

## Resolution

`TICKETS_DIR` is gone. `TicketsDirectory.resolve(cwd)` now answers `<git-repo-root>/_tickets`
unconditionally — the `env` parameter it used to take was deleted, so no code path can read the
variable back.

What changed:

- `src/core/ticket-store.ts` — override removed, signature is `resolve(cwd = process.cwd())`,
  WHY-NOT comment records why the override is not coming back.
- `src/cli/store-resolver.ts` — the no-git-repo hint is now `Run inside a git repo` (it used to
  name the variable). `src/cli/cli-error.ts` doc comment follows.
- `src/lib/file-ticket-manager.ts` — `forRepository` no longer mentions the variable; its throw
  message is `'<cwd>' is not inside a git repository`. `forDirectory` is unchanged and is the
  supported way for a library consumer to point at an arbitrary directory.
- `src/cli/commands/help.ts`, `docs/cli.md`, `docs/npm-library.md` — the override is no longer
  documented.
- `docs-internal/migration-to-ts-high-level.md` — **new divergence #21** (appended, nothing
  renumbered) plus the contract-summary line; `CLAUDE.md` count 20 → 21.
- CHANGELOG: BREAKING entry under Unreleased → Removed.

Tests (both **mutation-proven**: re-adding a `process.env.TICKETS_DIR` read turns each red):

- `test/ticket-store.test.ts` → "ignores a TICKETS_DIR environment variable" — asserts on the
  ENVIRONMENT rather than a parameter, because the parameter is what was deleted.
- `features/ticket_directory.feature` → "TICKETS_DIR env var is ignored" — the CLI run with the
  variable exported still lists the repo-root store.

`make test` (268 scenarios, unit tests) and `make package-smoke` are green.
