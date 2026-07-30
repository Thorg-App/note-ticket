# IMPLEMENTATION_PHASE_C__PUBLIC.md — T5 phase C: `add-note`, `edit`, shim reduction

Base commit 10a1450. Written by a RESTARTED phase-C instance; a previous instance was killed
mid-flight and left an uncommitted, unverified, undocumented draft. Section 2 accounts for it.

## 1. Scope delivered

- `add-note` and `edit` ported to TypeScript and flipped into `TS_COMMANDS`.
- `TS_COMMANDS` now names **every** command in bash's dispatch `case`, so `./ticket` is a
  delegating shim (see §3).
- `scripts/parity/check_write.py` extended from 109 to **136** cases, including symlink
  coverage the harness previously could not express.
- Divergence **#19** declared and pinned.
- Docs updated: `scripts/parity/README.md`, `docs-internal/migration-to-ts-high-level.md`,
  `CLAUDE.md`, `README.md`. **CHANGELOG.md deliberately untouched** (TOP writes one entry).

## 2. What I kept / fixed / discarded from the crashed instance's draft

**Kept, after verifying it against bash `ticket:1467-1513` myself:** the command structure
(`NoteText` = argument/stdin/TTY choice, `TicketNote` = pure note layout, thin `run`);
`src/cli/terminal.ts` (`Terminal` injected through `CommandEnvironment`, because no BDD runner
or parity runner has a TTY on either stream); `src/cli/spawned-child.ts` consolidating the
"adopt the child's exit code, 127 for a missing binary" policy for `jq` / `$PAGER` / `$EDITOR`;
the `edit` semantics (both streams must be TTYs, `$EDITOR` UNSPLIT); the shim approach; the
BDD scenarios and the 25 draft `check_write` cases.

Scrutiny of the shared files the draft touched, as asked:
- `jq.ts` / `pager.ts` → `SpawnedChild`: behavior preserved (outcome read BEFORE `result.error`
  so a SIGPIPE'd child is not misreported as "could not be run"; jq keeps its install hint and
  127). One wording change: when `spawnSync` reports neither an outcome nor an error, the pager
  now says `<binary> ended without an exit status` instead of
  `<binary> could not be run: no exit status`. Nothing asserts the old string; the two paths
  now agree, which is the point of the shared class.
- `src/core/` still has **zero CLI knowledge** — re-checked after my own edits.

**Fixed (the substantive change):** the draft made `add-note` rewrite the whole file through
`TicketStore.save` (write-temp-then-`rename`). bash appends with `printf … >> "$file"`, and a
rename **replaces a symlinked ticket file with a regular file**, detaching every other name for
that ticket — symlinked tickets are a documented, supported shape (README; `closed` uses
`lstat` for exactly this). The split is bash's own, not an accident: bash's frontmatter writer
`_sed_i` is `sed > tmp && mv`, so `status`/`dep`/`link` replace the link on BOTH sides; only the
note append differs. So `add-note` now uses a new `TicketStore.appendTo` (`appendFileSync`) and
`TicketNote.appendedTo` became pure `(fileText, note, timestamp) => string`.

