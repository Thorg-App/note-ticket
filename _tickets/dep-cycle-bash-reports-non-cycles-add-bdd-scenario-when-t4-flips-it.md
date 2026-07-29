---
id: nid_fba92yfczp71jjcprn4ufmory_e
title: "dep cycle: bash reports non-cycles; add BDD scenario when T4 flips it"
status: open
deps: [nid_8cislepljqvv88ayndtjlw34k_e]
links: []
created_iso: 2026-07-29T22:46:35Z
status_updated_iso: 2026-07-29T22:46:35Z
type: bug
priority: 1
assignee: CC_WITH-nickolaykondratyev
tags: [ts-port]
---

The bash dep cycle detector (cmd_dep_cycle in ./ticket) aborts its DFS on the first cycle found and returns up the call chain, leaving nodes marked gray ("visiting"). A later DFS from a different root that walks into such a gray node reports a path that is NOT a cycle at all, e.g. for a->b, b->c, c->b it prints:

  Cycle 1: c -> b -> c      (real)
  Cycle 2: a -> b           (NOT a cycle - single member "a")

It also MISSES real cycles for the same reason. Measured with a differential harness over 158 generated graphs: bash emitted 27 bogus cycles; the TS core (src/core/dep-graph.ts CycleFinder) emitted 0 and missed no cyclic graph.

src/core/dep-graph.ts already implements the correct algorithm (records every back edge, dedups by normalized member set, iterates in deterministic enumeration order). Nothing user-visible changed yet because T2 flipped no commands.

## Acceptance Criteria

When T4 (nid_8cislepljqvv88ayndtjlw34k_e) adds "dep" to TS_COMMANDS: features/ticket_dependencies.feature gains a scenario for the a->b, b->c, c->b shape asserting exactly one cycle is reported, and a scenario for two overlapping cycles asserting both are found. Also confirm no existing scenario encoded the buggy output.

