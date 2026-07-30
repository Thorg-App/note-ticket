# IMPLEMENTATION_REVIEWER — Phase B, round 2 (closing gate)

Verified commits `6b9b020`, `354645a` (diff `ec89845..HEAD`) on branch
`nid_zesi8c4t7lyw6jgmqqsjqd54k_e_2026-07-29T18-22-47PDT`. Read-only for sources.
`dist/ticket.mjs` and `dist-test/` were mutated 7 times and restored — verified **byte-identical
to a fresh `npm run build`**, `git status` clean.

## Verdict

**READY** for convergence. No BLOCKING. Of the 11 findings: **11 VERIFIED-FIXED, 0 NOT-FIXED,
0 REGRESSED.**

**Acceptance is genuinely met.** `TS_COMMANDS="help --help -h ls list ready blocked closed
query"` — all five T3 read commands are served by the bundle — and the full BDD suite is green
(208/208). Both adaptations the implementer flagged for arbitration are accepted: I re-measured
both and the implementer is right on both counts.

## Suites — my own runs

| Command | Claimed | I measured |
|---|---|---|
| `make typecheck` | exit 0 | **exit 0** |
| `make unit-test` | 251 tests, 0 fail | **251 tests, 42 suites, 0 fail** |
| `make test` | 208 scenarios, 1368 steps, 0 failed | **12 features, 208 scenarios, 1368 steps, 0 failed** |
| `make parity` | graph 69/0 + 7 pins; query 5 checks; slug 13 | **identical, rc 0** |

Logs `.tmp/r2_{typecheck,unit,test,parity}.log`. I read the full multi-line summaries this time,
not `tail -6`.

---

## Per-finding disposition

| # | Finding | Status | Evidence I produced |
|---|---|---|---|
| **S1** | symlinked ticket ordered by the wrong mtime | **VERIFIED-FIXED** | `lstatSync`→`statSync` mutation ⇒ unit **fail 1** AND `graph FAIL` (symlink check). No regression: my own bash-vs-TS probe over a symlinked `_tickets/` DIRECTORY (`closed` + `ls`), a plain dir, and a symlinked ticket to a target outside `_tickets/` **plus a dangling symlink** — all rc+stdout identical to bash. `isFile()` still uses `statSync`, so a broken link stays excluded exactly as `find -L -type f` excludes it. |
| **S2** | jq SIGPIPE reported as 1 | **VERIFIED-FIXED** | Order fix (status → signal → error) is correct and the `error`-first bug was real. Parity pins 141 on both sides. The wider `ls \| head` half is now declared as #7 and I re-derived it myself (below). |
| **S3** | empty-dir guard pinned by nothing | **VERIFIED-FIXED** | I deleted the condition myself (`if (false)`): `check_query._check_empty_repo` **FAILS** (bash rc 0 / ts rc 3) *and* one BDD scenario **FAILS**. No longer vacuous, and CI-visible. |
| **S4** | missing-jq declared only in a comment | **VERIFIED-FIXED** | Whitelist #6 + CHANGELOG + 2 BDD scenarios. Non-vacuous **both ways**: against a bash-only copy the scenario fails on `Install jq` (bash still rc 127 + `jq: command not found`), and mutating `COMMAND_NOT_FOUND` 127→1 in the bundle fails it. **No test-only knob in shipped code** — `grep process.env src/` yields only `TICKET_INVOKED_AS` (the production bash→node handoff) and `TicketsDirectory.resolve`'s injectable default. |
| **S5** | `make parity` not in CI | **VERIFIED-ADDRESSED** as agreed | Ticket `nid_94f11043dhpk198dj9e6gr6pn_e` at P1 with the measured 6-of-14 evidence. Still not wired in, by instruction. |
| **N1** | nanosecond mtime unpinned | **VERIFIED-FIXED** | The renamed `zzz-newer.md` fixture **does** catch `mtimeNs → mtimeMs`: exactly one unit failure, and it is the *sub-millisecond* suite. The path tie-break now contradicts the expected order, so the test can only pass for the right reason. |
| **N2** | default `--limit=20` never differential | **VERIFIED-FIXED** | 20→25 ⇒ `graph FAIL` on `_check_closed_default_limit` (plus unit). The check's own "fixture must produce 20 rows" assertion stops it going stale. |
| **N3** | validate argv before I/O | **VERIFIED-FIXED** | `ClosedCommand.render` reads `options.rowLimit` first; pinned by a unit test whose store *cannot* be enumerated, so the `--limit` error can only surface if nothing was read. Lazy `ListOptions.rowLimit` is the right call — eager parse would break `ls --limit=abc`, where bash lists happily. |
| **N4** | exit codes in five places | **VERIFIED-FIXED** | `src/cli/exit-codes.ts`; `BROKEN_PIPE` derived from `os.constants.signals`, not a literal. |
| **N5** | `parseLine` divergence note | **VERIFIED-FIXED, and the correction is accepted** | The implementer is right: the original sentence was accurate and my `title:` case is a *second* shape. Both are now documented with what bash emits for each. |
| **N6** | `ClosedCommand.render` untested | **VERIFIED-FIXED** | Two tests; the mtime fixture is deliberately neither path-ordered nor write-ordered. |

