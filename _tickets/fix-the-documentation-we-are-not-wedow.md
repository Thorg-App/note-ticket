---
id: nid_z3zpg0irlpcq67cksy8fivvef_e
title: Fix the documentation we are not wedow
status: in_progress
deps: []
links: []
created_iso: '2026-08-02T17:59:45Z'
status_updated_iso: '2026-08-02T18:03:45Z'
type: task
priority: 3
assignee: nickolaykondratyev
pwd: /home/nickolaykondratyev/git_repos/note-ticket
---
FIX the documentation,
FACT: this package is NOT under `wedow/tools` so homebrew installation is completely false. We should remove any reference to the wedow. We can also clean out the `/home/nickolaykondratyev/git_repos/note-ticket/ORIGINAL_README.md` as it may mis-inform, we should have the info on how to use the CLI remain (which I think it already is in cli.md). 

So yea clean out any `wedow` references in documentation, clean out any referenes to installations that do not happen like homebrew.

And also if there is any references to `tk` installation we want to remove that. We want to only use the `ticket` full command name. 

We DO in fact publish to NPM. But we dont publish to any installation repos like homebrew. 

FACT: THIS is a fork of wedow/ticket that is not going its own route.
