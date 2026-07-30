# IMPLEMENTATION_REVIEW_PHASE_C__PUBLIC.md — review of T5 phase C

Reviewed: uncommitted work on top of 10a1450 (`add-note`, `edit`, shim reduction), including the
parts inherited from the crashed first phase-C instance. Everything below was measured, not read.

## Summary

`add-note` and `edit` are ported, `TS_COMMANDS` now names every arm of bash's dispatch `case`, the
`cmd_*` bodies are deliberately retained as the parity oracle, and `check_write.py` grew from 109 to
136 cases with a new symlink marker in the tree dump. **Verdict: READY. 0 BLOCKING, 2 SHOULD-FIX,
4 NIT.** Both SHOULD-FIX items are test/doc-accuracy gaps, not behavior defects — I verified the
behavior itself against bash empirically, including under a real pty.

## Verified gates (independently rerun; rc read directly, nothing piped through `head`/`tail`)

| Gate | rc | Numbers | Matches PUBLIC §7? |
|---|---|---|---|
| `make typecheck` | 0 | — | yes |
| `make unit-test` | 0 | tests 402 / pass 402 / fail 0 | yes |
| `make test` (behave) | 0 | 247 scenarios, 0 failed; 1651 steps, 0 failed | yes |
| `make parity` | 0 | graph 71 / query OK / slug 13 / **write 136**, 0 failures | yes |

## Independent verification of the phase's claims

**Headline symlink fix — CONFIRMED, empirically.** With `_tickets/link.md -> ../outside.md`, both
the pinned bash reference and TS append through the link: `lstat` still reports a symlink on both
sides, the target holds the note, and a second note reuses the one `## Notes` heading. The contrast
case (`close`) replaces the link on both sides, which is bash's own `sed > tmp && mv`. The deleted
`withBodyAppended` / `withTextAppended` have **no** remaining callers in live sources (the only hits
are `.ai_out/` prose and the implementer's stale `.tmp/` repo copies). The only two deleted tests
were tests OF that dead method; no behavior-capturing test or scenario was removed anywhere
(`git diff 10a1450 -- features/ test/ | grep '^-[^-]'` returns exactly those two).

**Shim totality — CONFIRMED by my own enumeration.** bash's dispatch `case` (`ticket:1638-1662`) has
21 names: `create start close reopen status dep undep link unlink ls list ready blocked closed show
edit add-note query help --help -h`. `TS_COMMANDS` (`ticket:1614`) holds exactly those 21; the set
difference is empty in both directions. `_ts_serves`'s `-n "$2"` guard (`ticket:46-48`) is untouched;
`harness.py` is unchanged and still finds one assignment for each list (proved by parity running
green). Rollback still works: a copy with `TS_COMMANDS="help --help -h"` served `add-note` from bash
and printed `Note added to t-1`, rc 0. Unknown-command ordering is unchanged:
`TICKETS_DIR=<missing> ./ticket bogus` reports the missing directory, rc 1, with no `Unknown command`.
Parity really does compare TS against *bash* — my own harness reused `BashReference` and it produced
genuine divergences rather than uniform agreement, which is the positive control.

**Divergence hunt — no UNDECLARED divergence found.** I ran a 29-case differential of my own against
the pinned bash copy covering every shape in the brief: `## Notes` absent / present / mid-body /
indented / inside the frontmatter block; notes containing `\n`, backslashes, `%`, single and double
quotes, unicode, leading and trailing whitespace, `-n`-looking text; multi-word joining; stdin with
trailing newlines, without one, multiline, empty, and with control bytes; args-beat-stdin; a file
with no trailing newline; a prologue before the opening marker; an unterminated block; a symlinked
ticket; a nested ticket; partial / exact / whitespace-padded / empty ids; `edit` with relative and
absolute paths and with `$EDITOR` unset, multi-word and missing. **2 of 29 differ, and both are the
pre-approved divergence #9** (`add-note ""` / `edit ""`: bash resolves an empty id to an arbitrary
ticket, TS reports `ticket '' not found`).

**Divergence #19 and the editor arm — CONFIRMED under a real pty** (both streams a tty, so bash's
`[ -t 0 ] && [ -t 1 ]` is true):

