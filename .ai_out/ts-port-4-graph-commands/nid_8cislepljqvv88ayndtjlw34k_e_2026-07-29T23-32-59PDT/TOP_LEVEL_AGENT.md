# TOP_LEVEL_AGENT — ts-port-4-graph-commands

Ticket: `nid_8cislepljqvv88ayndtjlw34k_e` — TS port 4: graph commands (dep tree, dep cycle, show)
Branch: `nid_8cislepljqvv88ayndtjlw34k_e_2026-07-29T23-32-59PDT`
Out dir: `.ai_out/ts-port-4-graph-commands/nid_8cislepljqvv88ayndtjlw34k_e_2026-07-29T23-32-59PDT/`

Two predecessor runs (`..._23-15-34PDT`, `..._23-23-55PDT`) wrote only plan skeletons — **no implementation
landed**. This run starts the implementation from the current tree.

No Explore phase: the ticket body carries the scope; CLAUDE.md + `docs-internal/migration-to-ts-high-level.md`
carry the architecture.

Flow: IMPLEMENTATION_WITH_SELF_PLAN → IMPLEMENTATION_REVIEW → IMPLEMENTATION_ITERATION (max 4).

## Log

- [x] Setup
- [x] IMPLEMENTATION_WITH_SELF_PLAN — done. Commits `94242f2`, `e934523`, `3019ca9`.
      Reported all four gates green; 2 new declared divergences (#8, #9); 3 vacuous guards found and fixed.
- [x] IMPLEMENTATION_REVIEW — READY, nothing blocking. 3 SHOULD-FIX (divergence #8 mislabelled as
      human-approved, a test whose name contradicted its assertion, CHANGELOG) + NICE-TO-HAVEs.
- [x] IMPLEMENTATION_ITERATION round 1 (`4604477`) — all items incorporated, none rejected.
- [x] Confirmation pass 1 — **NOT READY**: round 1 deleted a `TreeLayout.layoutChildren` guard as
      "unreachable"; the proof missed duplicate `deps` entries. Reproduced an extra `dep tree` row
      vs bash. All four gates were green through the break — the parity generator emits no
      duplicate `deps`.
- [x] IMPLEMENTATION_ITERATION round 2 (`2176db8`) — guard restored, 2 unit tests + 2 parity
      fixtures added, both mutation-verified red. Gates: unit 291, parity graph 71 scenarios.
- [x] Confirmation pass 2 — **NOT READY**: the set comparison was too broad. Row multiplicity went
      unguarded for ALL four headings while #8 covers `## Blocking` only. Proved a concrete
      regression ships green (`[...new Set(ids)]` in `show.ts` → unit AND parity both rc=0).
- [x] IMPLEMENTATION_ITERATION round 3 (`865ab35`) — dedup narrowed to `## Blocking`; other
      headings back to a multiset. Plus 2 unit tests. Both mutation directions measured.
- [x] Confirmation pass 3 (final) — **READY**, zero blocking. `git diff 2176db8 865ab35 -- src/`
      empty (no shipped-behaviour drift). Gates: build 0, unit 293/293, BDD 214 scenarios/0 failed,
      parity graph 71 scenarios/0 failures.
- [x] CHANGELOG entry (`860e72a`, top-level only — 6 user-visible changes)
- [x] `decide` ticket `nid_qxt3z5unr9k220aqttbw84a6a_e` filed: divergence #8's duplicate-row
      removal is shipped but NOT human-approved (the closed decision ticket covers #9 only).
- [x] Close ticket

## Outcome

Converged in 3 iteration rounds (limit 4). Both roles signal READY.

The two confirmation passes each caught a real defect that all four green gates missed — both of
the same shape: **a guard weakened by argument instead of by measurement.** Round 1 deleted a
`TreeLayout` re-check as "unreachable" (it was reachable via duplicate `deps` entries, and the
parity generator emitted none); round 2's harness fix for that then dropped multiplicity checking
across all four `show` headings. Worth remembering: in this repo a green `make parity` only proves
the *generated fixtures* agree, so a fix must extend the generator, not just the comparator.

Left open deliberately: `nid_qxt3z5unr9k220aqttbw84a6a_e` (`decide`) — divergence #8's duplicate-row
removal is shipped but not human-approved.
