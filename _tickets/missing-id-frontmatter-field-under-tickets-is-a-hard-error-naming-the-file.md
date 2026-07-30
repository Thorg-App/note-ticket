---
closed_iso: 2026-07-30T00:06:43Z
id: nid_n6eavbm0h77twvna8k9nnpu2g_e
title: Missing 'id' frontmatter field under _tickets is a hard error naming the file
status: closed
deps: []
links: []
created_iso: '2026-07-29T23:59:37Z'
status_updated_iso: 2026-07-30T00:06:43Z
type: task
priority: 2
assignee: CC_WITH-nickolaykondratyev
tags: [ts-port, core]
pwd: /home/nickolaykondratyev/git_repos/note-ticket
---
HUMAN DECISION (recorded 2026-07-29, see nid_5g3eta9cf7yi6iukmscxma6wc_e): every `.md` file under `_tickets/` is EXPECTED to carry an `id` frontmatter field. A file without one is a corrupt repo, not a silently-ignored file.

Current bash behavior (`ticket_path()` / `_collect_ticket_files()` in ./ticket): a file with no `id` simply never matches and contributes nothing — no signal at all. A hand-edit that drops the `id` makes the ticket vanish silently. That is the behavior being replaced.

Required behavior: fail loudly, naming the offending path, e.g.
  Error: /path/_tickets/foo.md has no 'id' frontmatter field

Implement in the TS core (`src/core/ticket-store.ts` enumeration + `src/core/id.ts` resolution) — `collectFiles()` is the single source of truth for "what is a ticket file", so the check belongs on that path. Accepted trade-off, explicitly chosen by the human over skip-with-warning: ONE malformed file breaks EVERY command, including `ls`. The error message must therefore make the fix obvious (name the path, say what is missing).

No BDD scenario covers id-less files today (verified by grep over features/), so there is nothing to un-pin. The scenario pinning this lands with the first flipped command that enumerates tickets — T3 (nid_zesi8c4t7lyw6jgmqqsjqd54k_e) — which is why T3 deps on this ticket.

Do NOT change ./ticket (bash) for this: the BDD suite runs against bash until each command flips, so the new error can only be asserted once the enumerating command is TS.

## Acceptance Criteria

- `src/core/` raises a named, path-carrying error for any `.md` file under the tickets dir lacking an `id` frontmatter field.
- Unit tests cover: missing `id`, empty `id` value, and a file with no frontmatter block at all.
- A BDD scenario pinning the error ships with T3 (the first flipped enumerating command).
- README/ORIGINAL_README documents that `id` is mandatory.

## Notes

**2026-07-30T00:06:43Z**

RESOLVED.

Implementation:
- `src/core/id.ts`: new `MissingTicketIdError extends Error` — message `<path> has no 'id' frontmatter field`, `name` set, `path` exposed. Doc comment records the human decision and the accepted trade-off (one bad file fails every enumerating command, `ls` included). WHY it lives in id.ts: identity concerns belong to the id module; ticket-store imports it.
- `src/core/ticket-store.ts`: `TicketStore.load()` throws it when `ticket.id === ''`. WHY `load()` is the enforcement point: `collectFiles()` only yields paths (no parsing), and `loadAll()` plus every single-ticket read funnel through `load()`, so this is the one place on the enumeration path that sees content.
- `src/core/ticket.ts`: `Ticket.id` doc comment updated — an empty id now means a corrupt file, not a non-ticket.
- The `Error: ` prefix stays the CLI's job (bash convention: `echo \"Error: ...\" >&2`).

Tests (`test/ticket-store.test.ts`, new `TicketStore id enforcement` describe, 6 cases): missing `id` key, empty value (`id:`), quoted-empty value (`id: \"\"`), no frontmatter block at all, exact error message naming the path, and `loadAll()` failing the whole enumeration rather than skipping the bad file.

Verification: `make test` green — 179 unit tests, 180 BDD scenarios, 12 features.

Docs: README.md and ORIGINAL_README.md now state `id` is mandatory and quote the error text. CHANGELOG under Unreleased/Changed.

Not done here (by design, per the ticket): no `./ticket` (bash) change, and no BDD scenario — the scenario pins on the first flipped enumerating command. A note with the exact expected stderr line was added to T3 (nid_zesi8c4t7lyw6jgmqqsjqd54k_e).
