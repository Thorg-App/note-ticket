# IMPLEMENTATION REVIEW — nested folders under `_tickets`

Reviewed: `git diff 9f8ebdb..HEAD` (commits `9ae83b2`, `0d25158`, `ca810fe`), branch `nested_folders`.
Verification done independently: `make test` re-run by me (12 features / **153 scenarios / 0 failed**,
log at `/home/nickolaykondratyev/git_repos/note-ticket/.tmp/review-test.out`), plus hands-on probing in
throwaway git repos under `.tmp/`, plus running the NEW feature file against the OLD script
(`TICKET_SCRIPT=.tmp/ticket_old behave features/nested_folders.feature`).

**Verdict: 2 BLOCKING regressions** — both are silent, both are caused by the single `find` invocation,
both are one-line fixes. The rest of the change is well-executed and the tests are genuine.

---

## BLOCKING

### B1. Symlinked `_tickets` (or symlinked `TICKETS_DIR`) now finds ZERO tickets — silently
`/home/nickolaykondratyev/git_repos/note-ticket/ticket:121`

```bash
done < <(find "$TICKETS_DIR" -type f -name '*.md' -print0 2>/dev/null)
```

`find` without `-L`/`-H` does **not** descend into a symlinked directory given as the starting point.
The old glob `"$TICKETS_DIR"/*.md` resolved through the symlink fine.

Reproduced (`.tmp/symtest/repo`, `_tickets -> ../real_tickets` holding 4 tickets):

```
--- new ---            (no output)   exit=0
--- old ---            4 tickets listed  exit=0
```

Every listing command returns empty with exit 0 and `show <id>` reports "not found" — the user's whole
ticket set appears to have vanished, with no diagnostic. `_tickets` symlinked into a notes vault /
shared directory is a plausible real setup, and the failure mode is indistinguishable from data loss.

**Fix:** `find -L "$TICKETS_DIR" -type f -name '*.md' -print0` (`-L` is POSIX-ish and supported by both
GNU and BSD/macOS find). This simultaneously fixes S1 below. Add a BDD scenario: `_tickets` is a symlink
to another directory → `ls` finds the ticket.

### B2. `ls` / `query` output order regressed from stable alphabetical to filesystem order
`/home/nickolaykondratyev/git_repos/note-ticket/ticket:121` (consumed at `ticket:816` `cmd_ls`, `ticket:1471` `cmd_query`)

`cmd_ls` and `_file_to_jsonl` emit strictly in file-argument order and do no sorting (unlike `ready`/
`blocked`, which sort by priority+id in awk — those are unaffected). Bash glob expansion was sorted;
`find` traversal order is directory order, i.e. arbitrary and unstable as files are added/removed.

Reproduced with 5 tickets created as zebra, alpha, mango, beta, kiwi:

```
new: zebra, alpha, mango, beta, kiwi      (creation/dir order)
old: alpha, beta, kiwi, mango, zebra      (alphabetical)
```

This is a user-visible behavior change that was not requested, is not documented in CHANGELOG/README,
and has **no test coverage in either direction** — nothing would catch a further shuffle. It also makes
`ticket ls`/`ticket query` output non-reproducible run-to-run on hashed-directory filesystems, which
breaks diffing and any downstream script that assumed deterministic ordering.

**Fix:** `find -L "$TICKETS_DIR" -type f -name '*.md' -print0 | LC_ALL=C sort -z` in
`_collect_ticket_files` (one place, keeps DRY). Add a scenario asserting `ls` order across a root ticket
and a nested one.

`#QUESTION_FOR_HUMAN:` was alphabetical `ls`/`query` ordering ever contractual, or is any stable order
acceptable? (Sorting full paths puts `_tickets/backend/x.md` before `_tickets/zebra.md` — path order,
not title order. If title/creation order is wanted instead, that is a separate, larger change.)

---

## SHOULD-FIX