**Discarded as no longer needed:** `TicketDocument.withTextAppended` / `Ticket.withTextAppended`
(the draft's rename of the committed-but-never-called `withBodyAppended`), and
`withBodyAppended` itself — grep confirms it never had a caller; it was built at T2 for exactly
this command, which no longer needs it. Their tests went with them, so `src/core/frontmatter.ts`
and `src/core/ticket.ts` are now touched by this phase only by that deletion. This also removes
the whole "does parse+serialize round trip byte-exactly for this odd file shape" risk class: an
append cannot lose bytes.

## 3. Shim-reduction decision, and its effect on `make parity`

**Decision: make the dispatch TOTAL, keep the (now unreachable) `cmd_*` bodies until T6.**

`TS_COMMANDS` lists every name in bash's dispatch `case` (verified arm by arm), so no `cmd_*`
function serves a user. The only bash a user still reaches is the dispatch itself plus the
`Unknown command` fallback.

**Why the bodies must not be deleted at T5.** `make parity` builds its bash side by copying
`./ticket` with both delegation lists emptied and diffing it against the TS bundle. Delete the
bodies and every check compares TS against TS: a harness that can no longer fail, silently.
That is the entire differential oracle for this migration, and it is the gate that has caught
regressions no other gate saw. `EXPLORATION §0` and the migration doc both name T6 as the
sanctioned deletion point. Keeping them is also what makes rollback a one-line edit —
demonstrated by mutation **M12**: removing `add-note edit` from `TS_COMMANDS` leaves the BDD
suite fully green, i.e. bash still serves both.

**Why not literally unconditional dispatch** (`_exec_ts "$@"` with no list): it breaks the
harness's emptying trick outright, and it changes unknown-command behavior, which the suite
pins — a bogus name is not in `TS_COMMANDS`, so it still goes through `init_tickets_dir` and
reports a missing tickets directory BEFORE the `Unknown command` help. That ordering is
preserved unchanged; `_ts_serves`'s `-n "$2"` guard is untouched; `harness.py` needed no change
because the `TS_DEP_SUBCOMMANDS=` assignment is still there.

There is exactly ONE description of this design, and it is stated the same way in the `ticket`
header comment, `CLAUDE.md` and `docs-internal/migration-to-ts-high-level.md`.

## 4. Divergence declared

**#19 — an `$EDITOR` that is not on PATH.** Both sides exit 127; bash printed the shell's own
`./ticket: line NNN: <editor>: command not found` (naming a line of the script), TS prints
`Error: <editor>: command not found`. Identical trade to #6 (jq), now decided in ONE place
(`SpawnedChild`). Recorded in `scripts/parity/README.md`, the migration doc and the code
comment.

**It is unreachable by the harness** (the editor launches only with a TTY on both streams), so
per the phase-B lesson it carries a POSITIVE pin, not an inverted parity case:
`test/edit-command.test.ts` asserts the message and `exitCode === 127`, and is also the only pin
for the adopted editor exit code and for `${EDITOR:-vi}` being used UNSPLIT. (**Corrected in
§10**: as written at the time, the UNSPLIT claim held only for what `Editor.configured` RETURNS;
the spawn site itself became pinned in iteration 1.) `add-note`'s
`Error: no note provided` arm is unit-pinned for the same reason. **No BDD scenario covers
either arm and none can** — `features/ticket_edit.feature` says so in a comment.

No new `decide` item: #19 is message wording, the class that needed no sign-off for #6.
`nid_r3mp6uylht7t77iwxtuqvhxv2_e` was not touched.

## 5. How `check_write.py` was extended (109 → 136 cases)

25 cases from the draft (kept): `add-note` with text / twice / no text / empty text / several
words / frontmatter untouched / nested ticket / partial+exact ids / padded id / no args /
unknown id / ambiguous id / no tickets dir / existing Notes section / `## Notesish` /
no trailing newline / prologue before the opening marker / unterminated block; `edit` path /
nested / exact id / no args / unknown id / ambiguous id / no tickets dir.

2 cases added by me, plus the harness change that makes them meaningful:
`WriteRepo._tree_dump` now records **whether each entry is still a symlink** and what it points
at (both sides dereference on read, so without the marker the difference is invisible), and
`Case(symlinks={...})` creates one. The cases are `add-note through a symlinked ticket` (both
sides append through it, link survives) and `status through a symlinked ticket` (both sides
replace it — the contrast that shows the two write mechanisms are bash's own).

## 6. Mutation evidence (all restored; real, unmasked exit codes — no gate piped through `head`/`tail`)

| # | Mutation | Gate | rc | Caught by |
|---|---|---|---|---|
| M1 | `appendTo` → `save` in the command | unit | 2 | 7 tests |
| M2 | `/^## Notes/m` → `/## Notes/m` | unit | 2 | line-start test |
| M3 | drop the trailing-newline strip | unit | 2 | 2 tests |
| M4 | read stdin even when it is a terminal | unit | 2 | "refuses to read a terminal" |
| M5 | `isStdin && isStdout` → `isStdout` | unit | 2 | "only STDOUT is a terminal" |
| M6 | split `$EDITOR` on spaces **inside `Editor.configured`** | unit | 2 | "unsplit like bash's \"$EDITOR\"" — **OVERSTATED, corrected in §10**: this pins only what `Editor.configured` RETURNS, not the spawn site |
| M7 | ENOENT no longer maps to 127 | unit | 2 | "exits 127 naming the editor" |
| M8 | `edit` never launches an editor | unit | 2 | 3 tests |
| M9 | `appendTo` reimplemented as write-then-rename | parity | 2 | **exactly one** case: the symlinked one |
| M10 | `Note added to` → `Note appended to` | behave | 1 | 4 scenarios ⇒ BDD drives TS, not bash |
| M11 | `Edit ticket file: ` → `Open ticket file: ` | behave | 1 | `ticket_edit.feature:10` ⇒ same for `edit` |
| M12 | drop `add-note edit` from `TS_COMMANDS` | behave | 0 | expected green — the bash rollback still works |
| M13 | append the Notes heading every time | behave | 1 | the 2 NEW heading-count scenarios only |
| M14 | drop the trailing-newline strip | behave | 1 | the NEW stdin scenario only |
| M15 | `join(" ")` → `join("")` | behave | 1 | the NEW word-joining scenario only |

M9 matters: for a regular file "append" and "rewrite" are byte-identical, so ONE case in the
whole harness can see that bug — which is why the symlink marker had to be added.
M13/M14/M15 show the new BDD scenarios are load-bearing; no pre-existing scenario catches them.

## 7. Gates

```
make typecheck  rc=0
make unit-test  rc=0   tests 402 / pass 402 / fail 0                      (10a1450: 365)
make test       rc=0   12 features, 247 scenarios, 1651 steps, 0 failed   (10a1450: 239)
make parity     rc=0   graph 71 / query OK / slug 13 / write 136, 0 fail  (10a1450: write 109)
```

## 8. Files changed

New: `src/cli/commands/add-note.ts`, `src/cli/commands/edit.ts`, `src/cli/spawned-child.ts`,
`src/cli/terminal.ts`, `test/add-note-command.test.ts`, `test/edit-command.test.ts`.

Modified: `ticket` (total `TS_COMMANDS` + the WHY-NOT-deleting note), `src/cli/main.ts`,
`src/cli/command-environment.ts` (`terminal`), `src/cli/jq.ts`, `src/cli/pager.ts`,
`src/core/ticket-store.ts` (`appendTo`), `src/core/frontmatter.ts` + `src/core/ticket.ts`
(dead append method removed), `test/ticket-store.test.ts`, `test/frontmatter.test.ts`,
`test/ticket.test.ts`, `features/ticket_notes.feature` (+7), `features/ticket_edit.feature`
(+1 and a comment saying why the editor arm cannot be a scenario),
`features/steps/ticket_steps.py` (+3 steps, one of which is the first runner that PIPES text
into stdin), `scripts/parity/check_write.py`, `scripts/parity/README.md`,
`docs-internal/migration-to-ts-high-level.md`, `CLAUDE.md`, `README.md` (short user-facing
paragraphs for `add-note` and `edit`, which were previously undocumented).

## 9. Deferred to T6

Delete the unreachable `cmd_*` bodies, both delegation lists, `scripts/parity/` with its make
target, npm script and CI step. Nothing else is outstanding from this phase. Minor, optional:
three command tests now monkey-patch `process.stdout.write`; a shared capture helper would be
worth it at a fourth.

---

## 10. Iteration 1 — response to `IMPLEMENTATION_REVIEW_PHASE_C__PUBLIC.md`

Verdict acted on: READY, 0 BLOCKING, 2 SHOULD-FIX, 4 NIT. No behavior was redesigned; the only
source file touched by this iteration is a TEST plus three documentation sites.

### SF#1 — editor-launch seam untested, three documents overstate it → **INCORPORATED**

The reviewer is right, and the correction matters more than the test: **row M6 of §6 mutated
`Editor.configured`, which is not where the risk lives.** `Editor.configured` only decides what
STRING is chosen; both surviving mutations live at the `spawnSync` call in
`src/cli/commands/edit.ts:69-71`, which nothing reached.

Two new tests in `test/edit-command.test.ts`, both driving the **real** `spawnSync` (they are in
the `EditCommand with a terminal on both streams` block, the arm only a unit test can reach):

1. `hands the editor the resolved ticket path as its argument` — `$EDITOR` is `/bin/touch`, the
   ticket file is backdated to a fixed past mtime, and the assertion is that the mtime moved.
   `touch` is argv-sensitive, silent on success, and fails on any other argument list, so "the
   child received exactly this path" becomes observable.
2. `looks a multi-word EDITOR up as ONE filename, as bash's quoted "$EDITOR" did` — `$EDITOR` is
   `/bin/true --flag`, a REAL binary followed by a flag, and the assertion is `CliError` with
   `exitCode === 127`. Split into argv it would succeed; unsplit the whole string is not a
   filename, which is exactly bash's behavior.

**WHY-NOT the reviewer's suggested injection** (`run(..., spawn = spawnSync)` or an
`EditorLauncher` on `CommandEnvironment`): it would move the untested seam rather than close it —
a mutation applied inside the real launcher would still survive, because the test would be
asserting against a stand-in. The two tests above pin the real spawn. **WHY-NOT the recorder
script** (`"$0" "$@"` into a file), the reviewer's cheaper alternative: `os.tmpdir()` is
`/dev/shm` on this box and mounted `noexec`, so a generated executable cannot be spawned from a
unit test at all. Both WHY-NOTs are recorded in the test file.

**Mutation verification (the reviewer's own two survivors, applied by me, real unmasked rc):**

| Mutation applied to `src/cli/commands/edit.ts` | gate | rc | killed by |
|---|---|---|---|
| **M-K** split `$EDITOR` at the spawn site: `spawnSync(words[0], [...words.slice(1), path], …)` | `make unit-test` | **2** (pass 403 / fail 1) | exactly `looks a multi-word EDITOR up as ONE filename…` |
| **M-Q** hand the editor a hardcoded wrong path: `spawnSync(editor, ["/nope/wrong.md"], …)` | `make unit-test` | **2** (pass 403 / fail 1) | exactly `hands the editor the resolved ticket path as its argument` |

Both previously survived unit + parity + behave. Each now dies, and each kills exactly ONE test —
no collateral, i.e. the new tests are aimed at the seam rather than broadly coupled. Tree restored
after each (driver: `.tmp/mutate.py`, one exact string replacement, restore in a `finally`; nothing
piped through `head`/`tail`).

**The three over-claiming statements, corrected:**
- `scripts/parity/README.md` #19 — no longer says the 127 test "is also the only pin for the
  adopted editor exit code and for `${EDITOR:-vi}` being used UNSPLIT". It now names one test per
  claim and states explicitly that *a test which only asserts what `Editor.configured` RETURNS
  does not pin the spawn site*.
- `features/ticket_edit.feature` comment — now lists the four launch-arm facts actually pinned and
  says the unit test spawns real binaries, so the spawn site itself is covered.
- §6 row **M6** above — amended in place to say what it really pinned.

### SF#2 — CHANGELOG → **REJECTED ON SCOPE (mine), ACTION REQUIRED BY TOP**

`CHANGELOG.md` deliberately untouched. TOP must **REPLACE** the existing `## [Unreleased]` →
`### Changed` bullet that currently begins *"TypeScript port started (strangler-fig): `ticket` now
delegates the commands listed in its `TS_COMMANDS` variable…"* (the one ending *"Removing a name
from either list rolls that command back to bash."*) with the text below. Do not append beside it —
its command list is now false.

> - TypeScript port complete (strangler-fig): `ticket` is now a delegating shim. **Every** command
>   it dispatches — `create`, `start`, `close`, `reopen`, `status`, `dep`, `undep`, `link`,
>   `unlink`, `ls`/`list`, `ready`, `blocked`, `closed`, `show`, `edit`, `add-note`, `query`,
>   `help` — runs from a Node bundle at `dist/ticket.mjs`. Requires `node` on PATH and
>   `make build` from a source checkout. Removing a name from the `TS_COMMANDS` variable in
>   `ticket` rolls that one command back to the bash implementation, which is still in the file.
> - A missing `$EDITOR` binary now reports `Error: <editor>: command not found` (exit 127) instead
>   of the shell's own message, matching what `query`'s `jq` and `show`'s pager already do.
>   `$EDITOR` is still used UNSPLIT, so `EDITOR="code -w"` fails exactly as it did under bash.

Optional, TOP's call: the `has no 'id' frontmatter field` bullet ends "*the remaining enumerating
commands follow as they are delegated to the TypeScript core*" — there are no remaining ones, so
that clause can be dropped.

### NIT#3 — `edit` reads the ambient `process.env` → **REJECTED**

It is the house pattern, not an oversight: `src/cli/pager.ts:37` (`TICKET_PAGER`/`PAGER`),
`src/cli/program-name.ts:17` (`TICKET_INVOKED_AS`) and `src/core/ticket-store.ts:41`
(`TICKETS_DIR`) all read `process.env` directly. `CommandEnvironment` carries the things that are
non-deterministic or unobservable (clock, ids, git, TTYs); env vars are neither — a test can set
one, and `withEditor` does. Threading a sixth constructor parameter through every call site to make
ONE command different from the other three is churn against the consistency rule. It was also the
reviewer's stated motivation only as a by-product of an injection fix I did not take.

### NIT#4 — divergence #19's bash wording is environment-dependent → **INCORPORATED**

Good catch; the entry could be falsified on another box. `scripts/parity/README.md` #19 now pins
only the exit code on the bash side and says the shell printed `./ticket: line NNN: …` for a value
containing a slash or a space and **nothing at all** for a bare name when a
`command_not_found_handle` was installed. `docs-internal/migration-to-ts-high-level.md` reworded to
match, so there is still exactly one description.

### NIT#5 — unwritable ticket file → raw node stack trace → **INCORPORATED as a ticket**

Confirmed not a phase-C regression (the pre-existing `close`/`save` path does the same), so no code
change here. Filed `nid_xioefs6t2rcs1gyl2mpcb1oyf_e` — *"Unwritable ticket file surfaces a raw node
stack trace"* (bug, p3), scoped to every write in `src/core/ticket-store.ts`, with the acceptance
criterion that `chmod 444` + `tk close` prints `Error: …` naming the path and exits 1 under a unit
test. The new ticket file is uncommitted in `_tickets/` for TOP to commit.

### NIT#6 — shared stdout-capture helper at a fourth test → **REJECTED (deferred, as agreed)**

Reviewer and phase C already agree it is worth it at a fourth monkey-patcher, not at the third.
Adding it now would be gold-plating. It stays recorded in §9.

### Gates after this iteration (real unmasked rc; each `make X > .tmp/<f>.log 2>&1; echo rc=$?`)

```
make typecheck  rc=0
make unit-test  rc=0   tests 404 / pass 404 / fail 0            (+2, the new spawn-site tests)
make test       rc=0   247 scenarios passed, 0 failed; 1651 steps passed, 0 failed
make parity     rc=0   graph 71 / query OK / slug 13 / write cases=136 failures=0
```

### Files changed by iteration 1

`test/edit-command.test.ts` (+2 tests, 2 constants, `backdate()`/`wasTouched()`),
`scripts/parity/README.md` (#19), `features/ticket_edit.feature` (the NOTE comment),
`docs-internal/migration-to-ts-high-level.md` (#19 wording),
`_tickets/unwritable-ticket-file-surfaces-a-raw-node-stack-trace.md` (new follow-up ticket).
**No production source file was modified.** `CHANGELOG.md` still untouched.