### The size-dependent contract — I re-derived it and it HOLDS

`ls | head -1` via `${PIPESTATUS[0]}`, 20 runs per cell, both sides:

```
tickets=1     bytes=31      bash={0:20}    ts={0:20}
tickets=120   bytes=3720    bash={0:20}    ts={0:20}
tickets=150   bytes=4650    bash={141:20}  ts={0:20}
tickets=400   bytes=12400   bash={141:20}  ts={0:20}
tickets=1000  bytes=31000   bash={141:20}  ts={0:20}
tickets=3000  bytes=93000   bash={141:20}  ts={141:20}
```

Deterministic in every cell (not racy). bash flips between **3720 and 4650 bytes** — awk's write
buffer, and it is 4096 exactly, sharper than the doc's "~4 KB". TS flips between **31000 and
93000** — the 64 KB pipe buffer. Both ends agree, so TS matches bash at BOTH ends rather than
only appearing to, and the band is precisely what whitelist #7 describes. Attribution to awk's
chunking is sound. `query <filter> | head -1` is the same phenomenon: rc **0 on both sides** at 3
tickets, 141 on both at 3000.

**141 on EPIPE is not masking write errors.** The handler rethrows any non-EPIPE code; probing
`ls >&-` (EBADF) gives bash 2 / TS 1 — not 141 — so the guard is not a catch-all. Mutating
`ExitCode.BROKEN_PIPE` to 0 is caught by parity, and the check's one-ticket half is what stops a
future "always 141" from passing.

---

## 🚨 BLOCKING

None.

---

## ⚠️ SHOULD-FIX (one item, documentation only — does not block convergence)

### R1 — the user-facing docs state the broken-pipe exit code unconditionally, and it is false in the common case

- `README.md`: "Piping a listing into a short reader (`tk ls | head -1`) exits 141, the usual
  code for a command killed by SIGPIPE." Measured: it exits **0** on both sides for any listing
  under ~64 KB, i.e. under roughly 2000 tickets — which is every real repo today.
- `CHANGELOG.md`: "`query <jq-filter> | head` (any short reader) now exits 141, as `ls | head`
  does, instead of 1" — also size-dependent (rc 0/0 at 3 tickets), and "as `ls | head` does" is
  only true above 64 KB.

`scripts/parity/README.md` #7 is exemplary about this; the user-facing pair is not, and CLAUDE.md
is explicit that behaviour must match naming/claims without misconception. One conditioning
clause each ("when the write actually fails, i.e. for large listings") settles it. No code change.

---

## 💡 NITs (do NOT iterate — file as follow-up at most)

- `features/steps/ticket_steps.py::_path_without` builds its symlink farm in the **system** temp
  dir, and those links have to be *executed*. `scripts/parity/harness.py` materializes its bash
  copy under `$REPO/.tmp` for exactly the noexec reason (and this repo has a known noexec
  `/dev/shm`). Passing `dir=` removes a "fails for the wrong reason" class. Works here today.
- `ClosedCommand.renderTickets(recent, options, limit = options.rowLimit)` — a defaulted third
  parameter that recomputes what the only production caller already computed, present only so
  tests can call `renderTickets` directly. Slight POLS wrinkle, not a defect.
- `main.ts`: `process.exitCode = Cli.run(...)` wins over the EPIPE handler only because `Cli.run`
  is fully synchronous (`spawnSync` does not spin the loop). True today; a WHY line would protect
  it if anything there ever goes async.
- The handoff's "the same seven, in the same order" is itself inaccurate — it swaps `dep cycle`
  for `-a`/`-T`. The three **shipped** documents are consistent (README's numbering, migration
  doc references #3–#7 with the same numbers, CHANGELOG carries all six user-facing ones), so
  this is a sentence in a handoff, not a doc defect.

---

## Guard against loss of functionality — checked

`git diff ec89845..HEAD -- features/` = **0 deleted lines**. `test/` shows one deleted line per
file, both reflowed import statements. No scenario, test, use case or `ap_*_E` anchor point was
removed anywhere in this round. `src/core/` remains CLI-free (no `console`, `process.argv`,
`process.stdout/stderr`, `process.exit`). `ticket` (bash) untouched; `TS_COMMANDS` unchanged, so
rollback is still one edit.

## Things done well

- The implementer found and disclosed that its **own first N1 test was vacuous** (`aaa-newer.md`
  let the path tie-break supply the right answer) and fixed it. That is the honest-reporting
  standard this project asks for, and I confirmed the renamed fixture really does catch the
  mutation.
- The size-band claim is the kind most reviewers would accept on faith; it reproduces exactly,
  with the boundary sitting on 4096 bytes as the awk explanation predicts.
- Rejecting "swallow EPIPE into 0" was right: it matches bash *nowhere* above 4 KB.
- `_check_broken_pipe_exit_code` pins the un-broken end too, so the guard cannot degenerate into
  an unconditional 141.
- Every new pin I tried to defeat, defeated me.

## Documentation Updates Needed

- `README.md` + `CHANGELOG.md` — condition the 141 statements (R1). That is the whole list.
