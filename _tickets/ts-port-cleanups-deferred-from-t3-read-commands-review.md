---
id: nid_7opxnvhia4a2ty7o0k9t6z4bl_e
title: 'TS port: cleanups deferred from T3 read-commands review'
status: in_progress
deps: []
links: []
created_iso: '2026-07-30T05:19:44Z'
status_updated_iso: '2026-07-30T19:32:16Z'
type: task
priority: 3
assignee: CC_WITH-nickolaykondratyev
tags: [ts-port]
pwd: /home/nickolaykondratyev/git_repos/note-ticket
---
## Notes

**2026-07-30T05:20:18Z**

Self-contained NIT cleanups the T3 review (nid_zesi8c4t7lyw6jgmqqsjqd54k_e) deliberately deferred rather
than iterate on. T3 itself is DONE: ls/list/ready/blocked/closed/query are all TS-served, full suite green.

Nothing here is a correctness defect. Do them opportunistically while touching these files in a later port step.

1. features/steps/ — the missing-jq BDD scenario builds a symlink farm (a PATH directory of links to every
   binary except jq) under the SYSTEM temp dir, but those links must be EXECUTED. scripts/parity/harness.py
   deliberately uses $REPO/.tmp instead, because /dev/shm is mounted noexec on the dev box. Move the farm to
   $REPO/.tmp for the same reason before it bites someone.

2. src/cli/commands/closed.ts — renderTickets' third `limit` param is defaulted, and its only production
   caller already computed that value. Drop the default so the param is required, or drop the param.

3. src/cli/main.ts — `process.exitCode = Cli.run(...)` takes precedence over the EPIPE handler ONLY because
   Cli.run is fully synchronous. That is load-bearing and invisible; add a WHY comment so a later async
   refactor does not silently break broken-pipe exit codes.

Reference: .ai_out/ts-port-3-read-commands/nid_zesi8c4t7lyw6jgmqqsjqd54k_e_2026-07-29T18-22-47PDT/IMPLEMENTATION_REVIEW_PHASE_B_ROUND2__PUBLIC.md (NITs section).
