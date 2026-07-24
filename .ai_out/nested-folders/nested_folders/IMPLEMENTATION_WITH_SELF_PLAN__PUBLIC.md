# IMPLEMENTATION — Nested folders under `_tickets`

Ticket: `_tickets/support-nested-folders-under-tickets-for-ticket-organization.md`
(`nid_pfbidnyf7mnhnzv9k5dtpdhc0_e`). Branch `nested_folders`. Status: **complete, all tests green.**
Ticket left open per instruction; no `change_log` entry written per instruction.

## Commits (3 milestones, as planned)

| Commit | Milestone |
|--------|-----------|
| `9ae83b2` | M1 — failing BDD scenarios (17 of 20 red) |
| `0d25158` | M2 — `_collect_ticket_files()` + 9 call-site swaps; all green |
| `ca810fe` | M3 — help text, README.md, ORIGINAL_README.md, CHANGELOG.md |

## What changed and why

**Key insight (from the ticket's design, confirmed correct):** ticket identity is already
decoupled from location — the stable `id` lives in YAML frontmatter and `ticket_path()`
resolves by scanning frontmatter, not filenames. So nested folders work as soon as file
*enumeration* is recursive. No data-model change, no `create --folder` flag, no change to
`title_to_filename()`'s collision check, no new dependencies (no `fd`).

Added one helper — the single source of truth for "what is a ticket file":

```bash
_collect_ticket_files() {
    TICKET_FILES=()
    while IFS= read -r -d '' f; do
        TICKET_FILES+=("$f")
    done < <(find "$TICKETS_DIR" -type f -name '*.md' -print0 2>/dev/null)
}
```

All 9 non-recursive `"$TICKETS_DIR"/*.md` enumerations now use it (`ticket_path`, `dep tree`,
`dep cycle`, `ls`, `ready`, `closed`, `blocked`, `show`, `query`), each guarded with
`(( ${#TICKET_FILES[@]} )) || return 0`.

### Two real bugs found and fixed along the way

1. **Exit code 2 on an empty tickets tree.** The unmatched glob `"$TICKETS_DIR"/*.md` was
   passed to awk as a literal path, so `ls`/`ready`/`blocked`/`closed`/`query`/`dep tree`/
   `dep cycle` exited 2 with a suppressed awk error whenever no ticket files existed. This was
   pre-existing, but the ticket explicitly asked for "no tickets anywhere: output empty, exit 0"
   scenarios, which surfaced it. The empty-array guard fixes it. Covered by 4 new scenarios.
2. **`cmd_closed` mangled paths containing spaces.** It piped newline-separated `ls -t` output
   through bare `xargs`, which word-splits. Harmless when every file sat in `_tickets/` with a
   generated slug name; a live hazard once folder names are user-chosen (`_tickets/my archive/`).
   Now reads `ls -t` output line-by-line into an array. Covered by a new scenario.

## Deviations from the plan (2, both deliberate)

1. **`cmd_closed` enumeration.** The plan specified
   `find … -print0 | xargs -0 ls -t | head -n 100`. I implemented that first and it broke: GNU
   `xargs` runs `ls -t` **even on empty input**, so `ls` listed the cwd and awk then tried to read
   a directory (`closed` exited 2 on an empty tree). Final form reuses `_collect_ticket_files`
   and sorts with `ls -t "${TICKET_FILES[@]}"` — portable, DRYer, and no empty-input trap. The
   plan's intent (mtime order without non-portable `find -printf '%T@'`) is preserved.
2. **`dep cycle` scenario contract.** My first draft asserted `dep cycle` exits non-zero on a
   cycle. It does not and never did — it always exits 0, printing either
   `No dependency cycles found` or `Cycle N: …`. I corrected the *scenario* to match the real,
   pre-existing behavior (assert success + `Cycle 1:` + both IDs). No product behavior was
   changed and no assertion was weakened to hide a failure.

Also, `cmd_show` calls `_collect_ticket_files` explicitly rather than inheriting the array from
`ticket_path()` — `ticket_path` runs inside a command substitution subshell, so its `TICKET_FILES`
does not propagate. Commented in place.

## Test results

Run with `make test` (behave). Full logs in `/home/nickolaykondratyev/git_repos/note-ticket/.tmp/`.

| Point | Features | Scenarios | Steps |
|-------|----------|-----------|-------|
| **Before** (`5abbacf`) | 11 passed, 0 failed | **131 passed, 0 failed** | 897 passed, 0 failed |
| M1 (RED) | 11 passed, 1 failed | 134 passed, **17 failed** | 993 passed, 17 failed |
| **After** (`ca810fe`) | 12 passed, 0 failed | **153 passed, 0 failed** | 1040 passed, 0 failed |

Zero pre-existing scenarios broken (131 → 131, plus 22 new = 153).

Note: the ticket warned about "9 plugin tests failing due to /dev/shm noexec". **No such failures
occurred** — the baseline was a clean 131/131. The plugin system was removed in commit `1d31fa0`,
so that note is stale.

Beyond BDD, manually smoke-tested in a throwaway git repo: a ticket at
`_tickets/deep folder/x/my ticket.md` (spaces in both folder and filename) resolves correctly via
`ls`, `query`, `show <partial-id>`, and `closed`; an empty-subfolder-only tree returns clean
empty output with exit 0 from every listing command.

## Files touched

- `/home/nickolaykondratyev/git_repos/note-ticket/ticket` — `_collect_ticket_files()` helper,
  9 call-site swaps, `cmd_closed` rewrite, help-text footer
- `/home/nickolaykondratyev/git_repos/note-ticket/features/nested_folders.feature` — new, 22 scenarios
- `/home/nickolaykondratyev/git_repos/note-ticket/features/steps/ticket_steps.py` — 3 new steps
  (move ticket to subfolder, create empty subfolder, assert ticket location);
  `find_ticket_file()` fallback `glob('*.md')` → `rglob('*.md')`
- `/home/nickolaykondratyev/git_repos/note-ticket/README.md`
- `/home/nickolaykondratyev/git_repos/note-ticket/ORIGINAL_README.md`
- `/home/nickolaykondratyev/git_repos/note-ticket/CHANGELOG.md` — `[Unreleased]` Added + Fixed

## Acceptance criteria

All met. Every criterion in the ticket's Acceptance Criteria section is satisfied and covered by
at least one passing scenario, except the "no new dependencies" and docs criteria, which are
verified by inspection (`find` was already a declared dependency; `fd` was not added).

## Open questions

None blocking. Two optional follow-ups worth a ticket if the human agrees:

1. **`create --folder <path>`** — the ticket explicitly deferred it. Users currently create at the
   root and `mv`. Worth doing only if the mv step proves annoying in practice.
2. **Filenames containing newlines** remain unsupported in `cmd_closed` (its `ls -t` sort is
   newline-delimited). Every other command handles them via the NUL-delimited helper. Fixing it
   would mean reimplementing the mtime sort without `ls`; low value, real complexity — I judged
   it below the 80/20 line and left it.
