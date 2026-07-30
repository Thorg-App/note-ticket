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
6. [done] Phase B: IMPLEMENTATION_ITERATION round 1 — all 11 findings incorporated (commits 6b9b020, 354645a).
7. [done] Phase B: REVIEWER round-2 gate — 11/11 VERIFIED-FIXED, 0 regressed, READY, acceptance met.
   Warranted because round 1 added new code (`broken-pipe.ts`, `lstatSync`) and a 7th divergence.
8. [done] DOC_FIXER for finding R1 (commit b6f4a6b). It went beyond conditioning and REMOVED the CHANGELOG
   bullet, flagging the deviation: "instead of 1" was false — old bash `query <filter>` runs under
   `set -o pipefail` and returns jq's own code (0 or 141, never 1); the `1` was an intermediate TS regression
   inside this same unreleased cycle. Orchestrator ACCEPTED: a CHANGELOG must not document a never-shipped
   regression as a user-facing fix. `git show b6f4a6b` restores it.
9. [done] Orchestrator re-verified at HEAD: `make test` rc 0 (208 scenarios), `make parity` rc 0 (69 + 7 pins).
10. [done] change_log entry `cxk8fn8aune3o55xalost4tp3`; ticket CLOSED with resolution note.

## Follow-ups filed
- `nid_7opxnvhia4a2ty7o0k9t6z4bl_e` — deferred NITs (symlink farm under noexec temp, defaulted `limit` param,
  missing WHY comment on the sync-dependent exit-code assignment).
- `nid_z10hpj927zqilxcpl9ycpe0ad_e` — CRLF files fail with a misleading no-`id` error. Tagged `decide`:
  root cause is `src/core/frontmatter.ts` and a fix risks the byte-exact round-trip guarantee.
- `nid_94f11043dhpk198dj9e6gr6pn_e` — `make parity` not in CI, raised to P1: the scan cap, `--limit` ordering
  and `full_path` position were measured to be INVISIBLE to `make test`.

## Process note for the next port step
The two-phase split held: neither implementation phase compacted, and the round-2 gate caught a real docs
defect that the round-1 self-report had not. Worth repeating for T4/T5. The reviewer twice corrected its own
measurements (a `tail -6` truncation, a `BigInt(float)` throw) — reading full parity summaries matters.

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
