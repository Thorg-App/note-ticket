---
closed_iso: 2026-07-30T09:43:49Z
id: nid_fba92yfczp71jjcprn4ufmory_e
title: "dep cycle: bash reports non-cycles; add BDD scenario when T4 flips it"
status: closed
deps: [nid_8cislepljqvv88ayndtjlw34k_e]
links: []
created_iso: 2026-07-29T22:46:35Z
status_updated_iso: 2026-07-30T09:43:49Z
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


## Notes

**2026-07-30T09:43:49Z**

## Resolution

All three acceptance criteria met. T4 had already flipped `dep cycle` to TS, so this landed immediately.

- **AC1** — `features/ticket_dependencies.feature`: the a->b,b->c,c->b scenario strengthened from `not contain "Cycle 2:"` to exactly-one-cycle plus its member set, and given a SECOND in-pointer for order robustness.
- **AC2** — new scenario `Cycle detection finds every cycle overlapping in one ticket`: a three-way overlap asserting all 3 are found (the half old bash MISSED).
- **AC3** — confirmed: no pre-existing scenario under `features/` encoded the buggy bash output.

Beyond the ACs, review found and closed two vacuity holes:
1. The first version of the new scenarios was non-vacuous only by ACCIDENT of slug enumeration order — recreated with the tickets enumerating differently, both PASSED against the buggy behavior. Fixed structurally (two mutually-unreachable in-pointers; three interchangeable leaves), so no rename can un-discriminate them. Proved across all 24 filename permutations per shape: clean 0/48, bash-abort mutant 48/48.
2. The `seen` dedup guard in `CycleFinder.record` was entirely untested — deleting it left all 294 unit tests and every scenario green. Now covered by a `deps: [a, a]` unit test (live input class: hand-edited frontmatter). Kept at the unit layer because `tk dep` is idempotent and cannot produce the duplicate.

Also pinned cycle NUMBERING (a renderer always printing `Cycle 1:` used to survive the whole suite) and made the count step reject an expected count of 0, which empty output would have satisfied.

Mutation matrix, each producing a failure: abort-on-first-cycle, dedup guard deleted, renderer always `Cycle 1:`.

Commits: b0f7f1b, aea4c27, 34c6e36. Files: `features/ticket_dependencies.feature`, `features/steps/ticket_steps.py`, `test/dep-graph.test.ts`, `scripts/parity/README.md`, `docs-internal/migration-to-ts-high-level.md`.

215 scenarios, 295 unit tests, `make parity` green. The parity whitelist still carries `bash bogus cycles=19` — buggy bash remains on the other side of the diff until T6 deletes the harness. No follow-up needed.