| scenario | bash rc | TS rc | file edited |
|---|---|---|---|
| editor exits 0 | 0 | 0 | both |
| editor exits 7 | 7 | 7 | both |
| editor not on PATH | 127 | 127 | neither |
| `$EDITOR` unset → `vi` (absent here) | 127 | 127 | neither |
| `EDITOR="<script> --flag"` (unsplit) | 127 | 127 | neither |

Exit-code adoption, 127, the `vi` default and the unsplit `$EDITOR` are all real. Only the stderr
wording differs, which is exactly what #19 declares.

**Consolidation into `SpawnedChild` did not regress `jq`/`$PAGER`.** Mutating it to read
`result.error` before the outcome — the regression the WHY comment warns about — turns
`make parity` red (rc 2). The guard is still gated.

## My own mutation results (16 mutations, applied to source, tree restored after each)

Killed by the unit gate: the `/^## Notes/m` line-anchor, heading-always-added, heading-never-added,
strip-one-newline-only, `join("")`, read-a-terminal, the exact `\n**<iso>**\n\n<note>\n` layout,
`appendTo`→rewrite (9 failures), stdout-only-TTY, stdin-only-TTY, `||`→`??` for an empty `$EDITOR`,
ENOENT-no-longer-127, note-before-id-resolution, and heading-from-`body()`-instead-of-`text()`.
**14 of 16.** Phase C's 15-row table is not inflated for the arms it names.

Two survivors, both in the same untested seam — see SHOULD-FIX #1.

## 🚨 CRITICAL Issues

None.

## ⚠️ IMPORTANT Issues (SHOULD-FIX)

### 1. `edit`'s editor-launch seam is untested, and three documents overstate its coverage
`src/cli/commands/edit.ts:69-71`, `test/edit-command.test.ts:114-116`.

Two mutations survive **all three** gates (unit rc 0, parity rc 0, behave rc 0):

- **M-K** — split `$EDITOR` at the spawn site:
  `spawnSync(editor.split(" ")[0], [...editor.split(" ").slice(1), path], …)`.
  Failure scenario: `EDITOR="code -w" tk edit abc` in a terminal starts launching `code` with
  `-w <path>`, where bash exited 127. That is precisely the behavior change the WHY-NOT comment on
  `Editor.configured` says must not happen, and nothing would catch it.
- **M-Q** — hand the editor a hardcoded wrong path (`spawnSync(editor, ["/nope/wrong.md"], …)`).
  Failure scenario: `tk edit abc` opens the wrong file. Nothing catches it.

Cause: `EditCommand.launch` is `private static` with a hard-wired `spawnSync`, and the test
stand-ins are `/bin/true` / `/bin/false`, which ignore their arguments. `test/edit-command.test.ts`
pins only that `Editor.configured({EDITOR:"code -w"})` **returns** `"code -w"` — never that the
string reaches the child as argv[0] with the ticket path as its sole argument.

Fix: make the spawn injectable (`EditCommand.run(store, args, environment, spawn = spawnSync)`, or a
one-method `EditorLauncher` on `CommandEnvironment`) and assert the recorded argv deep-equals
`[editor, ticket.path]` for both a bare and a multi-word `$EDITOR`. A cheaper alternative: point
`$EDITOR` at a recorder script that writes `"$0" "$@"` to a file and assert the file's contents.

Then correct the claim in all three places that currently says this arm is pinned:
`scripts/parity/README.md` divergence #19 ("also the only pin for … `${EDITOR:-vi}` being used
UNSPLIT"), the comment in `features/ticket_edit.feature`, and `IMPLEMENTATION_PHASE_C__PUBLIC.md`
§4 / row **M6** of §6. This repo's CLAUDE.md is explicit that a test must not be made to look
stronger than it is; M6 mutated `Editor.configured`, which is not where the risk lives.

### 2. `CHANGELOG.md`'s TypeScript-port entry is now factually wrong
`CHANGELOG.md`, `## [Unreleased] → ### Changed`. It still reads "`help`, `ls`/`list`, `ready`,
`blocked`, `closed`, `query` and `show` are delegated so far, plus the `tree` and `cycle`
subcommands of `dep` … (`dep <id> <dep-id>` stays bash)". Every command is now delegated. Phase C
deliberately left the changelog to TOP; flagging so TOP **rewrites that bullet** rather than
appending a new one beside a contradicting sentence. Also worth one user-facing line for divergence
#19 (the `$EDITOR`-not-found wording), matching the precedent already there for the pager and `jq`.

## 💡 Suggestions (NIT)

