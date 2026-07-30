# IMPLEMENTATION_ITERATION — Phase B review response

Responding to `IMPLEMENTATION_REVIEW_PHASE_B__PUBLIC.md` (verdict READY, no BLOCKING).
Commit this round: **`6b9b020`** on `nid_zesi8c4t7lyw6jgmqqsjqd54k_e_2026-07-29T18-22-47PDT`.
Tree clean. `TS_COMMANDS` unchanged (`help --help -h ls list ready blocked closed query`).

## Signal

**READY** for convergence. Every finding is INCORPORATED — none rejected. Two were adapted
because measuring them showed the finding was narrower or wider than written; both adaptations
are spelled out below rather than applied silently.

## Disposition per finding

| # | Finding | Disposition | Notes |
|---|---------|-------------|-------|
| — | BLOCKING | none raised | — |
| S1 | `closed` orders a symlinked ticket by the wrong mtime | **INCORPORATED (fixed)** | Reproduced first (link 2030 → target 2020 → bash lists the link FIRST, TS second). `lstatSync`. + unit test + `check_graph._check_closed_symlink_mtime`. Bash is right here, so it is a fix, not a divergence. |
| S2 | `query <filter> \| head` exits 1 where bash exits 141 | **INCORPORATED (adapted — the finding was too NARROW)** | Fixed exactly for jq (128+signal). But the family is wider: `ls \| head -1` also diverged (bash 141, TS 0) and was undeclared. That half is **not honourable** — bash's code there is a function of output size. Fixed to 141-on-EPIPE and declared as whitelist #7 with the measured bands. Details below. |
| S3 | The empty-tickets-dir guard in `query` is pinned by nothing | **INCORPORATED** | Independently reproduced the vacuity (`if (false)` ⇒ all three suites still green). Now pinned twice: `check_query._check_empty_repo` (differential, 3 invocations) and a BDD scenario (CI-visible, since parity is not in CI). Mutation now caught by both. |
| S4 | Missing-`jq` divergence declared only in a code comment | **INCORPORATED** | Whitelist entry #6 + CHANGELOG line + **two** BDD scenarios with `jq` alone stripped off PATH. The reviewer's "no automated test" caveat is now gone: 127 no longer rests on an untested `spawnSync` detail. |
| S5 | `make parity` not in CI | **INCORPORATED as ticket update** | `nid_94f11043dhpk198dj9e6gr6pn_e` raised to **P1** with a note recording the 6-of-14 mutations invisible to `make test`. No CI change here (out of scope by instruction). |
| N1 | Nanosecond mtime unpinned | **INCORPORATED** | And my first version of the test was itself vacuous — see "the test that lied to me". |
| N2 | Default `--limit=20` never verified differentially | **INCORPORATED** | `check_graph._check_closed_default_limit`: 25 closed tickets, byte-compared, plus an assertion that the fixture really produces 20 rows so it cannot go stale. |
| N3 | Validate argv before doing I/O | **INCORPORATED** | `ClosedCommand.render` reads `options.rowLimit` before `loadRecent`. `ListOptions.rowLimit` parses on ACCESS — eager validation in `parse` would make `ls --limit=abc` fail, where bash lists happily. |
| N4 | Exit codes in five places | **INCORPORATED** | `src/cli/exit-codes.ts`; `ExitCode.BROKEN_PIPE` is `128 + os.constants.signals.SIGPIPE`, not a literal. |
| N5 | `frontmatter.ts:178` note imprecise | **INCORPORATED, with a correction to the finding** | Measured: the existing sentence was **correct** — `nocolon` really does become bash key `"nocolon":""`. The reviewer's `title:` case is a *second* shape (bash key `"title:"`), not a fix of the first. The note now lists both, with what bash emits for each. |
| N6 | `ClosedCommand.render` has no unit test | **INCORPORATED** | Two tests: mtime-ordered read against a real store, and the parse-before-I/O order (that one doubles as N3's pin). |

## S2 — what measuring changed about the finding

`tk query <filter> | head -1` is fixed to bash's 141, exactly as asked. The cause was not the
`SIGNALLED_EXIT_CODE = 1` constant alone: `spawnSync` reports **both** `signal: "SIGPIPE"`
**and** `error: EPIPE` for that death (the EPIPE being our own failed write to a process that
is already gone), and the code checked `error` first — so the branch that returned 1 was
`Jq.unusable`, i.e. `Error: jq could not be run`. Order is now status → signal → error.

Then I checked the rest of the family and found an **undeclared** divergence the review had
not seen: `tk ls | head -1` exited 0 in TS where bash exited 141. Measured, both sides, 15–40
runs each:

| tickets | ≈ output | bash `ls \| head -1` | TS (before) |
|---|---|---|---|
| 2 / 50 / 120 | ≤ 4 KB | **0** | 0 |
| 200 / 400 | 7–14 KB | **141** | 0 |
| 3000 | ~108 KB | **141** | 1 (node's *unhandled* stdout error) |

bash's exit code is therefore a property of the OUTPUT SIZE, not of the command: `awk` writes
in ~4 KB chunks and is killed the moment `head` exits, while node writes in one go and fails
only past the 64 KB pipe buffer. So this half cannot be honoured without reproducing awk's
internal chunking. `BrokenPipe` now reports 141 on EPIPE, which (a) matches bash at both ends
of the range, (b) is what every Unix tool does, and (c) replaces node's accidental unhandled
error. The 4 KB–64 KB band is whitelist **#7**, with the numbers above written down.

Rejected alternative: swallowing EPIPE into a deterministic 0. Simpler, but it matches bash
*nowhere* above 4 KB and is not the convention.

## The test that lied to me (reported because it is the interesting part)

My first N1 test set two mtimes 250 µs apart and asserted the newer file came first — and the
`mtimeNs → mtimeMs` mutation **SURVIVED** it. I had named the newer file `aaa-newer.md`, so
when millisecond truncation made the pair a tie, the byte-wise path tie-break put it first
anyway: the right answer for the wrong reason. Renaming it `zzz-newer.md` makes the tie-break
contradict the truth, and the mutation is now caught. Any recency test in this repo needs the
path order to disagree with the expected order.

## Mutation results — 9 mutations, 9 caught, 0 survivors

| Mutation | Suite | Result |
|---|---|---|
| `lstatSync` → `statSync` (symlink mtime) | parity | CAUGHT (`graph FAIL`, symlink check) |
| `lstatSync` → `statSync` | unit | CAUGHT (fail 1) |
| `.mtimeNs` → `.mtimeMs` | unit | CAUGHT (fail 1) — **survived the first version of the test**, see above |
| jq `forSignal(signal)` → `FAILURE` | parity | CAUGHT (`query <filter> \| head -1` bash=141 ts=1) |
| `BrokenPipe` handler body removed | parity | CAUGHT (`ls \| head -1` rc 0 ≠ 141) |
| `tickets.length === 0` → `if (false)` | parity | CAUGHT (empty-repo `syntax(((`: bash 0, ts 3) |
| `tickets.length === 0` → `if (false)` | BDD | CAUGHT (`exit code 3`) |
| default `--limit` 20 → 25 | parity | CAUGHT (`graph FAIL`, default-limit check) |
| `--limit` parsed after the store read | unit | CAUGHT (fail 1) |

Method: mutate the **source** and let `make parity` / `make test` rebuild the mutant, rather
than patching `dist/ticket.mjs`. Every file restored afterwards; `git diff src/` verified clean
before committing (one batch was killed by a timeout mid-mutation and left a file patched —
worth knowing).

New BDD scenarios verified non-vacuous against a bash-only copy
(`TICKET_SCRIPT=.tmp/ticket-bash-only`, `ticket_query.feature`): **12 passed / 4 failed**, and
the 4 are the three pre-existing divergence scenarios plus the new missing-`jq` one, which
fails on `Install jq` while still matching bash's rc 127 and `jq: command not found` — i.e. the
divergence really is the message alone. The other two new scenarios pass on both sides, which
is correct: they are parity locks.

## Files touched

- `src/core/ticket-store.ts` — `lstatSync` for the mtime, with the `ls -t` reasoning
- `src/core/frontmatter.ts` — divergence note now covers both measured shapes (N5)
- `src/cli/exit-codes.ts` **(new)** — `ExitCode`, incl. `forSignal` (N4)
- `src/cli/broken-pipe.ts` **(new)** — EPIPE ⇒ 141, with the size-band divergence documented
- `src/cli/jq.ts` — status → signal → error ordering; shared exit codes
- `src/cli/main.ts`, `src/cli/commands/query.ts`, `src/cli/cli-error.ts` — use `ExitCode`; install the guard
- `src/cli/list-options.ts` — `rowLimit` getter (lazy, deliberately)
- `src/cli/commands/closed.ts` — limit parsed before the store read
- `test/ticket-store.test.ts` — +2 suites (sub-millisecond mtimes, symlinked ticket)
- `test/list-commands.test.ts` — +4 tests (`ClosedCommand.render` ×2, `ExitCode` ×2)
- `features/ticket_query.feature` — +3 scenarios; `features/steps/ticket_steps.py` — jq-free PATH step + exact-exit-code step
- `scripts/parity/check_graph.py` — +3 pinned checks; `check_query.py` — +2; `harness.py` — `*_head_rc`
- `scripts/parity/README.md` (whitelist now **seven**, layout table), `CHANGELOG.md`, `README.md`, `CLAUDE.md`, `docs-internal/migration-to-ts-high-level.md`
- `_tickets/run-make-parity-in-ci-…md` — P1 + evidence note (S5)

Untouched: `ticket` (bash), `dist/` (built, gitignored). `src/core/` is still CLI-free.

**Divergence list consistency** — the same seven, in the same order, in
`scripts/parity/README.md`, `docs-internal/migration-to-ts-high-level.md` and (for the
user-facing ones) `CHANGELOG.md`: missing `id`; `-a`/`-T` without a value; `|` in a title for
`ready`/`blocked`; `closed --limit=`; control characters in `query`; missing `jq`; the
broken-pipe exit code.

## Final numbers — my own runs, after `6b9b020`

| Check | Before this round | After |
|---|---|---|
| `make typecheck` | exit 0 | **exit 0** |
| `make unit-test` | 245 tests, 0 fail | **251 tests, 42 suites, 0 fail** |
| `make test` | 205 scenarios, 1353 steps, 0 failed | **12 features, 208 scenarios, 1368 steps, 0 failed** |
| `make parity` | graph 69/0, 4 pinned checks; query 3 checks; slug 13 | **graph 69/0, 7 pinned checks OK; query OK (5 checks); slug OK 13** |

Logs in `.tmp/final_*.log`.

## Disagreements needing arbitration

None that block. Two places where I corrected the finding rather than complying with it, both
argued above and both empirically grounded:

1. **N5** — the sentence the reviewer called imprecise was accurate; the reviewer's case is an
   additional one. I documented both instead of replacing one with the other.
2. **S2** — the divergence is not jq-only, and the non-jq half is deliberately *declared*
   rather than fixed to bash's number, because bash's number is a write-buffer artifact. If you
   want TS to match bash inside the 4 KB–64 KB band as well, that is a "reproduce awk's
   chunking" request and I would push back on it.

## Not done, by instruction

No `change_log` entry, and the T3 ticket is left **open** — the orchestrator owns both.
`make parity` is still not wired into CI (ticket updated, not implemented).
