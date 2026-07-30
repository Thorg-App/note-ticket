# IMPLEMENTATION_ITERATION — convergence record

Written by TOP_LEVEL_AGENT. Ticket `nid_fhmxugci00tfkeu3eyeggv6gq_e`.

Two MAKER ↔ REVIEWER cycles, one per phase. Both converged in 2 rounds; max was 4.

## PHASE_A — cutover (commits `42ccf92`, `0ef05a5`)

| Round | Blocking | Outcome |
|-------|----------|---------|
| 1 | Divergence #7 folded only half-way | Fixed — and fixing it exposed a SECOND fictional pin (#13's scalar `deps:`) |
| 2 | none | **Converged.** Reviewer re-ran the mutation itself: dropping `ChildExit`'s signal branch turns exactly 1 of 261 scenarios red |

## PHASE_B — packaging + docs (commits `132df86`, `375ab65`)

| Round | Blocking | Outcome |
|-------|----------|---------|
| 1 | 0 blocking, 3 IMPORTANT (manifest trailing-newline bug; no packaged-layout test; `cp -a` ownership) | All fixed |
| 2 | none | **Converged.** Reviewer independently reproduced the manifest bug both directions and ran a 4th mutation the implementer had not: replacing `ln -s` with a `cp` — the exact original `bin.install "ticket"` breakage — goes RED |

ITERATION_B ran with a FRESH maker: the PHASE_B agent was at ~193k, and resuming would have
pushed it past the ~200K cap.

## Rejected feedback, with rationale

| Item | Disposition |
|------|-------------|
| Delete the unreachable `src/`-absent arm (A) | REJECTED by maker; **reviewer then withdrew its own suggestion** — deleting it makes `find /nonexistent -newer` spray its own error AND still return a silent "not stale". Arm now fails loudly. |
| Future-mtime source rebuilds forever (A) | Behavior kept by design; trap documented in a comment. |
| Install-manifest duplication (A) | Rejected as a PHASE_A code change, handed to PHASE_B which owns packaging. Became `pkg/install-manifest.txt`. |
| CHANGELOG missing the install-time build note (B) | **Maker was right, reviewer was wrong** — the text was already there. |
| Two further B suggestions | Rejected with one-line rationale; one deferred to `nid_7qxhyhxhwbxi7yh0f8j7n79et_e`. |

## The honest negative, kept as a negative

ITERATION_B could not make "remove the `touch` on the installed bundle" fail its new smoke
test. It reported that plainly instead of manufacturing a fixture whose only job is to kill
the mutant. The reviewer pressure-tested the reasoning and endorsed it: in every faithful
install ordering the bundle is already newest (AUR's `install -Dm644` does not preserve mtime;
Homebrew's `mv` does but the build is the last write; makepkg's `SOURCE_DATE_EPOCH` clamping
makes mtimes EQUAL and `-newer` is strict). The `touch` stays as belt-and-braces with a
corrected comment, and the INVARIANT it guarantees is asserted instead — that assertion is
mutation-proven.

## Convergence criteria

- [x] All essential feedback addressed or explicitly rejected with rationale
- [x] No blocking issues
- [x] All tests pass — `make test` 261/1729, 429 unit tests, `make typecheck`, `make package-smoke`
- [x] Meets the original requirements (acceptance re-verified independently by TOP_LEVEL_AGENT)
- [x] MAKER and REVIEWER both signalled readiness, in both phases

## Owner decisions taken during the flow

1. `tk <unknown-command>` reports the unknown command, not the missing tickets dir. (Divergence #20.)
2. Packages build at PACKAGE time, not on first run — the ticket's literal design is
   non-functional on a root-owned prefix.
