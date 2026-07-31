# TOP_LEVEL_AGENT — TS port 6: cutover, delete bash, packaging + docs

Ticket: `nid_fhmxugci00tfkeu3eyeggv6gq_e`
Branch: `CC_nid_fhmxugci00tfkeu3eyeggv6gq_e__ts-port-6-cutover-delete-bash-packaging-docs_opus`

## Pre-flight (TOP_LEVEL_AGENT, done)

- Deps `T3` / `T4` / `T5` all **closed** — cutover is unblocked.
- `git status` clean at start.
- Human decision already recorded in the ticket: distribution is **build-on-demand from
  source**, superseding the plan doc's "commit dist at release time". No CLARIFICATION phase
  needed — the one key tradeoff is pre-decided and the rest of the ticket is explicit.

## Phase split (WHY: one agent doing wrapper+harness-deletion+packaging+docs would compact)

| Phase | Scope | Role |
|-------|-------|------|
| PHASE_A | Thin `ticket` wrapper, delete all bash logic, delete parity harness (folding still-relevant divergences into BDD first), BDD scenarios for build-on-demand + stale-bundle, Makefile / package.json / .gitignore / CI | IMPLEMENTATION_WITH_SELF_PLAN |
| REVIEW_A | Review PHASE_A | IMPLEMENTATION_REVIEWER |
| PHASE_B | Packaging (PKGBUILD, publish-homebrew.sh, publish-aur.sh) + all docs (README, ORIGINAL_README, CLAUDE.md, CHANGELOG, THIRD_PARTY_LICENSES, plan doc Distribution section, auto-memory) | IMPLEMENTATION_WITH_SELF_PLAN |
| REVIEW_B | Review PHASE_B | IMPLEMENTATION_REVIEWER |

TOP_LEVEL_AGENT commits between phases. One `change_log` entry at the very end.

## Status

- [x] PHASE_A — `42ccf92`. 1727 lines of bash deleted; 78-line launcher; parity harness gone.
- [x] REVIEW_A / ITERATION_A — **converged in 2 rounds** (`0ef05a5`, `2bf6e49`).
- [ ] PHASE_B — running (fresh agent; the PHASE_A implementer ended at ~239k, over the 200K cap)
- [ ] REVIEW_B / ITERATION_B
- [ ] change_log + ticket close

## Convergence record — IMPLEMENTATION_ITERATION (PHASE_A)

2 iterations, converged. Reviewer verified by MUTATION rather than by report, which was
the right call twice over:

| Round | Blocking | Outcome |
|-------|----------|---------|
| 1 | Divergence #7 folded only half-way — the `query \| head -1` half was left backed by an assertion that a constant equals 141, which cannot fail | Fixed; and correcting it exposed a SECOND wrongly-claimed pin (#13's scalar `deps:` sub-case) |
| 2 | none | Converged. Dropping `ChildExit`'s signal branch turns exactly 1 of 261 scenarios red — the new pin bites and the gap was real |

Rejected feedback, with rationale:
- **S2 (delete the unreachable `src/`-absent arm)** — REJECTED by the implementer, and the
  reviewer then **withdrew the suggestion**: deleting it makes `find /nonexistent -newer …`
  spray its own error AND still return the silent "not stale" answer. The arm now fails
  loudly instead, pinned by a scenario.
- **S1 (future-mtime source rebuilds forever)** — behavior left as-is by design, trap
  documented in a comment.
- **S5 (install-manifest duplication)** — rejected as a PHASE_A code change, handed to
  PHASE_B, which owns packaging.

Owner decision, 2026-07-30: `tk <unknown-command>` reports the unknown command rather than
bash's missing-tickets-dir ordering. Reviewer independently agreed the bash ordering was an
artifact of the `case` default arm.
