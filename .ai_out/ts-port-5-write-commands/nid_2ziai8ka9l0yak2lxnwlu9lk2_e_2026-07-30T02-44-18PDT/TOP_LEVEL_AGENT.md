# TOP_LEVEL_AGENT log — TS port 5: write commands

Ticket: nid_2ziai8ka9l0yak2lxnwlu9lk2_e
Branch: nid_2ziai8ka9l0yak2lxnwlu9lk2_e_2026-07-30T02-44-18PDT
Feature dir: .ai_out/ts-port-5-write-commands/nid_2ziai8ka9l0yak2lxnwlu9lk2_e_2026-07-30T02-44-18PDT/

## Plan (split to avoid compaction)

0. EXPLORATION → EXPLORATION_PUBLIC.md  (shared context for all impl phases)
1. PHASE_A impl: `create` + `status`/`start`/`close`/`reopen` (+ empty-id write-path BDD)
   → PHASE_A review → iteration → commit
2. PHASE_B impl: `dep` (finish dispatch, whole name into TS_COMMANDS) + `undep` + `link`/`unlink`
   → PHASE_B review → iteration → commit
3. PHASE_C impl: `add-note` + `edit` + reduce bash `ticket` to a pure delegating shim
   → PHASE_C review → final iteration → commit
4. TOP_LEVEL_AGENT: single CHANGELOG/change_log entry, docs check, close ticket.

Constraint from ticket_instruction: commit on current branch only; do NOT switch/merge.
Code-modifying agents run SERIALLY.

## Key context from exploration (drives orchestration)

- Parity harness does NOT exercise write commands at all — so BDD scenarios carry the
  pins for this whole ticket. `check_slug.py` is the one write-adjacent check and may
  need re-pointing at the real `create` once it is TS-served (Phase A decides).
- `scripts/parity/harness.py:34` requires the `TS_DEP_SUBCOMMANDS=` assignment in `ticket`
  to still EXIST (exactly one match). Phase C must not delete it without updating harness.py.
- Bash has real bugs the port should fix + declare as divergences: bare `deps: ` line when
  a ticket has no `deps` field; substring (not element) membership/removal in deps/links;
  awk-hash-order link appends; `^links:` matched in the body.

## Status

- [x] EXPLORATION → EXPLORATION_PUBLIC.md (agent was read-only; TOP persisted it) — commit 85b30a0
- [x] PHASE_A impl DONE (uncommitted): create/status/start/close/reopen in TS_COMMANDS.
      Shared plumbing added for B/C: Clock/SystemClock/FixedClock, Git (repo root + user.name),
      exported TicketField, ProgramName, CommandEnvironment,
      StoreResolver.forWriteCommand()/forCreateCommand().
      Claims: typecheck+323 unit+226 BDD+parity green; 13 mutations caught; divergence #10 declared
      (flag with no value ⇒ `Error: option '--design' requires a value`).
- [x] PHASE_A review DONE: **NOT-READY, 0 BLOCKING, 7 SHOULD-FIX**. Port verified byte-identical
      on 61/63 probed shapes (only declared divergences #5/#9/#10 differ); all 4 gates genuinely green.
      Failures are TEST PINNING: 5 mutations on new code escape both npm test and behave
      (--parent full-id normalisation [existing scenario vacuous: passes an exact id],
      git-config default assignee, `Updated <full id>` vs typed partial, hardcoded program name
      [BDD structurally blind], missing trailing newline). Plus 2 undeclared divergences
      (newline in title changes filename; directory shaped like the slug), an inaccurate
      `.trim()` WHY comment in src/core/git.ts, stale CHANGELOG (= TOP's job).
      ⚠ Reviewer caveat: piping behave through `| tail` MASKS its exit code — Phase A's
      "13/13 mutations caught" table is untrustworthy. Applies to ALL later phases.
      ★ Reviewer BUILT the write-command differential harness the project lacks (diffs stdout/
      stderr/rc + every byte under _tickets/, ids+timestamps neutralised). Phases B/C need it.
- [x] PHASE_A iteration DONE: 6 findings incorporated, 1 rejected on scope (CHANGELOG = TOP's job).
      6/6 mutations caught with unmasked rc. I5 treated as a BUG not a doc fix (Git.output now
      strips trailing newlines only, as `$( )` does). Divergences #11/#12 declared.
      ★ Write-parity harness PROMOTED: `scripts/parity/check_write.py`, a 4th `make parity` row
      (63 cases, transcript + every byte under _tickets/, `diverges=True` inverts the expectation
      for declared divergences). Mutation-proven non-vacuous 8/8. Phases B/C extend it with one
      `Case(...)` per command.
- [x] PHASE_A gates re-verified BY TOP independently: typecheck/unit/test/parity all rc=0;
      229 BDD scenarios 0 failed; parity graph 71 | query | slug 13 | write 63.
- [x] PHASE_A COMMITTED → 6a5a349
- [x] PHASE_B impl spawned (dep write form + finish dep dispatch, undep, link, unlink)
      Warned: TS_DEP_SUBCOMMANDS= assignment must survive (harness.py), `_ts_serves` -n guard,
      add_link_to_file is dead code, never pipe test cmds through tail (masks rc),
      continue divergence numbering from #13.
- [x] PHASE_B impl DONE (uncommitted): dep write form + `dep` flipped WHOLE into TS_COMMANDS
      (TS_DEP_SUBCOMMANDS= assignment kept, with a comment on the harness coupling), undep,
      link, unlink. New core class `src/core/ticket-relations.ts` owns add/remove/membership
      for both id arrays (Phase C can reuse).
      ⚠ EXPLORATION_PUBLIC.md §3.4 was WRONG: dep/undep on a ticket with no `deps:` field does
      NOT write a bare `deps: ` line — bash exits 1 printing nothing (failing `yaml_field`
      pipeline under `set -euo pipefail`). Phase B found this by probing pinned bash.
      Divergences #13–#18 declared; #17 (`tk link a a` now refused) flagged for the human.
      check_write.py 63 → 109 cases. Claims 18/18 mutations caught, unmasked rc;
      typecheck 0, unit 365/365, behave 237 scenarios 0 failed, parity write 109/0.
      Honest caveat reported: an inverted (diverges=True) parity case can NEVER pin the TS side
      of a divergence → each divergence also needs a positive unit/BDD pin. Review must check this.
- [x] PHASE_B review DONE: **READY, 0 BLOCKING**, 3 SHOULD-FIX + 4 NITs.
      Reviewer independently reproduced all 4 gates, probed 51 hostile pinned-bash shapes,
      ran 21 own mutations (20 killed; 1 survivor verified a semantically equivalent mutant).
      CONFIRMED Phase B's contested finding: EXPLORATION §3.4 is WRONG about the bare `deps: `
      line. No undeclared divergences. Shim intact (`-n "$2"` guard proven by running the
      emptied-list copy with a bare `dep`).
      SHOULD-FIX: (S1) divergence #16 has NO positive TS-side pin — both its parity cases are
      `diverges=True`, which cannot pin TS; (S2) divergence #17 `tk link a a` refused is
      user-visible, has no `decide` ticket, and is inconsistent with `tk dep a a` which still
      records a self-dependency; (S3) CHANGELOG still says `dep <id> <dep-id>` stays bash — TOP's job.
- [x] PHASE_B iteration spawned (S1+S2; S3 explicitly reserved for TOP)

## ⚠ TOP's own outstanding obligation
CHANGELOG.md currently claims `dep <id> <dep-id>` stays bash. MUST be corrected in the final
single CHANGELOG entry for this flow. Phase B's PUBLIC.md will carry the verbatim correction.
