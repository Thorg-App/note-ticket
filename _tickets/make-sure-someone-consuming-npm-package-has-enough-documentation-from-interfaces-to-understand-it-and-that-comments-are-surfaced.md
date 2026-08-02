---
closed_iso: 2026-08-02T17:05:49Z
id: nid_e6y4ofkw7whfczkceruppbw3d_e
title: Make sure someone consuming NPM package has enough documentation from interfaces
  to understand it - AND that comments are surfaced
status: closed
deps: []
links: []
created_iso: '2026-08-02T16:53:11Z'
status_updated_iso: 2026-08-02T17:05:49Z
type: task
priority: 3
assignee: nickolaykondratyev
pwd: /home/nickolaykondratyev/git_repos/note-ticket
---
Let's split up the README into CLI usage and NPM library consumption usage so top level readme would reference two different new readmes. 

Make sure that key interfaces are called out from the NPM consumption readme.

Make sure there is sufficient documentation on the interfaces and the types that are used from the interfaces for the consumer of the npm package to understand how to use them.

Also no need to retain the `tk` shorthand in the README. The users can just use `ticket` longhand for using this CLI.

## Notes

**2026-08-02T17:05:49Z**

RESOLVED.

Docs split by surface:
- `README.md` is now a landing page (what it is, one CLI + one library snippet, install matrix, doc table, license).
- `docs/cli.md` — the full CLI reference (requirements, install, command list from `ticket help`, where tickets live, file errors, ids, deps/links, show/add-note/edit/closed, scripting).
- `docs/npm-library.md` — the library-consumer guide: a KEY INTERFACES table, getting a manager (`forRepository`/`forDirectory` + `FileTicketManagerOptions`), the `TicketManager` method table, id resolution, a `NewTicketInput` field/default table, status constants, `Ticket` read/write accessor tables with the raw-vs-interpreted rule, `TicketRelation`, `DepGraph`, an error table, the lower-level exports, and a guarantees/gotchas list. `docs/` ships in the npm tarball.

Docs use `ticket`, not `tk`. To keep that TRUE (npm/brew/AUR only ever installed `tk`), the CLI is now installed under BOTH names — `package.json` `bin`, the Homebrew formula and the AUR PKGBUILD each create `ticket` and keep `tk` as the shorthand. `scripts/package-smoke.sh` drives both installed symlinks and asserts each reports its own name in usage. CALLED OUT: this is a packaging change, made because the requested docs would otherwise be a lie; no existing `tk` user breaks.

Interface documentation / comment surfacing:
- `src/index.ts` now exports every type NAMED IN A PUBLIC SIGNATURE — `Frontmatter`, `FrontmatterValue`, `TicketDocument`, `FrontmatterEntry`, `FrontmatterJsonValue`, `BlockedTicket`, `DepCycle`, `TreeRow`, `TreeOptions`, `FileOperation`. Previously a consumer could call `ticket.frontmatter` or `graph.blocked()` but could not name the returned type.
- Doc comments added to the public `Ticket` members that had none (class-level immutability/raw-value contract, `path`, `document`, `parse`, `frontmatter`, `deps`, `links`, `assignee`, `parent`, `isClosed`, `body`, `withField`, `withoutField`, `withArrayField`, `text`) and to the status constants.
- Verified comments SURFACE: `tsc -p tsconfig.lib.json` carries every JSDoc into `dist-lib/**/*.d.ts` (checked `index.d.ts` and `core/ticket.d.ts`), so editors show them on hover for an npm consumer.

Guard: new `test/package-exports.test.ts` asserts the public surface (25 value exports at runtime, 17 type exports in type position via `make typecheck`). MUTATION-PROVEN — dropping the `dep-graph` export line turns it red both at runtime and in tsc.

Verification: `make test` green (465 unit tests, 261 BDD scenarios), `make typecheck`, `make build-lib`, `make package-smoke` green. Every code snippet in `docs/npm-library.md` was executed against the built `dist-lib/` (throwaway smoke script) — create/parent, `withArrayField`/`withField`/`withoutField`, `TicketRelation`, `DepGraph.blocked/children/tree/ready`, `setStatus` + `closed_iso`, `addNote`, and both id-resolution errors all behave as documented.

Also updated: CHANGELOG, CLAUDE.md doc pointers, `docs-internal/how-to-publish-to-npm.md`. Commit f54e952.
