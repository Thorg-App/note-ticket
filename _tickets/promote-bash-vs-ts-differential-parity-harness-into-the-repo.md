---
id: nid_mgfn04pyn3byxj72xxq0mggw5_e
title: Promote bash-vs-TS differential parity harness into the repo
status: in_progress
deps: [nid_ropjwdm792a5qqyu2u0zeuna1_e]
links: []
created_iso: '2026-07-29T22:46:24Z'
status_updated_iso: '2026-07-30T00:40:04Z'
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
