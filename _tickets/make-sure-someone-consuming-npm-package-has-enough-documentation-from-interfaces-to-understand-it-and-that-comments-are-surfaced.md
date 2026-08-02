---
id: nid_e6y4ofkw7whfczkceruppbw3d_e
title: Make sure someone consuming NPM package has enough documentation from interfaces
  to understand it - AND that comments are surfaced
status: in_progress
deps: []
links: []
created_iso: '2026-08-02T16:53:11Z'
status_updated_iso: '2026-08-02T16:56:09Z'
type: task
priority: 3
assignee: nickolaykondratyev
pwd: /home/nickolaykondratyev/git_repos/note-ticket
---
Let's split up the README into CLI usage and NPM library consumption usage so top level readme would reference two different new readmes. 

Make sure that key interfaces are called out from the NPM consumption readme.

Make sure there is sufficient documentation on the interfaces and the types that are used from the interfaces for the consumer of the npm package to understand how to use them.

Also no need to retain the `tk` shorthand in the README. The users can just use `ticket` longhand for using this CLI.
