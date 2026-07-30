# IMPLEMENTATION_PHASE_C__PRIVATE.md — T5 phase C (add-note, edit, shim reduction)

Written by the RESTARTED phase-C instance. The first instance was killed mid-flight and left
an uncommitted draft with no notes; this file records what it left, what I kept, and what I
changed, so a third restart would not have to re-derive any of it.

## 1. What I inherited (uncommitted at base 10a1450)

New files: `src/cli/commands/add-note.ts`, `src/cli/commands/edit.ts`,
`src/cli/spawned-child.ts`, `src/cli/terminal.ts`, `test/add-note-command.test.ts`,
`test/edit-command.test.ts`.
Modified: `ticket` (TS_COMMANDS + shim comments), `scripts/parity/check_write.py` (+25 cases,
109→134), `src/cli/main.ts` (two case arms), `src/cli/command-environment.ts` (`terminal`
field), `src/cli/jq.ts` + `src/cli/pager.ts` (refactored onto `SpawnedChild`),
`src/core/frontmatter.ts` + `src/core/ticket.ts` (`withBodyAppended` → `withTextAppended`),
their tests, `features/ticket_notes.feature` (+7 scenarios), `features/ticket_edit.feature`
(+1), `features/steps/ticket_steps.py` (+3 steps).

Audit verdict: the draft was of good quality — bash contract faithfully read (I re-read
`ticket:1467-1513` myself and confirmed every claim), house style respected, terminal
injection well motivated. Gates were never run by it; when I ran them they were green
(unit 401/401, typecheck 0).

## 2. What I changed about it

### 2.1 `add-note` now APPENDS bytes instead of rewriting the file (the substantive change)

The draft computed the new whole-file text (`TicketDocument.withTextAppended` = parse(text +
appended)) and wrote it with `TicketStore.save`, which is write-temp-then-`rename`.

