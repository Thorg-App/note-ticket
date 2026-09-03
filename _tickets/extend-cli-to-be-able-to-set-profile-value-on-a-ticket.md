---
closed_iso: 2026-09-03T20:53:00Z
id: nid_1nhn0ho4bhcncqpvluh7es037_e
title: extend cli to be able to set profile value on a ticket
status: closed
deps: []
links: []
created_iso: '2026-09-03T20:48:01Z'
status_updated_iso: 2026-09-03T20:53:00Z
type: task
priority: 3
assignee: CC_WITH-nickolaykondratyev
tags: []
pwd: /home/nickolaykondratyev/git_repos/note-ticket
---
Extend cli to allow setting `profile` frontmatter on the existing ticket.

`profile` will have allowed values of `standard` and `higher`. 

`profile` is optional and should NOT be defaulted to any value its only set if explicitly set.

## Resolution

Added a `profile <id> <profile>` CLI command that sets the optional `profile` frontmatter to
`standard` or `higher`.

- `src/core/ticket.ts` — new `TicketField.PROFILE` key plus `VALID_TICKET_PROFILES` /
  `TicketProfile` (the `standard`/`higher` union), mirroring how the status union is defined.
  The field is never defaulted: `create` does not write it, so a ticket has no profile until
  the command sets one.
- `src/cli/commands/profile.ts` — new `ProfileCommand` + `TicketProfileArgument` (the one
  place text becomes a `TicketProfile`). The profile is validated BEFORE the id is resolved,
  so an invalid value is reported even for a missing ticket and an unresolvable id mutates
  nothing — the same order of operations `StatusCommand` uses. Output: `Updated <id> profile
  -> <profile>`.
- Wired into `src/cli/main.ts` dispatch as a write command; documented in `help.ts`,
  `docs/cli.md` (a new "Profile" section) and `CHANGELOG.md`.
- Tests: `features/ticket_profile.feature` (12 BDD scenarios) and
  `test/profile-command.test.ts` (argument parsing/usage). Full suite green: `make test`
  (14 features, 282 scenarios; 478 unit tests).

No unset command was added — the ticket asked only to SET the value (80/20).
