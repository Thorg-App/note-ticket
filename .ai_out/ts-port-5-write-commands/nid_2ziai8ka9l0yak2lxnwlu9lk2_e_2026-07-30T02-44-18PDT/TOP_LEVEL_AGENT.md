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
- [x] PHASE_B iteration DONE: S1 incorporated (#16 now has a positive BDD pin; audit showed
      #13/#14/#15/#17/#18 already pinned, but #17's mixed-list COUNT was not → pinned).
      S2a: both behaviours KEPT with the WHY written down in dep.ts, link.ts, parity README,
      migration doc and README — `deps` self-edges are a graph error `dep cycle` reports,
      `links` self-entries are inert. Rejected extending the refusal to `dep` (a second brand-new
      error string on a byte-exact command). S2b: appended option analysis to `decide` ticket
      **nid_r3mp6uylht7t77iwxtuqvhxv2_e** (retitled, acceptance widened).
      All 4 NITs fixed (N1 via new `Ticket.arrayField` shared by deps/links/tags +
      TicketRelation.idsOf). S3 rejected on scope; verbatim CHANGELOG correction left for TOP.
      Both new scenarios mutation-verified (each was the ONLY failure under its mutation).
- [x] PHASE_B gates re-verified BY TOP: typecheck/test/parity rc=0; 239 scenarios 0 failed;
      parity graph 71 | query | slug 13 | write 109.
- [x] PHASE_B COMMITTED → 10a1450
- [x] PHASE_C impl spawned (add-note, edit, + shim reduction)
      ⚠ Flagged the central tension to Phase C: reducing the shim DESTROYS the differential
      oracle — the pinned-bash reference is how every parity check works, and harness.py needs
      both delegation assignments. Recommended keeping the oracle intact (total dispatch;
      unreachable bash bodies documented as the parity reference, deleted at T6), with any
      other choice requiring a written justification + a still-meaningful `make parity`.
      Also warned: an inverted parity case cannot pin the TS side; continue divergences from #19;
      TTY paths need unit pins; EXPLORATION is a guide, not gospel (§3.4 was wrong).
- [!] PHASE_C impl instance #1 KILLED by a session restart. It left substantial UNCOMMITTED work
      (new src/cli/commands/add-note.ts, edit.ts, src/cli/spawned-child.ts, terminal.ts,
      test/add-note-command.test.ts, test/edit-command.test.ts; modified ticket,
      scripts/parity/check_write.py, main.ts, command-environment.ts, jq.ts, pager.ts,
      core/frontmatter.ts, core/ticket.ts, test/frontmatter.test.ts, test/ticket.test.ts,
      features/ticket_notes.feature, features/ticket_edit.feature, features/steps/ticket_steps.py)
      but wrote NEITHER PRIVATE nor PUBLIC — so none of its reasoning survived and NO gate was
      ever confirmed green on it. The diff is the only evidence.
- [x] PHASE_C impl RESTARTED as a fresh instance (protocol: restart, do not resume), told to audit
      the orphaned diff as an unverified third-party draft — keep what is sound, fix what is not —
      and to scrutinise its edits to shared committed files (core/frontmatter.ts, core/ticket.ts,
      jq.ts, pager.ts) for regressions.
- [x] PHASE_C impl DONE (uncommitted): add-note + edit ported; `TS_COMMANDS` now names EVERY arm
      of bash's `case`, so ./ticket is a total delegating shim.
      ★ Caught a real defect in the inherited draft: it made `add-note` rewrite via
      `TicketStore.save` (write-temp-then-rename), but bash appends with `>>` — a rename REPLACES
      a symlinked ticket with a regular file, and symlinked tickets are a supported shape.
      Replaced with `TicketStore.appendTo` (appendFileSync) + pure `TicketNote.appendedTo`;
      deleted the draft's `withTextAppended` edits to shared core; taught the parity tree dump to
      record symlink-ness so the behavior has a differential pin.
      SHIM DECISION (as recommended): parity oracle KEPT — unreachable `cmd_*` bodies stay until
      T6, because emptying the delegation lists is how the harness builds its reference and
      deleting the bodies would make every check TS-vs-TS. harness.py needed no change;
      `-n "$2"` guard and unknown-command ordering untouched; rollback proven by mutation M12.
      Divergence #19 (missing-$EDITOR wording, exit 127 preserved), unit-pinned since no harness
      or BDD runner has a TTY. New `SpawnedChild` consolidates the jq/pager/editor exit policy;
      `Terminal` injected via CommandEnvironment.
      Gates claimed unmasked: typecheck 0, unit 402/402, behave 247 scenarios/1651 steps 0 failed,
      parity graph 71 | query OK | slug 13 | write 136. 15-row mutation table.
- [x] PHASE_C review spawned (also asked to judge the ticket's 3 acceptance criteria, and to
      scrutinise the NEVER-reviewed inherited draft + its edits to shared committed modules)
- [x] PHASE_C review DONE: **READY, 0 BLOCKING**, 2 SHOULD-FIX + 4 NIT.
      **All three ticket acceptance criteria MET** (retained unreachable `cmd_*` bodies are a
      justified, consistently documented parity-oracle exception to "pure shim", deleted at T6).
      Reviewer reran all 4 gates (every number matched), ran a 29-case bash-vs-TS differential
      (only the 2 pre-approved divergence-#9 empty-id cases differ), verified the symlink claim
      under `lstat` on both sides, drove the editor arm under a REAL PTY (rc 0/7/127 identical,
      `vi` default, `$EDITOR` unsplit — only wording differs = #19), and enumerated all 21 bash
      `case` arms against TS_COMMANDS by hand. Own 16 mutations: 14 killed.
      SF#1: the 2 survivors are ONE untested seam (edit.ts:69-71) — splitting `$EDITOR` on
      whitespace, and handing the editor the WRONG path — each survives unit + parity + behave.
      So parity README #19, the ticket_edit.feature comment and the M6 mutation row OVERSTATE
      coverage. SF#2: CHANGELOG TS-port bullet is factually wrong, must be REWRITTEN (TOP's job).
- [x] PHASE_C iteration spawned (SF#1 + nits; SF#2 explicitly reserved for TOP)

## ⚠ TOP's remaining obligations before closing
1. Rewrite (NOT append to) the factually-wrong CHANGELOG TS-port bullet + add the single flow
   entry. Phase B and Phase C PUBLIC.md each carry verbatim replacement text — use both.
2. Close ticket nid_2ziai8ka9l0yak2lxnwlu9lk2_e with a resolution.
3. Leave `decide` ticket nid_r3mp6uylht7t77iwxtuqvhxv2_e open for the human
   (`link a a` refused vs `dep a a` recorded; divergences #6/#10/#11/#12 + #17).

## ⚠ TOP's own outstanding obligation
CHANGELOG.md currently claims `dep <id> <dep-id>` stays bash. MUST be corrected in the final
single CHANGELOG entry for this flow. Phase B's PUBLIC.md will carry the verbatim correction.
