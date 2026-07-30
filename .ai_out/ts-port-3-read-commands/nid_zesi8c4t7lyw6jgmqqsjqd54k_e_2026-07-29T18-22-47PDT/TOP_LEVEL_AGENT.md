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
3. [in progress] Phase A: IMPLEMENTATION_ITERATION (round 1 of max 4)
4. [ ] Phase B: IMPLEMENTATION_WITH_SELF_PLAN
5. [ ] Phase B: IMPLEMENTATION_REVIEWER → iteration until convergence (max 4)
6. [ ] commit
7. [ ] change_log entry (single entry for the whole flow), close ticket

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
