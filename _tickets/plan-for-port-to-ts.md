---
id: nid_5nqmwj9ni9mquf1uf8hodswqw_e
title: "plan for port to TS"
status: open
deps: []
links: []
created_iso: 2026-07-29T19:46:11Z
status_updated_iso: 2026-07-29T19:46:11Z
type: task
priority: 3
assignee: nickolaykondratyev
---

GOAL create plan and tickets for PORT of /home/nickolaykondratyev/git_repos/note-ticket/ticket from bash to Typescript.

The end goal is still easy to use CLI that retains the same interface, but instead of running it in bash it would use Node.

How to approach this migration.

WHY I am doing migration (so you can judjge if it makes sense):
- the bash with awk is completely unreadable to me
- i want to add visualization of the graph and would like to have the same data model layer be used in both CLI and visualization.

Also, a note: I am thinking as part of this migration we keep all the BDD tests as is, thats our harness.


### Notes
- Node would be expected to be  pre-installed on the system, NOT bundled int the artifact.
- I would like the BDD tests to pass, but if BDD test masks a bug its ok to adjust them.
- It makes sense to split the port up in such a way that we can offload parts of the `ticket` functionality to TS to keep BDD tests green.

### GOAL:
Let's have high level plan /home/nickolaykondratyev/git_repos/note-ticket/docs-internal/migration-to-ts-high-level.md and Lets create meaty for steps to execute ticket steps that have cross dependencies between each other on how to migrate.
