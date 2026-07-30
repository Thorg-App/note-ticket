---
closed_iso: 2026-07-30T00:56:04Z
id: nid_mgfn04pyn3byxj72xxq0mggw5_e
title: Promote bash-vs-TS differential parity harness into the repo
status: closed
deps: [nid_ropjwdm792a5qqyu2u0zeuna1_e]
links: []
created_iso: '2026-07-29T22:46:24Z'
status_updated_iso: 2026-07-30T00:56:04Z
type: chore
priority: 2
assignee: CC_WITH-nickolaykondratyev
tags: [ts-port]
pwd: /home/nickolaykondratyev/git_repos/note-ticket
---
During T2 (core data-model port, ticket nid_ropjwdm792a5qqyu2u0zeuna1_e) a differential harness was built that generates random ticket graphs in throwaway git repos and compares bash ./ticket output against the TS core byte-for-byte. It found two real divergences that reading the code had missed (dep-tree subtree-depth refinement affecting --full sibling order; and 27 bogus cycles emitted by the bash cycle detector).

The scripts currently live only in the T2 output dir, gitignored from normal use:
  .ai_out/ts-port-2-core/CC_nid_ropjwdm792a5qqyu2u0zeuna1_e__ts-port-2-core-data-model-library-shared-with-futu_opus/parity-harness/diff.py          - dep tree / dep tree --full / ready / blocked / cycle differential
  .ai_out/ts-port-2-core/CC_nid_ropjwdm792a5qqyu2u0zeuna1_e__ts-port-2-core-data-model-library-shared-with-futu_opus/parity-harness/cycle_check.py   - validates that reported cycles are real cycles
  .ai_out/ts-port-2-core/CC_nid_ropjwdm792a5qqyu2u0zeuna1_e__ts-port-2-core-data-model-library-shared-with-futu_opus/parity-harness/query_check.py   - JSONL byte-for-byte comparison
  .ai_out/ts-port-2-core/CC_nid_ropjwdm792a5qqyu2u0zeuna1_e__ts-port-2-core-data-model-library-shared-with-futu_opus/parity-harness/slug_check.py    - title_to_filename comparison
  .ai_out/ts-port-2-core/CC_nid_ropjwdm792a5qqyu2u0zeuna1_e__ts-port-2-core-data-model-library-shared-with-futu_opus/parity-harness/dump.ts          - thin TS entrypoint that renders core output in bash's format

Promote them into e.g. scripts/parity/ with a make target, so T3 (nid_zesi8c4t7lyw6jgmqqsjqd54k_e), T4 (nid_8cislepljqvv88ayndtjlw34k_e) and T5 (nid_2ziai8ka9l0yak2lxnwlu9lk2_e) can run them while porting ls/ready/blocked/closed/query, dep tree/cycle/show and the write commands. Must be dropped at T6 cutover, when bash is deleted and there is nothing left to diff against.

## Acceptance Criteria

A make target runs the differential harness against the current bash ./ticket and reports zero unexpected mismatches; the expected (documented) cycle-detection divergence is either whitelisted or the harness is run after T4 flips dep cycle.

## Resolution (done)

Promoted to `scripts/parity/` with `make parity` (commit f70d3ca).

- `dump.ts` — TS entrypoint rendering `src/core` in bash's exact format; bundled by
  `npm run build:parity` to `dist-parity/` (gitignored, typechecked via tsconfig include).
- `harness.py` — `TempRepo` (throwaway git repo + `_tickets`), bash/TS runners, fixed +
  seeded-random scenario generators.
- `check_graph.py` — byte-compare of `ready`, `blocked`, `dep tree`, `dep tree --full`;
  semantic validation of `dep cycle`.
- `check_query.py` — `query` JSONL byte-compare + missing-`id` divergence pin.
- `check_slug.py` — bash `create` filename vs `Slug.fromTitle`.
- `run.py` — runs all, exit 1 on unexpected mismatch. `make parity PARITY_ARGS="--random 500"`.

Whitelisted divergences (pinned, not byte-compared, so a change on either side still fails):
1. `dep cycle` — bash emits bogus cycles and misses real ones; instead every TS-reported
   cycle must be a real closed walk and no cyclic graph may come back empty. Drop the
   whitelist when T4 (nid_fba92yfczp71jjcprn4ufmory_e) flips `dep cycle` to TS.
2. `.md` with no `id` — bash skips it (emits a bare blank line), TS hard-errors naming the
   file (deliberate, nid_n6eavbm0h77twvna8k9nnpu2g_e).

Verification: `make parity` green (68 scenarios) and at `--random 400` (408 scenarios,
0 failures, 111 whitelisted bash bogus cycles). Mutation-tested — injected bugs in
`dump.ts` (dropped first `ready` row; mangled slug; fabricated cycle) all fail the
harness. `make test` 180 scenarios / 1205 steps green; `make typecheck` clean.

Docs: `scripts/parity/README.md` (usage, whitelist, T6 delete list), plus pointers in
CLAUDE.md and `docs-internal/migration-to-ts-high-level.md`.
