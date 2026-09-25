---
id: nid_5ntsuikk8rufmu7ty8cz0lwhm_e
title: "Rename misleading BDD scenario 'Reopening preserves status_updated_iso'"
status: in_progress
deps: []
links: []
created_iso: 2026-09-25T22:29:43Z
status_updated_iso: 2026-09-25T22:29:43Z
type: chore
priority: 2
assignee: nickolaykondratyev
tags: [status_updated_iso]
pwd: /home/nickolaykondratyev/git_repos/note-ticket
---

features/ticket_status.feature has scenario 'Reopening preserves status_updated_iso', but reopen RESTAMPS status_updated_iso (src/core/status-update.ts StatusUpdate.applied); the scenario only asserts a valid timestamp. Rename it (e.g. 'Close then reopen keeps a valid status_updated_iso') or fold it into the 'reopen restamps status_updated_iso' scenario added by ticket nid_qhsvp59aqj1j9rgau319w89tw_e. Changing an existing behavior test needs owner alignment.

