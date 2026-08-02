---
closed_iso: 2026-08-02T16:10:07Z
id: nid_lvmqwxhbp4bjozzs8vv7qquo3_e
title: Lets prepare this to be ready to be published to NPM
status: closed
deps: []
links: []
created_iso: '2026-08-02T15:56:55Z'
status_updated_iso: 2026-08-02T16:10:07Z
type: task
priority: 3
assignee: nickolaykondratyev
pwd: /home/nickolaykondratyev/git_repos/note-ticket
---
Let's prepare this package to be published to NPM.

The goal is for another TS CLI NodeJS package to be able to consume the ticket functionality and use it.

I am envisioning that we have an interface of `TicketManager` that is well documented that someone can take dependency on. And the implementation is separate from the interface.

## Resolution (2026-08-02)

Done in commit 2e8245e on this branch. The package is npm-publish-ready:

- **`TicketManager` interface** (`src/lib/ticket-manager.ts`) — documented contract: `list` / `get` (CLI partial-id resolution rules) / `create` / `setStatus` / `addNote` / `save`. Implementation is separate: `FileTicketManager` (`src/lib/file-ticket-manager.ts`), with factories `forRepository(cwd)` ($TICKETS_DIR / git-root `_tickets`) and `forDirectory(path)`, plus injectable clock/id/assignee for consumer tests. Typed errors `TicketNotFoundError` / `AmbiguousTicketIdError`.
- **Same bytes as the CLI**: the pure pieces both share were moved to `src/core/` (`new-ticket.ts`, `status-update.ts`, `ticket-note.ts`), so library and `tk` write byte-identical files.
- **Packaging**: `package.json` gained name/version 0.1.0/license/repository, `exports`+`types` → `dist-lib/index.js`/`.d.ts` (built by `npm run build:lib`, `tsc -p tsconfig.lib.json`), `bin.tk` → `dist/ticket.mjs`, `files`, `engines`, `prepack` (builds bundle + lib); `private: true` removed. Entry `src/index.ts` exports lib + core, never `src/cli/`.
- **Verified**: `make test` (261 BDD scenarios + 439 unit tests, incl. new `test/ticket-manager.test.ts`), `make package-smoke`, and an end-to-end consumer smoke: `npm pack` → install tarball into a scratch project → drive `TicketManager` and read the result back with the installed `tk` bin.
- Publishing itself is just `npm publish` after the normal release flow; docs updated (README "Using as a library (npm)", CLAUDE.md "Library API (npm)", CHANGELOG).
