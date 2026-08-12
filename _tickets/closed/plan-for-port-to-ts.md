---
closed_iso: 2026-07-29T21:57:54Z
id: nid_5nqmwj9ni9mquf1uf8hodswqw_e
title: plan for port to TS
status: closed
deps: []
links: []
created_iso: '2026-07-29T19:46:11Z'
status_updated_iso: 2026-07-29T21:57:54Z
type: task
priority: 3
assignee: nickolaykondratyev
pwd: /home/nickolaykondratyev/git_repos/note-ticket
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

## Resolution (2026-07-29)

Completed. Deliverables:

1. **High-level plan**: `docs-internal/migration-to-ts-high-level.md` — strangler-fig
   strategy (bash dispatcher delegates ported commands to `node dist/ticket.mjs` via a
   `TS_COMMANDS` list, BDD suite stays green throughout), target architecture
   (`src/core/` data-model layer shared with future visualization + thin `src/cli/`),
   behavioral parity checklist, and distribution recommendation for packaging.
2. **Execution tickets** (tag `ts-port`), cross-dependencies wired:
   - T1 `nid_604l3jerigu3ikyq68958lxy7_e` scaffold + hybrid dispatcher (no deps)
   - T2 `nid_ropjwdm792a5qqyu2u0zeuna1_e` core data-model library (deps: T1)
   - T3 `nid_zesi8c4t7lyw6jgmqqsjqd54k_e` read commands (deps: T2)
   - T4 `nid_8cislepljqvv88ayndtjlw34k_e` graph commands (deps: T2)
   - T5 `nid_2ziai8ka9l0yak2lxnwlu9lk2_e` write commands (deps: T2, T4 — T4 soft-dep so the split `dep` dispatch flip lands cleanly)
   - T6 `nid_fhmxugci00tfkeu3eyeggv6gq_e` cutover + packaging + docs (deps: T3, T4, T5; tagged `decide` — human picks how the built bundle reaches Homebrew/AUR)
   T3/T4 are parallelizable after T2.

Key seam found: `features/steps/ticket_steps.py:get_ticket_script` already supports a
`TICKET_SCRIPT` env override, but the chosen strategy keeps tests pointed at `./ticket`
(the hybrid dispatcher) so no test changes are needed during the port.
