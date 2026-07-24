---
id: nid_pfbidnyf7mnhnzv9k5dtpdhc0_e
title: "Support nested folders under _tickets for ticket organization"
status: open
deps: []
links: []
created_iso: 2026-07-24T18:53:49Z
status_updated_iso: 2026-07-24T18:53:49Z
type: feature
priority: 2
assignee: CC_WITH-nickolaykondratyev
tags: [core, enhancement]
---

## Goal

Allow organizing tickets in nested subfolders under `_tickets/` (e.g. `_tickets/backend/foo.md`). All queries/commands must work across all nesting levels. Users organize by simply `mv`-ing ticket files into subfolders.

## Implementation plan

All changes are in the single script `ticket` at repo root. Every command currently enumerates via NON-recursive glob `"$TICKETS_DIR"/*.md`. Replace with the recursive helper (see Design section) at exactly these 9 call sites (line numbers as of commit 1d31fa0):

1. `ticket_path()` — ticket:122 (`md_files=("$TICKETS_DIR"/*.md)`; replace guard + awk file args)
2. `cmd_dep_tree` — ticket:588
3. `cmd_dep_cycle` — ticket:699
4. `cmd_ls` — ticket:798
5. `cmd_ready` — ticket:888
6. `cmd_closed` — ticket:906 — SPECIAL: uses `ls -t "$TICKETS_DIR"/*.md | head -n 100` for mtime ordering. Replace with `find "$TICKETS_DIR" -type f -name '*.md' -print0 | xargs -0 ls -t 2>/dev/null | head -n 100`. Portable GNU/BSD; avoids non-portable `find -printf`.
7. `cmd_blocked` — ticket:1034
8. `cmd_show` — ticket:1363 (inside `_show_output`)
9. `cmd_query` — ticket:1432 (`_file_to_jsonl "$TICKETS_DIR"/*.md`)

Do NOT change:
- `title_to_filename()` collision check (ticket:91-98): stays top-level-only — `create` writes to the root; same-slug files in different folders are harmless since ID is identity.
- `cmd_create` writes to `$TICKETS_DIR` root (no --folder flag in this ticket; possible follow-up).
- JSONL schema: `full_path` already exposes folder location.

## Testing (start with failing tests — BDD via behave, run `make test`, requires uv)

Feature files live in `features/*.feature`, step defs in `features/steps/ticket_steps.py`. Add a new `features/nested_folders.feature` (or extend existing files) with scenarios:
- create ticket -> `mv` its file into `_tickets/sub/` -> `ls`, `ready`, `show <id>`, `query` still find it
- deep nesting: `_tickets/a/b/c/ticket.md` found by `ls` and resolved by partial ID
- `close <id>` on a nested ticket updates the nested file in place
- `dep tree` / `blocked` work when dep target is nested and dependent is at root (and vice versa)
- `closed` lists a closed nested ticket
- empty subdirectory under _tickets does not break any command
- no tickets anywhere (only empty subdirs): `ls`/`ready`/`query` output empty, exit 0

Add a step like: `I move ticket "<id>" to subfolder "sub/dir"` (mkdir -p + mv; use context.tickets / find_ticket_file helpers in ticket_steps.py).

NOTE: 9 plugin tests fail on this machine due to /dev/shm noexec — pre-existing env issue, not related.

## Docs
- `ticket help` text (cmd_help): note tickets may be organized in nested subfolders
- README.md / ORIGINAL_README.md usage section
- CHANGELOG.md: ## [Unreleased] -> ### Added entry

## Milestones (commit at each)
1. Failing BDD scenarios
2. Helper + 9 call-site swaps; tests pass
3. Docs + CHANGELOG

## Design

Key insight: identity is already decoupled from location. The stable `id` lives in YAML frontmatter and `ticket_path()` resolves by scanning frontmatter, not filenames. So nested folders work automatically once file ENUMERATION is recursive. No data-model changes.

### Shared helper (DRY: one place knows "what is a ticket file")

Add to `ticket` near the other helpers:

    # Recursively collect ticket files into TICKET_FILES (global array).
    # NUL-delimited read: robust to any filename; works on bash 3.2 (macOS).
    _collect_ticket_files() {
        TICKET_FILES=()
        while IFS= read -r -d '' f; do
            TICKET_FILES+=("$f")
        done < <(find "$TICKETS_DIR" -type f -name '*.md' -print0 2>/dev/null)
    }

Call pattern at each site:

    _collect_ticket_files
    (( ${#TICKET_FILES[@]} )) || return 0   # also fixes set -u empty-array issue on old bash
    awk '...' "${TICKET_FILES[@]}"

### WHY-NOT fd
fd adds an install burden + existence check for zero capability gain; `find` is already a declared dependency and handles recursion. Do NOT add fd.

## Acceptance Criteria

- Tickets moved into nested subfolders (2+ levels) under _tickets are found by: ls, ready, blocked, closed, show, query, dep tree, dep cycle, status/start/close (via ticket_path), link/unlink, add-note
- Partial-ID resolution and ambiguity detection work across nested files
- No new dependencies added (no fd); find remains sufficient
- All new BDD scenarios pass via `make test`; no pre-existing scenarios broken
- README.md / ORIGINAL_README.md usage and `ticket help` mention nested folder support
- CHANGELOG.md updated under ## [Unreleased] / ### Added

