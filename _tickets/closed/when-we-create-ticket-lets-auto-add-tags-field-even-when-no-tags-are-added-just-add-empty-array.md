---
closed_iso: 2026-08-06T20:47:59Z
id: nid_dzwr4djukvk97b5sempjig34m_e
title: when we create ticket lets auto add tags field even when no tags are added
  just add empty array
status: closed
deps: []
links: []
created_iso: '2026-08-06T20:43:48Z'
status_updated_iso: 2026-08-06T20:47:59Z
type: task
priority: 3
assignee: nickolaykondratyev
pwd: /home/nickolaykondratyev/git_repos/note-ticket
---
When ticket is created it would be nice to have 'tags' in frontmatter even if it doesn't have any tags at this point.

## Notes

**2026-08-06T20:47:59Z**

Resolution: `create` now always writes a `tags` line — `tags: []` when no --tags are given — so a fresh ticket is ready to hand-edit tags into, matching how deps/links already work. tags stays last in the frontmatter (after the optional parent line).

Changed: src/core/new-ticket.ts (tags pushed unconditionally; tagsValue returns [] when empty). Documented as deliberate divergence #22 in docs-internal/migration-to-ts-high-level.md (owner-approved via this ticket). Updated golden tests (create-command, ticket-manager), added BDD scenario 'Ticket has empty tags by default', CHANGELOG, and docs/npm-library.md. Full make test green (470 unit + 269 BDD).
