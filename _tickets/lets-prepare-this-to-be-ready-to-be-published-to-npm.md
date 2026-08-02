---
id: nid_lvmqwxhbp4bjozzs8vv7qquo3_e
title: Lets prepare this to be ready to be published to NPM
status: in_progress
deps: []
links: []
created_iso: '2026-08-02T15:56:55Z'
status_updated_iso: '2026-08-02T15:59:56Z'
type: task
priority: 3
assignee: nickolaykondratyev
pwd: /home/nickolaykondratyev/git_repos/note-ticket
---
Let's prepare this package to be published to NPM.

The goal is for another TS CLI NodeJS package to be able to consume the ticket functionality and use it.

I am envisioning that we have an interface of `TicketManager` that is well documented that someone can take dependency on. And the implementation is separate from the interface.
