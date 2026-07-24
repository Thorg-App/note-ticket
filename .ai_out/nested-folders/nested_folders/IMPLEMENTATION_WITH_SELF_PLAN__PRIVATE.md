# IMPLEMENTATION_WITH_SELF_PLAN — PRIVATE working memory

## Task
Implement `_tickets/support-nested-folders-under-tickets-for-ticket-organization.md`
(id `nid_pfbidnyf7mnhnzv9k5dtpdhc0_e`) on branch `nested_folders`.

## Baseline (before any change)
`make test` -> 11 features passed, 131 scenarios passed, 0 failed, 897 steps passed.
(No plugin-test failures observed in this sandbox; the ticket's /dev/shm note did not materialize.)

## Plan
**Goal**: Make every ticket-file enumeration recursive so tickets can live in nested subfolders.

**Steps**
1. [M1] `features/nested_folders.feature` + new steps in `features/steps/ticket_steps.py`
   (`I move ticket ... to subfolder ...`, `an empty subfolder ... exists ...`,
   `ticket ... should be located in subfolder ...`), plus `find_ticket_file` fallback
   `glob` -> `rglob`. Verify RED. Commit.
2. [M2] Add `_collect_ticket_files()` between `ensure_dir()` and `ticket_path()`;
   swap all 9 call sites. Verify GREEN. Commit.
3. [M3] `cmd_help` text, README.md, ORIGINAL_README.md, CHANGELOG.md [Unreleased]/Added. Commit.

**Files touched**: `ticket`, `features/nested_folders.feature`,
`features/steps/ticket_steps.py`, `README.md`, `ORIGINAL_README.md`, `CHANGELOG.md`.

## Call sites (line numbers at commit 5abbacf)
122 ticket_path | 588 dep_tree | 699 dep_cycle | 798 ls | 888 ready |
906 closed (`ls -t`) | 1034 blocked | 1363 show/_show_output | 1432 query

## Progress — DONE
- [x] M1 failing scenarios — commit `9ae83b2` (17/20 red)
- [x] M2 helper + swaps — commit `0d25158`
- [x] M3 docs — commit `ca810fe`

Final: 12 features, 153 scenarios passed, 0 failed, 1040 steps.
Ticket deliberately left OPEN; no change_log entry (top-level agent owns both).

## Gotchas learned (rehydrate a clone with these)
1. `xargs -0 ls -t` with EMPTY input still runs `ls -t` (GNU), which lists the cwd ->
   awk then reads a directory -> exit 2. The ticket's literal plan for cmd_closed hit
   this. Final cmd_closed reuses `_collect_ticket_files` + guard, then
   `ls -t "${TICKET_FILES[@]}" | head -n 100` read line-by-line into `recent_files`.
2. `dep cycle` ALWAYS exits 0 (prints "No dependency cycles found" or "Cycle N:").
   Do not assert failure on it.
3. `ticket_path()` runs in a command substitution subshell at every caller, so
   `TICKET_FILES` does NOT propagate. `cmd_show` re-collects explicitly.
4. cmd_closed's `ls -t` sort is newline-delimited -> filenames with newlines still
   unsupported there (documented as a deliberate 80/20 skip in PUBLIC).
5. The ticket's "9 plugin tests fail (/dev/shm noexec)" note is STALE — plugins were
   removed in 1d31fa0. Baseline was a clean 131/131.
6. Behave step `find_ticket_file()` fallback had to become `rglob` for nested files.
