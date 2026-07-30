---
closed_iso: 2026-07-30T08:59:34Z
id: nid_8cislepljqvv88ayndtjlw34k_e
title: "TS port 4: graph commands (dep tree, dep cycle, show)"
status: closed
deps: [nid_ropjwdm792a5qqyu2u0zeuna1_e, nid_mgfn04pyn3byxj72xxq0mggw5_e, nid_5g3eta9cf7yi6iukmscxma6wc_e]
links: []
created_iso: 2026-07-29T21:57:25Z
status_updated_iso: 2026-07-30T08:59:34Z
type: task
priority: 2
assignee: CC_WITH-nickolaykondratyev
tags: [ts-port]
---

Read docs-internal/migration-to-ts-high-level.md first. Reference: cmd_dep_tree, cmd_dep_cycle, cmd_show in ./ticket - the gnarliest awk in the codebase; the TS versions live on src/core/dep-graph.ts and should finally be readable.

Scope:
- dep tree [--full] <id>: dedup printing (a node prints at its MAX depth unless --full), children sorted by subtree depth then id, box-drawing connectors, cycle-safe via path tracking, partial-id resolution of the root.
- dep cycle: DFS cycle detection over non-closed tickets, normalized dedup of cycles (rotate so smallest id starts), output format Cycle N: a -> b -> a plus member lines.
- show <id>: print the raw file, annotate parent: line with # <parent title>, then computed sections in order: ## Blockers (unclosed deps), ## Blocking (non-closed tickets depending on target), ## Children (tickets whose parent is target), ## Linked. Pager only when stdout is a TTY and TICKET_PAGER/PAGER set.
- Delegation subtlety: dep is ONE command name whose tree/cycle subcommands are read ops but whose default form (dep <id> <dep-id>) is a write op ported later. Do NOT flip the whole dep name yet - delegate from inside bash cmd_dep: the tree and cycle branches exec node, the default branch stays bash. show flips normally via TS_COMMANDS.
- Add core unit tests for tree dedup, cycle normalization, and inverse-relationship (blocking/children) computation.

Acceptance: dep tree, dep cycle, show served by TS; full BDD suite green.


## Notes

**2026-07-30T00:00:13Z**

### Carry-over from the closed ID-resolution decision ticket (nid_5g3eta9cf7yi6iukmscxma6wc_e)

Human confirmed both ID-resolution changes; this ticket owns pinning them:
- Add a BDD scenario: `dep tree <full-id>` resolves when that full id is a **substring of another** ticket's id (bash errors "ambiguous" here; TS is correct). Use `IdResolver` for the dep-tree root — do NOT reimplement the substring scan.
- Add a BDD scenario: an **empty** id resolves to not-found (bash succeeds in a one-ticket repo).
- Partial-ID matching is **retained** — exact match simply wins over it. Do not remove the partial tier.
