# TOP_LEVEL_AGENT — TS port 3: read commands

Ticket: `nid_zesi8c4t7lyw6jgmqqsjqd54k_e` — TS port 3: read commands (ls, ready, blocked, closed, query)
Branch: `nid_zesi8c4t7lyw6jgmqqsjqd54k_e_2026-07-29T18-22-47PDT`

## Why split into two implementation phases
Five commands in one agent risks compaction. Split so each phase + its review fits one context:

- **Phase A** — `ls`, `ready`, `blocked` (shared option parsing, row formatting, dep-graph consumption)
- **Phase B** — `closed`, `query` (mtime scan + limit; JSONL serializer + external `jq` passthrough),
  reusing Phase A's abstractions.

## Plan
1. [done] Phase A: IMPLEMENTATION_WITH_SELF_PLAN — commits 36e8704, c27e3af, 081a9e4
2. [done] Phase A: IMPLEMENTATION_REVIEWER — verdict READY, no blocking defects, several SHOULD-FIX
3. [done] Phase A: IMPLEMENTATION_ITERATION round 1 — CONVERGED, both roles READY.
   Commits f165d98, 736fd10, 3486848. One reasoned rejection accepted by orchestrator: keep `limitText`
   (Phase B's `closed` is its immediate consumer; delete-and-re-add would be churn).
4. [done] Phase B: IMPLEMENTATION_WITH_SELF_PLAN (closed, query) — commits 10e663f, 4dfe08e, ec89845.
   All five commands now TS-served.
5. [done] Phase B: IMPLEMENTATION_REVIEWER — READY, no blocking; 5 SHOULD-FIX + 6 NIT.
6. [in progress] Phase B: IMPLEMENTATION_ITERATION (round 1 of max 4)
7. [ ] change_log entry (single entry for the whole flow), close ticket

## Divergence ledger (must be identical in whitelist + CHANGELOG + a pinning test)
1. `|` in title — bash truncates on its `prio|id|status|title` sort key; TS correct.
2. `--limit=` plain count only — bash inherited `head -n`'s `+N`/`2k`/negative syntax.
3. `--limit=0` — bash exit code RACY (reviewer measured 60 runs: 35×141, 25×0); TS deterministic 0.
4. Bad `--limit=` reported even on an empty tickets dir.
5. `query` escapes control chars — fixes a real bug (bash's own `query .id` died inside jq).
(+ under iteration: `| head -1` exit 1 vs bash 141, and the missing-`jq` 127 path, both previously
declared only in a code comment.)

## Log
- Marked ticket `in_progress`.
- Prior branch dir `..._18-20-21PDT` exists but is empty — no prior work to rehydrate.
- Spawned Phase A implementation agent.
- Phase A landed; harness was found comparing TS-vs-TS for ported commands (fixed), `make parity` now
  depends on `make build`.
- Reviewer independently reproduced all suite numbers and mutation-tested the harness. READY.
- Corrected a false project memory: the "9 plugin tests fail due to /dev/shm noexec" note. Plugin system was
  stripped; no plugin tests exist; baseline is green. That note was usable as an excuse for real failures.
- Iteration round 1 dispatched: declare the `|`-in-title divergence (bash truncates, TS is correct), add
  hostile titles to the parity generator, unify the two error-rendering channels in `main.ts`, file a CRLF
  follow-up ticket.
