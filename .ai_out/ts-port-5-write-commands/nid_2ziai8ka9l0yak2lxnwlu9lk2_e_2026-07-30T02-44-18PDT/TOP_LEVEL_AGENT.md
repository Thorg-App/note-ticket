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
- [x] PHASE_A iteration spawned (fresh role instance; asked to promote the write-parity harness
      into scripts/parity/ if clean, and to re-verify with unmasked exit codes)
