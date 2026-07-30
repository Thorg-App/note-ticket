---
id: nid_7qxhyhxhwbxi7yh0f8j7n79et_e
title: "help text omits the -a/--assignee default (git user.name)"
status: open
deps: []
links: []
created_iso: 2026-07-30T23:44:11Z
status_updated_iso: 2026-07-30T23:44:11Z
type: chore
priority: 3
assignee: CC_WITH-nickolaykondratyev
---

`tk help` lists `-a, --assignee         Assignee` with no default, but `create` defaults the assignee to `git config user.name` when the flag is omitted (see `src/cli/command-environment.ts` / `src/core/git.ts`). Bash help omitted it too, so this is pre-existing, not a port regression.

Fix: add the default to the help line in `src/cli/commands/help.ts` (which was GENERATED from bash help output -- see CLAUDE.md), and re-sync the Usage block in ORIGINAL_README.md, which is a verbatim copy of `TICKET_INVOKED_AS=tk node dist/ticket.mjs help`.

Noted by IMPLEMENTATION_REVIEWER during ts-port-6 cutover review.

