# EXPLORATION — nested folders under `_tickets`

Repo: note-ticket, branch `nested_folders`. HEAD at exploration time: `5abbacf`.

## 1. Enumeration call sites in `ticket` (1526 lines)

All 9 sites from the ticket plan CONFIRMED present, line numbers unchanged. No missing/extra sites
(`grep -n 'TICKETS_DIR"/\*\.md\|ls -t'` returns exactly 9 matches).

| # | Function (def line) | Glob line | Pattern |
|---|---------------------|-----------|---------|
| 1 | `ticket_path()` (115) | 122 | `md_files=("$TICKETS_DIR"/*.md)`; guard `[[ ! -f "${md_files[0]}" ]]`; `awk ... "${md_files[@]}"` at 150 |
| 2 | `cmd_dep_tree()` (392) | 588 | awk closing arg `' "$TICKETS_DIR"/*.md 2>/dev/null` |
| 3 | `cmd_dep_cycle()` (591) | 699 | same |
| 4 | `cmd_ls()` (754) | 798 | same |
| 5 | `cmd_ready()` (801) | 888 | same |
| 6 | `cmd_closed()` (891) | 906 | SPECIAL: `files=$(ls -t "$TICKETS_DIR"/*.md 2>/dev/null \| head -n 100)` then `echo "$files" \| xargs awk ...` |
| 7 | `cmd_blocked()` (938) | 1034 | same as awk-arg pattern |
| 8 | `cmd_show()` (1220), inner `_show_output()` (1231) | 1363 | same |
| 9 | `cmd_query()` (1422) | 1432 | `_file_to_jsonl "$TICKETS_DIR"/*.md 2>/dev/null` |

## 2. Helper locations (placement for `_collect_ticket_files`)

```
find_tickets_dir()  9      init_tickets_dir() 23     _iso_date() 53      _sed_i() 58
generate_id()       66     title_to_filename() 74 (collision check 91-98)
id_from_file()      105    ensure_dir() 110          ticket_path() 115
yaml_field()        161    update_yaml_field() 168   remove_yaml_field() 184
_file_to_jsonl()    194 (awk, takes "$@" file args)  cmd_create() 248
```
Recommended placement: between `ensure_dir()` (110-113) and `ticket_path()` (115) — groups FS helpers.

`cmd_create()` writes root-only: `file="$TICKETS_DIR/${slug}.md"` (line 285) — unaffected, per plan.

## 3. Script conventions

- `#!/usr/bin/env bash` + `set -euo pipefail` (lines 1-2). Empty-array guard is needed/defensive.
- No `mapfile`/`readarray`/`declare -A`/`BASH_VERSINFO` anywhere → bash 3.2 (macOS) portability holds;
  use NUL-delimited `while read -r -d ''`.
- **Zero existing `find` invocations** in the script — the new helper introduces the first one.

## 4. BDD test surface

Feature files: `id_resolution`, `ticket_creation`, `ticket_dependencies`, `ticket_directory`,
`ticket_edit`, `ticket_links`, `ticket_listing`, `ticket_notes`, `ticket_query`, `ticket_show`,
`ticket_status`. No `nested_folders.feature` yet.

`features/steps/ticket_steps.py` (809 lines) helpers:
- `get_ticket_script(context)` (21)
- `title_to_slug(title)` (29)
- `create_ticket(context, ticket_id, title, priority=2, parent=None)` (40) — writes to `_tickets/` root,
  registers `context.tickets[ticket_id] = path`
- `find_ticket_file(context, ticket_id)` (81) — checks `context.tickets` first; **fallback at line 94 is
  non-recursive `tickets_dir.glob('*.md')`**
- `extract_created_id(stdout)` (102)
- `_track_created_ticket(context, command, result)` (115) — sets `context.tickets[id] = Path(data['full_path'])`

`features/environment.py`: `_git_init(path)`; `before_scenario` (27) makes a fresh
`tempfile.mkdtemp(prefix='ticket_test_')`, git-inits it, resets `context.tickets`/`last_created_id`/io.
`after_scenario` rmtree's it.

⚠️ IMPLICATION: a new "move ticket to subfolder" step MUST update `context.tickets[id]` to the new path
(simplest), otherwise the non-recursive fallback glob won't find it. Alternatively switch the fallback to
`rglob('*.md')`.

## 5. Test running / env

- `Makefile`: `test: uv run --with behave behave`. `test.sh` wraps `eai2 make test` (local-env only).
- Sandbox versions: uv 0.11.32, python 3.11.2, bash 5.2.15.
- Known pre-existing caveat (from ticket, not re-verified): 9 plugin tests fail due to `/dev/shm` noexec.