### S1. `-type f` drops ticket files that are symlinks
`ticket:121` — verified: a `_tickets/kiwi-link.md -> …/external/kiwi-title.md` is listed by the old
script and invisible to the new one. Subsumed by the `-L` fix in B1 (with `-L`, `-type f` matches the
symlink's target type).

### S2. `cmd_show` has no empty-array guard → `awk` can block on stdin
`ticket:1263-1266` and `ticket:1399`

```bash
_collect_ticket_files          # no `(( ${#TICKET_FILES[@]} )) || return 0`
...
' "${TICKET_FILES[@]}"
```

The comment asserts "Non-empty because `ticket_path()` succeeded", but that is a TOCTOU assumption
(file removed between the two `find` runs) and it is flat-out wrong in the B1 symlink case. `awk` with a
program but **no file operands reads stdin** — so `ticket show <id>` hangs on an interactive terminal
rather than erroring. On bash < 4.4 (macOS 3.2) with `set -u`, `"${TICKET_FILES[@]}"` on an empty array
raises "unbound variable" instead. Add the same one-line guard used at the other 8 sites.

### S3. `cmd_closed`: `recent_files` can be empty → same awk-stdin hang
`ticket:931-936, 964`

`recent_files` is populated from `ls -t "${TICKET_FILES[@]}"` with stderr suppressed. If `ls` fails
(ARG_MAX exceeded on a very large ticket set, permission error, files removed mid-run) the array is
empty and `awk … "${recent_files[@]}"` falls back to stdin. Add
`(( ${#recent_files[@]} )) || return 0`.

### S4. Two of the 22 new scenarios do not discriminate old code from new
`features/nested_folders.feature:81` (blocked) and `features/nested_folders.feature:90` (ready excludes)

Running the new feature file against the pre-change script gives **19 failed / 3 passed**. The three
green-on-old scenarios are `:81`, `:90`, and `:143` (`:143` "empty subfolder does not break listing" is
a legitimate regression guard, no issue).

- `:90` is effectively vacuous: it asserts `ready` output does **not** contain `nest-0002` after moving
  `nest-0002` into a subfolder. Under the old code the nested ticket was invisible entirely, so the
  assertion passes for the wrong reason. Strengthen: also assert `ready` contains `nest-0001`, then
  `close nest-0001` and assert `ready` now **does** contain `nest-0002`.
- `:81` asserts only that the root dependent appears in `blocked` — true regardless of whether the
  nested dependency file was read. Strengthen: assert the blocker is rendered (`<- [nest-0001]`) and
  that after closing the nested dep, `blocked` no longer lists `nest-0002`.

These are not silent-fallback/self-passing tests (no swallowed exceptions, no try/except, no weakened
assertions found anywhere in the new steps) — they are simply not tied to the behavior under change.

### S5. `find … 2>/dev/null` swallows real errors
`ticket:121` — a permission-denied subdirectory now silently omits its tickets from every listing.
Combined with B1 this is the "everything silently disappears" family. Consider letting `find` stderr
through (a genuinely missing `_tickets` is already handled by callers) or explicitly checking
`[[ -d $TICKETS_DIR ]]` first and reporting anything else.

### S6. Hidden subdirectories are now traversed
Verified: `_tickets/.trash/zebra-title.md` becomes a listed ticket (`ls` count 4 → 5). Editor/sync
sidecars (`.obsidian`, `.trash`, backup dirs) under `_tickets` will now surface as tickets. Either
exclude dot-directories (`-name '.*' -prune -o …`) or state the rule explicitly in README ("every `.md`
at any depth under `_tickets` is a ticket").

---

## NICE-TO-HAVE

- `ticket:118-122`: `_collect_ticket_files` leaks its loop variable `f` into the global namespace — add
  `local f`. The same NUL/line read-loop shape is duplicated at `ticket:933`; a tiny
  `_read_lines_into <array>` helper is probably not worth it, but `local f` is free.
- `ticket:1263`: `show` traverses the tree twice (once inside `ticket_path`'s command substitution,
  once here). Fine at current scale; the WHY comment is good. If `show` ever gets slow, have
  `ticket_path` write to a temp file or return the path plus have `_show_output` reuse it.
- Newline-in-filename remains unsupported by `closed` (line-delimited `ls -t`), as the implementer
  documented. Agreed 80/20 call; worth one line in the helper comment so the asymmetry with the
  NUL-safe helper is discoverable.
- bash 3.2 / macOS could not be exercised here (sandbox has bash 5.2 only). `${#arr[@]}` on an empty
  array under `set -u` and `find -L … -print0` are believed fine on BSD, but a macOS CI job (or a
  one-off manual check) would retire this assumption for good.

---

## VERIFIED-GOOD

- **All 9 call sites swapped, none missed.** `grep -n 'TICKETS_DIR"/\*\.md'` over `ticket` returns
  nothing; the only remaining enumeration primitives are `find` at `ticket:121` and `ls -t` at
  `ticket:935`. `title_to_filename()`'s root-only collision check (`ticket:89-98`) is correctly left
  alone, per the ticket.
- **`make test` green on my own run**: 12 features / 153 scenarios / 1040 steps, 0 failed. The stale
  "9 plugin tests fail due to /dev/shm noexec" note in the ticket is indeed obsolete (plugins removed in
  `1d31fa0`); no such failures occurred. Pre-existing scenario count 131 unchanged.
- **The new scenarios are real red-then-green tests**: 19 of 22 fail against `9f8ebdb`'s script. No
  hidden-failure patterns; `find_ticket_file()`'s `glob → rglob` change
  (`features/steps/ticket_steps.py:94`) is required for the fixture to locate moved files and does not
  weaken any assertion.
- **Bug fix 1 (exit 2 on empty tree) is real and correctly scoped.** Confirmed against the old script in
  a repo containing only `_tickets/sub/`: `ls`, `ready`, `blocked`, `closed`, `query` all exited **2**;
  new code exits **0** with empty output. Covered by 4 scenarios (`:150`, `:156`, `:162`, `:168`), each
  of which fails on old code.
- **Bug fix 2 (word-splitting in `closed`) is real.** The old `echo "$files" | xargs awk …` split on
  whitespace; folder names are user-chosen, so this became reachable with this feature. The new
  array-based read is correct. Covered by `:135` ("my archive/old stuff").
- **Deviation 1 (`cmd_closed` not using `xargs -0 ls -t`) is justified and does not regress behavior.**
  GNU `xargs` really does run the command on empty input. The replacement preserves both properties:
  with 110 closed tickets I verified mtime-**descending** order (bulk 110, 109, 108 …) and identical
  output to the old script for `closed --limit 200`; the 100-file cap survives as
  `ls -t … | head -n 100`. Bonus: moving the `| head` into a process substitution removes the old
  `pipefail`+SIGPIPE exposure that the command-substitution form had.
- **Deviation 2 (dep-cycle scenario correction) is legitimate.** `cmd_dep_cycle` has always exited 0 and
  printed `Cycle N: …`; asserting exit-0 + `Cycle 1:` + both IDs matches real behavior and still fails
  against the old script (`:108` is in the failing list). No product behavior was changed to make a test
  pass.
- **Acceptance criteria**: covered for `ls`, `ready`, `blocked`, `closed`, `show`, `query`, `dep tree`,
  `dep cycle`, `close`, `link`, `add-note`, deep (3-level) nesting, partial-ID resolution and ambiguity
  detection across levels, and empty-subfolder handling. `status`/`start`/`unlink` are uncovered but
  route through the same `ticket_path()`; acceptable under 80/20.
- **No new dependencies**; `fd` correctly not introduced.
- **Docs are accurate** for what was implemented: `ticket help` footer (`ticket:1529-1531`),
  `README.md`, `ORIGINAL_README.md`, and CHANGELOG `Added`+`Fixed` entries all match observed behavior.
  They should gain a line on ordering and (if B1/S6 are fixed as recommended) on symlink/dot-dir rules.

## Documentation Updates Needed

- CHANGELOG: once B2 is fixed, note the ordering guarantee explicitly (`ls`/`query` sorted by path) —
  users currently on this commit would otherwise see a silent shuffle.
- README/ORIGINAL_README: state the "every `.md` at any depth is a ticket" rule, including whether
  dot-directories are excluded, once S6 is decided.
- No CLAUDE.md change required.