Problem I found by reading bash: `cmd_add_note` uses `printf … >> "$file"`. A rename
**replaces a symlinked ticket file with a regular file**; `>>` writes through the link.
Symlinked ticket files are a documented, supported shape (README: "Symlinked ticket files and
a symlinked `_tickets/` are followed", and `closed` deliberately uses `lstat` for them). So
the draft silently converted a link into a regular file, detaching every other name for that
ticket. Nothing pinned this: the parity tree dump dereferenced links and never recorded that
an entry WAS one.

Note the contrast that convinced me it is bash's own split, not an accident: bash's
frontmatter writer `_sed_i` is `sed > tmp && mv`, i.e. bash ALSO replaces the link for
`status`/`dep`/`link`. Only the note append goes through `>>`.

Fix: `TicketStore.appendTo(ticket, text)` (`appendFileSync`), and `TicketNote.appendedTo`
became a PURE function `(fileText, note, timestamp) => string`. Consequences:
- `TicketDocument.withTextAppended` / `Ticket.withTextAppended` deleted, and with them the
  committed-but-unused `withBodyAppended` they had replaced (grep: no other caller ever
  existed; it was built at T2 in anticipation of exactly this command). Less shared-core
  surface touched by this phase, which was one of my brief's explicit concerns.
- The whole class of "does parse+serialize round trip byte-exactly for this odd file shape"
  risk disappears — an append cannot lose bytes.
- `test/frontmatter.test.ts` and `test/ticket.test.ts` reverted to 10a1450 minus the
  now-dead `appends to the body` tests.

### 2.2 Parity harness extended to SEE symlinks

`check_write.WriteRepo._tree_dump` now marks each entry `[symlink -> <target>]` (and
`<dangling>` when it points nowhere), and `Case(symlinks={...})` creates one. Two new cases:
`add-note through a symlinked ticket` (both sides append through it) and
`status through a symlinked ticket` (both sides replace it). Without the marker the first
case passes even with the bug — verified by mutation M9 below.

### 2.3 Test rework

`test/add-note-command.test.ts`: the `TicketNote` block now asserts the appended BYTES; the
file-shape cases moved to command level (`AddNoteCommand on an oddly shaped file`, a table of
3 shapes asserting `fileText() === original + appended`), plus a command-level symlink pair.
`test/ticket-store.test.ts`: two `appendTo` tests (plain append; append through a symlink,
link stays a link).

A shape I tried and dropped: a file with NO frontmatter block. It has no `id`, so it never
resolves — `TicketStore.load` rejects it by name (divergence #2). The test caught this itself
(one red), which is a small piece of evidence that the table is not vacuous.

## 3. The shim decision

Kept the draft's approach, and I agree with it:

- `TS_COMMANDS` lists every command name in bash's dispatch `case` (verified arm by arm:
  create start close reopen status dep undep link unlink ls list ready blocked closed show
  edit add-note query help --help -h). Dispatch is therefore TOTAL: no `cmd_*` body is
  reachable for a real command.
- The bodies STAY, documented as unreachable, until T6. Reason: `make parity` builds its bash
  reference by copying `./ticket` with both delegation lists emptied. Delete the bodies and
  every check compares TS against TS — the oracle silently stops being able to fail. It is
  also the one-line rollback (`M12` below proves the rollback still works).
- `TS_DEP_SUBCOMMANDS=` assignment kept for the same reason plus `harness.py`'s
  exactly-one-assignment requirement. `harness.py` therefore needed no change.
- WHY-NOT making dispatch literally unconditional (`_exec_ts "$@"` with no list): that would
  break the harness's emptying trick outright, and would also change unknown-command
  behavior, which the BDD suite pins (a bogus name still goes through `init_tickets_dir`
  first and reports a missing tickets dir BEFORE the `Unknown command` help).

## 4. Divergences

Only **#19** is new: an `$EDITOR` not on PATH exits 127 on both sides, but bash printed the
shell's own `./ticket: line NNN: <editor>: command not found` (naming a script line) while TS
prints `Error: <editor>: command not found`. Same trade as #6 (jq), now decided once in
`SpawnedChild`. Unreachable by the harness (needs a TTY on both streams) — positively pinned
by `test/edit-command.test.ts`. Recorded in `scripts/parity/README.md`,
`docs-internal/migration-to-ts-high-level.md` and the `SpawnedChild.unusable` doc comment.

No new `decide`-ticket item: this is message wording, the same class as #6, which needed no
sign-off. Nothing was added to `nid_r3mp6uylht7t77iwxtuqvhxv2_e`.

Everything else about `add-note`/`edit` is bash-identical, including the deliberately odd
bits: `grep '^## Notes'` scanning the WHOLE file (so `## Notesish` and a heading inside the
frontmatter both suppress a second heading), `$*` joining with a single space, `$( )`
stripping trailing newlines only, the empty note from a redirected-but-empty stdin, and
`${EDITOR:-vi}` used UNSPLIT.

## 5. Mutation table (all restored afterwards; real, unmasked exit codes)

Driver: a throwaway `.tmp/mutate.py` that applies one exact string replacement, runs the gate
with output redirected to a file, prints `subprocess.returncode`, and restores the file in a
`finally`. NOTHING was piped through `head`/`tail` in a gate command (the first attempt did
and reported a bogus `rc=0` — that is why the gate string writes to `.tmp/*.log` instead).

| # | Mutation | Gate | rc | Caught by |
|---|---|---|---|---|
| M1 | `store.appendTo(...)` → `store.save(ticket.withField("x","y"))` | unit | 2 | 7 tests (note bytes, 3 odd shapes, both symlink tests) |
| M2 | `/^## Notes/m` → `/## Notes/m` | unit | 2 | "does not mistake a heading that is not at the start of a line" |
| M3 | drop `.replace(TRAILING_NEWLINES, "")` | unit | 2 | 2 tests |
| M4 | stdin read even when it is a terminal | unit | 2 | "refuses to read a terminal…" |
| M5 | `isStdin && isStdout` → `isStdout` | unit | 2 | "prints the path when only STDOUT is a terminal" |
| M6 | `$EDITOR` split on spaces | unit | 2 | "keeps a multi-word EDITOR as ONE command name" |
| M7 | ENOENT → CliError without `COMMAND_NOT_FOUND` | unit | 2 | "exits 127 naming the editor…" |
| M8 | `edit` prints the path even with both TTYs | unit | 2 | 3 tests |
| M9 | `appendTo` reimplemented as write-then-rename | parity | 2 | **exactly one** case: `add-note through a symlinked ticket` |
| M10 | `Note added to` → `Note appended to` | behave | 1 | 4 note scenarios ⇒ BDD really drives TS, not bash |
| M11 | `Edit ticket file: ` → `Open ticket file: ` | behave | 1 | `ticket_edit.feature:10` ⇒ same for `edit` |
| M12 | drop `add-note edit` from `TS_COMMANDS` | behave | 0 | (expected green — proves the bash rollback path still serves both) |
| M13 | heading appended every time | behave | 1 | the 2 NEW heading-count scenarios (no pre-existing scenario catches it) |
| M14 | drop the trailing-newline strip | behave | 1 | the NEW stdin scenario |
| M15 | `join(" ")` → `join("")` | behave | 1 | the NEW word-joining scenario |

M9 is the important one: it fails on ONE case only, because for a regular file "append" and
"rewrite" produce identical bytes. That is exactly why the symlink marker had to be added.
M13/M14/M15 show the new BDD scenarios are load-bearing rather than decorative.

## 6. Gates (final, unmasked)

```
make typecheck  rc=0
make unit-test  rc=0   tests 402 / pass 402 / fail 0      (10a1450: 365)
make test       rc=0   12 features, 247 scenarios, 1651 steps, 0 failed   (10a1450: 239)
make parity     rc=0   graph 71 / query OK / slug 13 / write cases=136 failures=0  (10a1450: 109)
```

## 7. Files changed by this phase

`ticket`, `src/cli/commands/add-note.ts` (new), `src/cli/commands/edit.ts` (new),
`src/cli/spawned-child.ts` (new), `src/cli/terminal.ts` (new), `src/cli/main.ts`,
`src/cli/command-environment.ts`, `src/cli/jq.ts`, `src/cli/pager.ts`,
`src/core/ticket-store.ts`, `src/core/frontmatter.ts`, `src/core/ticket.ts`,
`test/add-note-command.test.ts` (new), `test/edit-command.test.ts` (new),
`test/ticket-store.test.ts`, `test/frontmatter.test.ts`, `test/ticket.test.ts`,
`features/ticket_notes.feature`, `features/ticket_edit.feature`,
`features/steps/ticket_steps.py`, `scripts/parity/check_write.py`,
`scripts/parity/README.md`, `docs-internal/migration-to-ts-high-level.md`, `CLAUDE.md`,
`README.md`. CHANGELOG.md deliberately untouched (TOP writes one entry).

## 8. Left for T6 / follow-ups

- Delete the unreachable `cmd_*` bodies, both delegation lists, `scripts/parity/`, its make
  and npm targets and its CI step.
- `src/core/` still has zero CLI knowledge — re-checked after my edits: `ticket-store.ts`
  gained only `appendFileSync`; no argv, no console, no formatting.
- Not in scope, noticed: `test/add-note-command.test.ts` and `test/edit-command.test.ts` both
  monkey-patch `process.stdout.write` to capture output. Three command tests now do this;
  if a fourth appears it is worth a shared `CapturedStdout` helper.

---

## 9. Iteration 1 (fresh instance) — acting on IMPLEMENTATION_REVIEW_PHASE_C__PUBLIC.md

Verdict was READY / 0 blocking / 2 SHOULD-FIX / 4 NIT. Scope of this iteration: ONE test file,
three doc sites, one follow-up ticket. **No production source changed.** Nothing committed.

### 9.1 The one real finding, and why my §5 table was wrong

Row **M6** ("`$EDITOR` split on spaces") mutated `Editor.configured`, i.e. the function that
CHOOSES the string. The risk lives one call further on, at `edit.ts:69-71`, where the string is
handed to `spawnSync`. The reviewer's two survivors (split at the spawn site; wrong path to the
child) both passed unit + parity + behave. Lesson for the memory file: **a mutation is only
evidence about the line it touches** — mutating the chooser says nothing about the caller. This is
the same "vacuous by accident of where you looked" trap already recorded for graph tests.

