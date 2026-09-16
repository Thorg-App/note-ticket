---
closed_iso: 2026-09-16T15:57:19Z
session_ids: [{"a": "claude", "type": "execution", "id": "6c9dc888-84fe-4b3f-b6f2-a159cbee5277"}, {"a": "claude", "type": "review", "id": "87604c51-ca39-453f-8b41-1a04fc716272"}]
working_dir: note-ticket
id: nid_55ulmcqjp79p41jsgwctgg2qj_e
title: "Allow status to be a custom name that is set"
status: closed
deps: []
links: []
created_iso: 2026-09-16T15:52:58Z
status_updated_iso: 2026-09-16T15:57:19Z
type: task
priority: 3
assignee: nickolaykondratyev
tags: []
---

Allow 'status' to be a custom name that is set like 'p2',
**Such statuses would NOT be seen as open**, so they would not be ready for pick up. Adjust the CLI help to state that status can be some custom value as well.

## Resolution

Built and tested (`make test`: unit tests + 304 BDD scenarios pass).

- **Core**: `src/core/custom-ticket-status.ts` — `CustomTicketStatus` (branded string type), `CustomTicketStatusParser.of/isValid`, `InvalidTicketStatusError`, `CUSTOM_TICKET_STATUS_RULE`. `TicketStatus` in `src/core/ticket.ts` is now `BuiltInTicketStatus | CustomTicketStatus`, so a raw typo literal is still a compile error. All exported from `src/index.ts`.
- **CLI**: `TicketStatusArgument` in `src/cli/commands/status.ts` is now a class: built-ins go through the old `ChoiceArgument`, anything else must pass the custom rule. Usage tail: `Valid statuses: open in_progress closed punted, or a custom status (e.g. p2)`. `ticket help` and `docs/cli.md` (new "Custom statuses" section) state it.
- **"Not seen as open"** needed no new logic: `DepGraph` already treats only `open`/`in_progress` as active and only `closed` as done, so a custom status is never in `ready`/`blocked` and keeps blocking dependents (same as `punted`). BDD in `features/ticket_listing.feature` pins this.

Assumptions made (non-interactive):
- Allowed custom name = letters, digits, `_`, `-`, starting with a letter or digit. WHY: the value is written unquoted into frontmatter (whitespace/`:`/quotes/newlines would corrupt it) and a leading `-` looks like a flag.
- `invalid` is now a *valid* custom status, so the existing "invalid status" BDD scenarios now use `in:valid` (same intent, still rejected).
- `done` (legacy) is not rejected as a custom name; it keeps its existing legacy meaning in `closed` listing.
- Library `setStatus` accepts custom statuses via `CustomTicketStatusParser.of("p2")` (parity with the CLI).