3. **`edit` reaches for the ambient `process.env`** (`src/cli/commands/edit.ts:52`) while its clock
   and terminal are injected through `CommandEnvironment`. That is why the test needs the
   `withEditor` helper to mutate and restore `process.env`. Threading env through the environment
   object would be consistent and would fall out naturally of the fix for #1.
4. **Divergence #19's bash wording is environment-dependent.** Measured here, bash printed *nothing*
   on stderr for a bare missing `$EDITOR` (the shell installs a `command_not_found_handle`); the
   `./ticket: line NNN: …` message appeared only when `$EDITOR` contained a slash or a space. rc was
   127 in every case. Consider "the shell's own message, or none at all depending on the shell's
   `command_not_found_handle`" so the entry cannot be falsified on someone else's box.
5. **An unwritable ticket file produces a raw node stack trace** (`Error: EACCES … at
   Object.writeFileSync`) instead of a `CliError`. I confirmed the pre-existing `close`/`save` path
   behaves identically, so this is **not** a phase-C regression — but `chmod 444` on a ticket is a
   plausible real state and the whole class deserves a follow-up ticket, not a change here.
6. Three command tests now monkey-patch `process.stdout.write`. Phase C already flagged this; agreed
   that a shared capture helper is worth it at a fourth, not before.

## Documentation Updates Needed

- `scripts/parity/README.md` #19, `features/ticket_edit.feature` comment, and the phase's own
  §4/§6 — remove or qualify the "only pin for `${EDITOR:-vi}` being used UNSPLIT" claim (SHOULD-FIX
  #1), or land the test that makes it true.
- `CHANGELOG.md` — SHOULD-FIX #2 (TOP).
- Otherwise the docs check out. `CLAUDE.md`, `README.md`, `docs-internal/migration-to-ts-high-level.md`,
  `scripts/parity/README.md` and the `ticket` header comment tell the shim/parity-oracle story the
  **same** way — total dispatch, bodies kept unreachable because emptying the lists is how the
  differential oracle works, deletion at T6 with `scripts/parity/`. No contradiction found. The new
  README paragraphs for `add-note`/`edit` match measured behavior, including the unsplit `$EDITOR`
  and the symlink guarantee.

## Design and standards

`src/core/` retains **zero** CLI knowledge: `TicketStore.appendTo(ticket, text)` takes no argv, does
no formatting, writes nothing to a console. The `SpawnedChild` consolidation is a genuine DRY win —
three call sites had the same "adopt the child's code, 127 when the binary is missing" rule and it is
now stated once, with the outcome-before-error ordering (the subtle part) documented and still gated
by parity. `Terminal` injection is honest and necessary: no BDD or parity runner has a tty, so a unit
test is the only place that arm can be reached. `NoteText` / `TicketNote` / `AddNoteCommand` is a
clean three-way split (source of text / pure layout / wiring). No `any`, no new runtime deps
(`package.json` untouched), no vitest, named constants throughout, WHY and WHY-NOT comments that I
checked against measured behavior and found accurate.

## Ticket acceptance criteria (nid_2ziai8ka9l0yak2lxnwlu9lk2_e)

1. **"Every remaining command served by TS" — MET.** Verified arm by arm: all 21 names in bash's
   dispatch `case` are in `TS_COMMANDS`; nothing silently still runs bash.
2. **"bash `./ticket` reduced to a pure delegating shim" — MET in behavior, with a deliberate and
   well-argued exception.** Dispatch is total; the only bash a user reaches is the dispatch and the
   `Unknown command` fallback. The `cmd_*` bodies remain in the file, unreachable, because
   `make parity` builds its reference by emptying the delegation lists in a copy of this exact file
   — deleting them would silently turn every check into TS vs TS. I independently confirmed that is
   how the harness works and that the one-line rollback depends on it. T6 is the sanctioned deletion
   point in both the exploration doc and the migration doc. I judge this the right call; a human
   should nonetheless be aware that "pure shim" here means *behaviorally* pure, not that the file
   shrank.
3. **"Full BDD suite green" — MET.** 247 scenarios / 1651 steps, 0 failed, rerun by me.

## Verdict

**READY.** 0 blocking issues. SHOULD-FIX #1 (make the editor-spawn seam testable and correct the
three overstated coverage claims) and #2 (CHANGELOG) should land before or with the commit; neither
changes shipped behavior.
