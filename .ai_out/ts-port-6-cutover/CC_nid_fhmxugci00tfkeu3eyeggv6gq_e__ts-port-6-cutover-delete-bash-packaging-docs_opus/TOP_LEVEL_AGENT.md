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

- [ ] PHASE_A
- [ ] REVIEW_A / ITERATION_A
- [ ] PHASE_B
- [ ] REVIEW_B / ITERATION_B
- [ ] change_log + ticket close
