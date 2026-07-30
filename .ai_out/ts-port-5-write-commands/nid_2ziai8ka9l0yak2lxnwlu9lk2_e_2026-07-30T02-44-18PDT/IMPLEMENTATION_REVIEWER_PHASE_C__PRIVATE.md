# IMPLEMENTATION_REVIEWER_PHASE_C__PRIVATE.md — working memory

Reviewer for T5 phase C (`add-note`, `edit`, shim reduction). Base 10a1450, work uncommitted.

## Scratch artifacts (all under `$REPO/.tmp/`, mine)
- `rv_diff.py` — 29-case independent bash-vs-TS differential (pinned `harness.BashReference`)
- `rv_pty.py` — the `edit` editor arm driven under a REAL pty on both streams
- `rv_mut2.py` — 16 independent source mutations vs the unit gate (backup → patch → run → restore)
- `rv_mut3.py` — the unit-gate survivors re-run against unit + parity + behave
- `rv_typecheck.log`, `rv_unit.log`, `rv_behave.log`, `rv_parity.log`
NOT authored by me: `.tmp/rv_mutate.py` (leftover from the implementer), `.tmp/verify/`, `.tmp/mut2/`,
`.tmp/c3mut/` (implementer copies — they contain the OLD `withBodyAppended`, which is why a naive
grep for dangling callers looks alarming; ignore them).

## Gates (independently rerun, no `head`/`tail` in the pipeline, rc read directly)
| Gate | Command | rc | Numbers |
|---|---|---|---|
| typecheck | `make typecheck` | 0 | — |
| unit | `make unit-test` | 0 | tests 402 / pass 402 / fail 0 |
| behave | `make test` | 0 | 247 scenarios passed, 0 failed; 1651 steps passed, 0 failed |
| parity | `make parity` | 0 | graph 71 / query OK / slug 13 / **write 136**, 0 failures |

Every number in `IMPLEMENTATION_PHASE_C__PUBLIC.md` §7 reproduced exactly.

## Claim 1 — the headline symlink fix. VERIFIED.
`rv_diff.py` case `symlinked ticket` and `symlink then two notes`: fixture is `outside.md` at the
repo root with `_tickets/link.md -> ../outside.md`. Dump records `os.path.islink` + `os.readlink`.
Both sides: `_tickets/link.md [symlink -> ../outside.md]`, note text lands in the target, link
survives, second note reuses the one heading. Identical byte-for-byte after id/timestamp
neutralisation.

Independently mutation-confirmed: `M-H appendTo rewrites the file` (`readFileSync` + `this.write`)
→ unit rc=1, 9 failures. So the append-not-rewrite rule is pinned by unit tests too, not only by
the single parity case.

Deleted core methods: `grep -rn "withBodyAppended\|withTextAppended"` over live sources returns
NOTHING outside `.ai_out/` prose and the implementer's `.tmp/` copies. `src/core/frontmatter.ts`
and `src/core/ticket.ts` diffs are pure deletions; the two removed tests were tests OF the deleted
dead method, not behavior-capturing tests of a user-visible use case. No other deletions anywhere
in `features/` or `test/` (`git diff 10a1450 -- features/ test/ | grep '^-[^-]'` → only those two).

## Claim 2 — the shim. VERIFIED.
Enumerated bash's dispatch `case` (`ticket:1638-1662`) myself, 21 names:
`create start close reopen status dep undep link unlink ls list ready blocked closed show edit
add-note query help --help -h`.
`TS_COMMANDS` (`ticket:1614`) holds exactly those 21. Set difference both ways = ∅.

- `_ts_serves` `-n "$2"` guard intact at `ticket:46-48`, untouched by the diff.
- `harness.py` unchanged; `TS_DEP_SUBCOMMANDS=` assignment still present (harness `count != 1`
  SystemExit still satisfied — `make parity` ran green, which proves both `re.subn`s found one).
- parity still compares TS vs pinned BASH: `BashReference._materialize` empties both lists; my own
  `rv_diff.py` reuses it and produced REAL divergences (#9) rather than uniform agreement, which is
  the positive control that the bash side is really bash.
- Rollback: `sed 's/^TS_COMMANDS=.*/TS_COMMANDS="help --help -h"/'` on a copy → `add-note t-1 "via
  bash"` printed `Note added to t-1`, rc=0, i.e. bash served it. One-line rollback works.
- Unknown-command ordering: `TICKETS_DIR=<missing> ./ticket bogus` →
  `Error: tickets directory '…' does not exist`, rc=1, and NO `Unknown command`. Unchanged.

## Claim 3 — divergence #19 + hunt for UNDECLARED divergences.
`rv_diff.py`, 29 cases, all shapes the brief listed (existing `## Notes` / none / mid-body /
indented / inside the frontmatter block; notes with `\n`, backslashes, `%`, quotes, unicode,
leading+trailing spaces, `-n`-looking; multi-word joining; stdin with trailing newlines, without,
multiline, empty, binary-ish; args-beat-stdin; file with no trailing newline; symlink; nested;
partial/exact/padded ids; `edit` relative + absolute + `$EDITOR` unset/multiword; add-note→show and
add-note→query follow-ups).

Result: **2/29 differ, both the pre-approved divergence #9** (empty id matches nothing:
`add-note ""` and `edit ""`). No undeclared divergence found.