### 9.2 What I built, and the two designs I rejected

`test/edit-command.test.ts` gained two tests inside the both-streams-are-terminals block, both
going through the REAL `spawnSync`:
- `/bin/touch` as `$EDITOR` + `utimesSync` backdating → asserts the mtime moved ⇒ the child got
  exactly the resolved path. `touch` is argv-sensitive, silent on success, present at both
  `/bin/touch` and `/usr/bin/touch` here.
- `/bin/true --flag` as `$EDITOR` → asserts `CliError` / `exitCode 127` ⇒ the whole string is
  looked up as one filename.

REJECTED: the reviewer's `spawn = spawnSync` injection / `EditorLauncher` — a stand-in only moves
the seam; a mutation inside the real launcher would still survive. REJECTED: a recorder script
writing `"$0" "$@"` — measured `os.tmpdir()` = `/dev/shm`, `noexec`; `spawnSync` of a generated
0755 script there returns `error.code === "EACCES"`. Both WHY-NOTs are in the test file so nobody
re-litigates them.

### 9.3 Mutation verification (driver `.tmp/mutate.py`, restore in `finally`, no `head`/`tail`)

```
python3 .tmp/mutate.py split     unit-test  → mutation=[split]     gate=[unit-test] rc=[2]
python3 .tmp/mutate.py wrongpath unit-test  → mutation=[wrongpath] gate=[unit-test] rc=[2]
```
Each log shows `ℹ pass 403 / ℹ fail 1` and names exactly ONE failing test — the matching new one.
Single-test kills matter here: it shows the tests target the seam instead of being broadly coupled.

