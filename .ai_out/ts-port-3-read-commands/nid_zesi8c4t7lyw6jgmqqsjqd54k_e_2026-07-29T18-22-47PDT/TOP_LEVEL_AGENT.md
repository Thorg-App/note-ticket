# TOP_LEVEL_AGENT — TS port 3: read commands

Ticket: `nid_zesi8c4t7lyw6jgmqqsjqd54k_e` — TS port 3: read commands (ls, ready, blocked, closed, query)
Branch: `nid_zesi8c4t7lyw6jgmqqsjqd54k_e_2026-07-29T18-22-47PDT`

## Why split into two implementation phases
Five commands in one agent risks compaction. Split so each phase + its review fits one context:

- **Phase A** — `ls`, `ready`, `blocked` (shared option parsing, row formatting, dep-graph consumption)
- **Phase B** — `closed`, `query` (mtime scan + limit; JSONL serializer + external `jq` passthrough),
  reusing Phase A's abstractions.

## Plan
1. [in progress] Phase A: IMPLEMENTATION_WITH_SELF_PLAN
2. [ ] Phase A: IMPLEMENTATION_REVIEWER → iteration until convergence (max 4)
3. [ ] commit
4. [ ] Phase B: IMPLEMENTATION_WITH_SELF_PLAN
5. [ ] Phase B: IMPLEMENTATION_REVIEWER → iteration until convergence (max 4)
6. [ ] commit
7. [ ] change_log entry (single entry for the whole flow), close ticket

## Log
- Marked ticket `in_progress`.
- Prior branch dir `..._18-20-21PDT` exists but is empty — no prior work to rehydrate.
- Spawned Phase A implementation agent.