`rv_pty.py` (real pty on stdin AND stdout, so `[ -t 0 ] && [ -t 1 ]` is true):
| scenario | bash rc | TS rc | file edited both sides? |
|---|---|---|---|
| editor exits 0 | 0 | 0 | yes / yes |
| editor exits 7 | 7 | 7 | yes / yes |
| editor not on PATH | 127 | 127 | no / no |
| `$EDITOR` unset (vi absent here) | 127 | 127 | no / no |
| `$EDITOR="<script> --flag"` | 127 | 127 | no / no |
Only stderr WORDING differs — exactly divergence #19. Exit-code adoption, the `vi` default and the
unsplit `$EDITOR` are all real, verified against bash.

Side note on #19's text: on THIS box bash printed nothing at all for a bare missing name (the login
shell installs a `command_not_found_handle`); the `./ticket: line NNN: …` message appeared only when
`$EDITOR` contained a slash/space. rc was 127 in every case. Cosmetic inaccuracy in the whitelist
entry, not a defect.

## Claim 4 — vacuous tests. My own 16 mutations, unit gate.
Killed (rc=1): M-A `/^## Notes/m`→`/## Notes/`; M-B heading always added (3 fails); M-C never added
(8); M-D strip one newline; M-E `join("")`; M-F read a terminal; M-G one blank line fewer (9);
M-H appendTo→rewrite (9); M-I stdout-only TTY; M-J stdin-only TTY; M-L `||`→`??`; M-M ENOENT no
longer 127; M-O note obtained before id resolution; M-P heading from `body()` not `text()` (7).
That is 14/16. Phase C's table is not inflated for the arms it names.

SURVIVORS (re-run against unit + parity + behave, `rv_mut3.py`):
- **M-K** split `$EDITOR` at the SPAWN site (`spawnSync(editor.split(" ")[0], [...rest, path])`)
  → unit 0, parity 0, behave 0. All three gates green.
- **M-Q** hand the editor `"/nope/wrong.md"` instead of the ticket path → unit 0, parity 0,
  behave 0. All three gates green.
- M-N read `result.error` before the outcome → unit 0 but **parity rc=2**. Caught. So the
  jq/pager→`SpawnedChild` consolidation did NOT lose the SIGPIPE guard; it is gated, just not by a
  unit test.

Root cause of M-K/M-Q: `EditCommand.launch` (edit.ts:69-71) is `private static` and the spawn is not
injectable, so no test observes the child's argv. `test/edit-command.test.ts:114-116` pins
`Editor.configured({EDITOR:"code -w"}) === "code -w"` — the STRING, not its use. The stand-ins are
`/bin/true` and `/bin/false`, which ignore their arguments, so a wrong path is invisible too.
Tree restored after every mutation (`git diff --stat -- src/` back to the phase's own 7 files).

## Claim 5 — shared modules the crashed draft touched (unreviewed until now).
- `jq.ts`: identical behavior; the only change is delegating to `SpawnedChild`. Hint line and 127
  preserved; outcome-before-error preserved (and M-N proves parity still guards it).
- `pager.ts`: identical except the no-outcome-no-error string
  (`… could not be run: no exit status` → `… ended without an exit status`). Nothing asserts either;
  it is an unreachable-in-practice branch. Fine.
- `command-environment.ts`: `terminal` appended as the LAST optional ctor param — no existing call
  site changes meaning. Verified by typecheck + 402 green unit tests.
- `main.ts`: two new arms, both `forWriteCommand()`. Correct: bash requires an existing tickets dir
  for `edit`/`add-note` (rv_diff cases `add-note with no tickets directory`, `edit with no tickets
  directory` agree with bash).
- `src/core/`: `appendTo` takes a `Ticket` and text — no argv, no formatting, no console. Zero CLI
  knowledge retained.

## Ruled out (probed, no finding)
- `NOTES_HEADING_PRESENT` regex statefulness: non-global, `.test()` has no `lastIndex` carry-over.
- Round-trip risk of using `ticket.text()` as the grep target: covered empirically by the
  prologue / unterminated-block / no-trailing-newline cases; both sides identical.
- `printf` format-string injection from note text: bash passes the note as `%s`'s ARGUMENT, so `%`
  and backslashes are literal — matched by TS (`note with percent`, `note with backslashes`).
- Multi-word note joining and IFS: matched.
- `add-note` frontmatter untouched: `add-note then query` case identical.
- No `any`, no new runtime deps (`package.json` untouched), no vitest, named constants throughout,
  WHY/WHY-NOT comments present and accurate.
- EACCES on the ticket file → node stack trace on stderr, rc 1. Reproduced IDENTICALLY on the
  pre-existing `close`/`save` path, so pre-existing class, not a phase-C regression.
- `CHANGELOG.md` untouched by design (TOP's job) — but its existing TS-port bullet is now factually
  wrong; noted for TOP.