### 9.4 Other findings

- SF#2 CHANGELOG: not mine. The exact replacement bullet for TOP is quoted verbatim in
  PUBLIC §10 (it REPLACES the "TypeScript port started (strangler-fig)…" bullet, plus a second
  bullet for divergence #19). I flagged the now-stale "the remaining enumerating commands follow"
  clause as optional.
- NIT#3 rejected: `process.env` read directly is the house pattern — `pager.ts:37`,
  `program-name.ts:17`, `ticket-store.ts:41`. `CommandEnvironment` carries the UNOBSERVABLE things.
- NIT#4 incorporated: divergence #19 no longer pins bash's stderr wording (measured: nothing at
  all for a bare name under a `command_not_found_handle`). Both #19 sites reworded together.
- NIT#5 incorporated as ticket `nid_xioefs6t2rcs1gyl2mpcb1oyf_e` (bug, p3); not a phase-C
  regression, so no code change.
- NIT#6 rejected/deferred by mutual agreement (helper at a fourth monkey-patcher).

### 9.5 Gates (each `make X > .tmp/<f>.log 2>&1; echo rc=$?`)

`typecheck rc=0` · `unit rc=0` (tests 404 / pass 404 / fail 0) · `behave rc=0` (247 scenarios,
1651 steps, 0 failed) · `parity rc=0` (graph 71 / query OK / slug 13 / write cases=136 failures=0).

### 9.6 State for a next instance

Tree is uncommitted on the same branch, as required. Beyond §7's list, iteration 1 touched
`test/edit-command.test.ts`, `scripts/parity/README.md`, `features/ticket_edit.feature`,
`docs-internal/migration-to-ts-high-level.md`, and added
`_tickets/unwritable-ticket-file-surfaces-a-raw-node-stack-trace.md`. `.tmp/mutate.py` is a
throwaway (gitignored) kept only so the two mutations can be replayed.
