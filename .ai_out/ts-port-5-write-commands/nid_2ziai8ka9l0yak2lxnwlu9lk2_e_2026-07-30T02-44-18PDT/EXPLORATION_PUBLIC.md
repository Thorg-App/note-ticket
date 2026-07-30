# EXPLORATION_PUBLIC.md — T5 write-command port (bash → TypeScript)

All paths relative to repo root `/home/nickolaykondratyev/git_repos/note-ticket`.
Bash line refs are `ticket:NNN` (file `./ticket`, 1642 lines).

> Produced by a read-only Explore agent; persisted verbatim by TOP_LEVEL_AGENT.

## 0. Shared: how the strangler-fig shim works

**Delegation lists** (`ticket:1596-1615`):
```bash
TS_COMMANDS="help --help -h ls list ready blocked closed query show"      # ticket:1600
TS_DEP_SUBCOMMANDS="tree cycle"                                            # ticket:1605
if _ts_serves "$TS_COMMANDS" "${1:-help}"; then _exec_ts "$@"; fi          # ticket:1607-1609
```
- `_ts_serves()` (`ticket:46-48`): `[[ -n "$2" && " $1 " == *" $2 "* ]]`. The `-n "$2"` guard is load-bearing — with an **emptied** list (what the parity harness does) a substring match would otherwise accept an empty name, e.g. bare `dep`.
- `_exec_ts()` (`ticket:51-63`): resolves `script_dir` from `${BASH_SOURCE[0]}` (NOT `$PWD`), requires `dist/ticket.mjs`, else `Error: TypeScript bundle not built: [$bundle]` + `Run: make build`, exit 1. Then `TICKET_INVOKED_AS="$0" exec node "$bundle" "$@"` — replaces the process, so **the TS side never runs `init_tickets_dir`**; TS must reproduce that resolution itself.
- `TICKET_INVOKED_AS` is consumed by `src/cli/main.ts:35-42` (`Cli.programName()`), because node cannot see bash's `$0`.
- `dep` dispatch (`ticket:755-772`): `cmd_dep` consults `TS_DEP_SUBCOMMANDS` for `${1:-}` and `_exec_ts dep "$@"`; then its own `tree`/`cycle` branches; then the write form.
- `init_tickets_dir` (`ticket:23-41`) + `WRITE_COMMANDS="create"` (`ticket:20`): only `create` may create the dir. Read/other commands with a missing dir: `Error: tickets directory '$TICKETS_DIR' does not exist` (stderr, exit 1). No git repo: `Error: not inside a git repository` + `Run inside a git repo, or set TICKETS_DIR env var` (exit 1). Mirrored in `src/cli/store-resolver.ts:5-24`.

**To finish the flip:** add `create start close reopen status dep undep link unlink edit add-note` to `TS_COMMANDS` (`ticket:1600`). The moment `dep` is in `TS_COMMANDS`, the top-level check at `ticket:1607` fires first and `cmd_dep`'s internal delegation (`ticket:758-760`) is dead code.

**CRITICAL harness coupling:** `scripts/parity/harness.py:34` declares
`_DELEGATION_VARIABLES = ("TS_COMMANDS", "TS_DEP_SUBCOMMANDS")` and `harness.py:54-61` requires **exactly one** `^VAR=` assignment for each, else `SystemExit`. So you may **not delete** the `TS_DEP_SUBCOMMANDS=` line at `ticket:1605` without also updating `harness.py:34`. Safest: leave the assignment (and optionally the now-dead `cmd_dep` delegation block) until T6.

**Bash code that becomes dead once every write is ported** (all commands then TS-served; only the `*)` unknown-command fallback still runs bash):
`cmd_create` 295, `validate_status` 379 + `VALID_STATUSES` 377, `cmd_status` 388, `cmd_start` 415, `cmd_close` 423, `cmd_reopen` 431, `cmd_dep` 755 (+ its delegation block), `cmd_undep` 1119, `add_link_to_file` 1153 (**already dead — defined but never called**, verified by grep), `cmd_link` 1175, `remove_link_from_file` 1254, `cmd_unlink` 1273, `cmd_add_note` 1466, `cmd_edit` 1498, plus helpers `ensure_dir` 132, `generate_id` 88, `title_to_filename` 96, `_iso_date` 75, `_sed_i` 80, `yaml_field` 208, `update_yaml_field` 215, `remove_yaml_field` 231, `id_from_file` 127, `ticket_path` 163, `_file_to_jsonl` 241, `_collect_ticket_files` 151, `_grep` 68-72, `WRITE_COMMANDS`/`init_tickets_dir`/`find_tickets_dir`. Also `cmd_ls/ready/blocked/closed/show/query/dep_tree/dep_cycle` are already dead. Reducing the shim is optional at T5; the sanctioned deletion point is T6 (`docs-internal/migration-to-ts-high-level.md:156`).

**Bash quirk to preserve by leaving the fallback alone:** an unknown command (`ticket foo`) is not in `TS_COMMANDS`, so it still goes through `init_tickets_dir "foo"` (`ticket:1612-1615`) — which errors about a missing tickets dir *before* printing `Unknown command: foo` + help to stderr (`ticket:1637-1641`). `src/cli/main.ts:89-93` has an unknown-command branch too, but it is unreachable through the shim.

## 1. Shared: what already exists in src/ (build on this)

### src/core
| Item | Location | Notes for writes |
|---|---|---|
| `Frontmatter.fromEntries(entries)` | `src/core/frontmatter.ts:86-88` | builds `key: rawValue` lines in order — what `create` needs |
| `Frontmatter.withField(key,raw)` | `frontmatter.ts:142-151` | **prepends** a new key (matches bash `update_yaml_field`'s "insert after first `---`"), replaces in place for an existing key |
| `Frontmatter.withoutField(key)` | `frontmatter.ts:154-160` | removes the FIRST occurrence only (bash `sed /^field:/d` removes all) |
| `Frontmatter.get/getString/getArray/has` | `frontmatter.ts:110-133` | raw values; `getArray` drops empty items |
| `FrontmatterValue.serializeArray` | `frontmatter.ts:51-53` | `[a, b]` inline form |
| `TicketDocument.parse/of/withFrontmatter/withBodyAppended/text` | `frontmatter.ts:217-290` | byte-exact round trip; `withBodyAppended` (`:270-272`) routes through `TicketDocument.of`, which **drops any prologue and forces the `terminated` shape** — harmless for tool-written tickets, note it for hand-mangled files |
| `Ticket` ctor `(path, document)` | `src/core/ticket.ts:38-42` | public; use for a brand-new ticket |
| `Ticket.withField / withoutField / withArrayField / withBodyAppended / text()` | `ticket.ts:142-160` | immutable |
| `Ticket.toJsonRecord() / toJsonText()` | `ticket.ts:125-140` | `full_path` appended last; `JSON.stringify` (declared divergence #5) — this is exactly what `create` must print |
| `VALID_TICKET_STATUSES`, `TICKET_STATUS_*`, `DEFAULT_PRIORITY` | `ticket.ts:9-22` | `["open","in_progress","closed"]` — same order as bash `VALID_STATUSES` |
| `TicketsDirectory.resolve(env,cwd)` | `src/core/ticket-store.ts:39-63` | `TICKETS_DIR` else `git rev-parse --show-toplevel` + `/_tickets`; private `gitRepoRoot` shows the `execFileSync` pattern to copy for `git config user.name` |
| `TicketStore.exists/ensureDir` | `ticket-store.ts:96-102` | `ensureDir` = `mkdirSync(recursive)` — **only `create` may call it** |
| `TicketStore.collectFiles/load/loadAll` | `ticket-store.ts:105-126` | `load` throws `MissingTicketIdError` on a file with no `id` (declared divergence #2) |
| `TicketStore.save(ticket)` | `ticket-store.ts:179-188` | write-temp-then-rename (mirrors `_sed_i`); temp name `<path>.tmp.<pid>`, deliberately not `.md` |
| `TicketStore.pathForNewTicket(filename)` / `topLevelFileExists(filename)` | `ticket-store.ts:204-210` | new tickets always land at the top level; the `exists` predicate for slug collisions |
| `TicketId.generate()` | `src/core/id.ts:17-30` | `nid_<25×[a-z0-9]>_e`, unbiased rejection sampling |
| `IdResolver` / `IdResolution` | `id.ts:59-103` | exact beats partial, >1 ⇒ ambiguous, input trimmed, **empty matches nothing** (divergence #9, approved) |
| `Slug.fromTitle` / `Slug.uniqueFilename(title, exists)` | `src/core/slug.ts:26-54` | returns `<slug>.md`, appends `-1`, `-2`, … |
| `DepGraph` | `src/core/dep-graph.ts` | not needed by writes |

### src/cli
| Item | Location | Notes |
|---|---|---|
| `CliError(message, detailLines, exitCode=1)` → stderr `Error: <msg>` | `src/cli/cli-error.ts:14-37` | the ONE user-facing failure channel |
| `UsageError(usageLines)` → stderr verbatim, no prefix, exit 1 | `cli-error.ts:46-55` | for every bash `Usage: …` line |
| `ExitCode.SUCCESS/FAILURE/COMMAND_NOT_FOUND/BROKEN_PIPE/forSignal` | `src/cli/exit-codes.ts:11-40` | |
| `TicketLookup.byId(tickets, search)` | `src/cli/ticket-lookup.ts:37-39` | bash `ticket_path` wording: `ticket '<s>' not found` / `ambiguous ID '<s>' matches multiple tickets`. **Every write command's id resolution goes through this.** |
| `StoreResolver.forReadCommand()` | `src/cli/store-resolver.ts:14-24` | exactly bash `init_tickets_dir` for a non-`create` command — reusable as-is by status/dep/undep/link/unlink/add-note/edit |
| `Pager` / `ChildExit` | `src/cli/pager.ts`, `src/cli/child-exit.ts` | `ChildExit.codeOf` (`child-exit.ts:26-35`) is the pattern for adopting `$EDITOR`'s exit code; `Pager.pipeThrough` (`pager.ts:47-58`) is the `spawnSync` + ENOENT→127 template |
| `BrokenPipe.reportAsSignalDeath()` | `src/cli/broken-pipe.ts` | already installed in `main.ts:123` |
| `QueryCommand.jsonl(tickets)` | `src/cli/commands/query.ts:42-44` | `create` should reuse `Ticket.toJsonText()` directly (one line + `\n`) |
| `DepCommand` (tree/cycle only, `USAGE` const) | `src/cli/commands/dep.ts:6-37` | extend here for the write form; `USAGE` at `:10-14` already carries bash's 3-line block |

### MISSING — must be added
1. **`StoreResolver.forWriteCommand()`** (same rules as read; can just alias `forReadCommand`, but name the intent) and **`StoreResolver.forCreateCommand()`** — resolve, then `store.ensureDir()`, never the "does not exist" error. Note bash `cmd_create` calls `ensure_dir` **before argument parsing** (`ticket:296`), so `ticket create --bogus` still creates the directory.
2. **A clock/timestamp helper** producing bash `_iso_date`'s exact format `%Y-%m-%dT%H:%M:%SZ` (UTC, second precision) — `new Date().toISOString().replace(/\.\d{3}Z$/, "Z")`. Used by create, status, add-note. Nothing like it exists yet. Keep it injectable so unit tests can pin it.
3. **A git-config reader** for `git config user.name` (create's default assignee). Copy the `execFileSync(..., stdio:["ignore","pipe","ignore"])` + try/catch shape from `ticket-store.ts:52-62`. Empty/failed ⇒ no `assignee` line at all.
4. **An editor launcher** (`edit`): TTY test on *both* stdin and stdout, `spawnSync(editor, [path], {stdio:"inherit"})`, exit code via `ChildExit`, ENOENT ⇒ 127 (bash's shell code).
5. **A stdin reader** (`add-note`): `readFileSync(0, "utf8")` when `process.stdin.isTTY !== true`.
6. **programName plumbing**: `Cli.programName()` is `private static` (`main.ts:35`). `status`/`start`/`close`/`reopen` usage lines interpolate `$(basename "$0")`; every other write command hardcodes the literal `ticket`. Expose the program name (e.g. pass it into the command's `run`) — do not hardcode.
7. **Command modules** `src/cli/commands/{create,status,dep(write branch),undep,link,unlink,add-note,edit}.ts` + `case` arms in `main.ts:59-94`.
8. **Unit tests** `test/*.test.ts` (see §5).

## 2. Shared: main.ts dispatch pattern + a full small command example

`src/cli/main.ts` is a single `Cli` class:
- `Cli.run(argv)` (`:44-57`) → `dispatch` in a try/catch; `userFacingFailure` (`:110-120`) maps `CliError` (and core's `MissingTicketIdError`) to `stderrText` + `exitCode`; anything else re-throws with its stack (defects must not look like usage errors).
- `Cli.dispatch(command, args)` (`:59-94`) is a `switch` mirroring bash's `case`. Read commands funnel through `Cli.read()` (`:100-104`) = `StoreResolver.forReadCommand()` + `process.stdout.write(body(...))` + `SUCCESS`. Commands that own their exit code (`query`, `dep`, `show`) call `X.run(store, args)` and return its number.
- Entry (`:123-124`): `BrokenPipe.reportAsSignalDeath(); process.exitCode = Cli.run(process.argv.slice(2));`
- Write commands should follow the `X.run(store, args): number` shape (they own stdout text and exit code) and throw `UsageError`/`CliError` for failures.

Full small example — `src/cli/commands/ready.ts` (whole file):
```ts
export class ReadyCommand {
    static render(tickets: readonly Ticket[], options: ListOptions): string {
        const ready = DepGraph.build(tickets).ready();
        const filter = options.filterIgnoringStatus;
        const rows = ready.filter((t) => filter.matches(t)).map((t) => TicketRow.withPriority(t));
        return TicketRow.text(rows);
    }
}
```
Example with args + lookup + own exit code — `src/cli/commands/show.ts:24-31`:
```ts
static run(store: TicketStore, args: readonly string[]): number {
    if (args.length === 0) { throw new UsageError([USAGE]); }
    const tickets = store.loadAll();
    const target = TicketLookup.byId(tickets, args[0] as string);
    return Pager.write(ShowCommand.render(target, DepGraph.build(tickets)));
}
```
House style (enforced by review culture in this repo): named constants for literals, WHY/WHY-NOT doc comments on every non-obvious decision, no `any`, `strict` TS, zero runtime deps, DIVERGENCE comments where bash is not reproduced.

## 3. Per-command bash contract

### 3.1 `cmd_create` — `ticket:295-374`
Setup: `ensure_dir` FIRST (`:296`, before parsing). Defaults (`:298-302`): `priority=2`, `issue_type="task"`, `assignee=$(git config user.name 2>/dev/null || true)`, everything else empty.

Arg loop (`:305-319`):
```bash
-d|--description) description="$2"; shift 2 ;;
--design) ... --acceptance) ... -p|--priority) ... -t|--type) ...
-a|--assignee) ... --external-ref) ... --parent) ... --tags) ...
-*) echo "Unknown option: $1" >&2; return 1 ;;
*) title="$1"; shift ;;
```
- Unknown flag ⇒ stderr `Unknown option: <arg>` (NO `Error: ` prefix), exit 1.
- Multiple positionals: **last wins** (`title="$1"` each iteration).
- A value-taking flag as the last arg dereferences `"$2"` under `set -u` ⇒ bash's own unbound-variable error, exit 1 (unverified exact text; not covered by BDD — TS should produce a sane usage/error with exit 1 and this should be called out as a divergence).
- No validation of `priority` or `type`.

`--parent` (`:322-326`): resolved via `ticket_path` (so a partial id works; failure propagates with `ticket_path` wording) and normalized to the parent's **full** id.

Title default `Untitled` (`:328`). `id=generate_id`, `slug=title_to_filename "$title"`, `file="$TICKETS_DIR/${slug}.md"` (always top level), `now=$(_iso_date)` — **one** timestamp for both `created_iso` and `status_updated_iso`.

File body written by one `{ … } > "$file"` group (`:335-371`), key order fixed:
```
---
id: <id>
title: "<title with " → \">"     # ticket:338-339  escaped_title="${title//\"/\\\"}"
status: open
deps: []
links: []
created_iso: <now>
status_updated_iso: <now>
type: <issue_type>
priority: <priority>
assignee: <assignee>        # only if non-empty
external-ref: <ref>         # only if non-empty   (hyphenated key!)
parent: <full parent id>    # only if non-empty
tags: [<tags with each "," → ", ">]   # ticket:351  ${tags//,/, }  — NO trimming
---
<blank line>
<description>\n<blank>      # if given
## Design\n\n<design>\n<blank>              # if given
## Acceptance Criteria\n\n<acceptance>\n<blank>   # if given
```
Then stdout = `_file_to_jsonl "$file"` (`:373`) — one JSON line, frontmatter keys in the above order, then `"full_path"`. `Ticket.toJsonText()` reproduces this (with proper control-char escaping, divergence #5).

Slug rules — `title_to_filename` (`ticket:96-124`): lowercase (`tr`, byte-wise ASCII only), `' '`→`-`, strip `[^a-z0-9-]`, collapse `-{2,}`, trim leading/trailing `-`, truncate 200, strip a trailing `-` exposed by truncation, empty ⇒ `untitled`; collision ⇒ `-1`, `-2`, … checking only `$TICKETS_DIR/<name>.md` (top level, not nested). `Slug` (`src/core/slug.ts`) + `TicketStore.topLevelFileExists` already implement this exactly and are byte-compared by `scripts/parity/check_slug.py`.

BDD: `features/ticket_creation.feature` (all 27 scenarios), `features/ticket_directory.feature:28-35` (mkdir from a subdirectory at repo root), `:94-101` (nested repo).

### 3.2 `cmd_status` + `start`/`close`/`reopen` — `ticket:377-437`
- `VALID_STATUSES="open in_progress closed"` (`:377`); `validate_status` prints `Error: invalid status '<s>'. Must be one of: open in_progress closed` to stderr, exit 1 (`:384-385`).
- `cmd_status` with <2 args (`:389-393`): stderr `Usage: $(basename "$0") status <id> <status>` then `Valid statuses: open in_progress closed`, exit 1. **Both lines**, and the program name is the invoked name (use `TICKET_INVOKED_AS`).
- Order of operations (`:398-410`): validate status → `ticket_path` → `update_yaml_field status` → `update_yaml_field status_updated_iso $(_iso_date)` → if `closed`: `update_yaml_field closed_iso $(_iso_date)` **(a second `_iso_date` call — may differ by a second)**; else `remove_yaml_field closed_iso`.
- stdout: `Updated <full id> -> <status>` (`:412`).
- Wrappers (`:415-437`): `start`→`in_progress`, `close`→`closed`, `reopen`→`open`; each with <1 arg prints `Usage: $(basename "$0") start|close|reopen <id>`, exit 1. They then call `cmd_status`, so all its errors/output are inherited verbatim.

BDD: `features/ticket_status.feature` (all), `features/id_resolution.feature:78-83`, `features/nested_folders.feature:65-72` (nested file updated in place — do not move the file).

### 3.3 Frontmatter mutation mechanics (shared by 3.2/3.4/3.5)
`update_yaml_field` (`ticket:215-228`):
```bash
if _grep -q "^${field}:" "$file"; then
    _sed_i "$file" "s/^${field}:.*/${field}: ${value}/"
else
    _sed_i "$file" "0,/^---$/ { /^---$/a\\
${field}: ${value}
}"
fi
```
Consequences the TS port must be aware of:
- A **new** field is inserted immediately after the opening `---`, i.e. becomes the **FIRST** frontmatter entry — which changes JSONL key order (e.g. `closed_iso` first). `Frontmatter.withField` (`frontmatter.ts:142-151`) already prepends for this reason.
- sed runs over the **whole file**, so *every* line matching `^field:` is rewritten, body lines included; likewise `remove_yaml_field` (`ticket:231-237`) deletes every `^field:` line. TS touches only the first occurrence inside the block — already documented as a duplicate-key divergence at `frontmatter.ts:63-75`.
- `_sed_i` (`ticket:80-85`) is `sed … > "$file.tmp.$$" && mv` — same durability contract as `TicketStore.save`.
- `yaml_field` (`ticket:208-212`) reads via `sed -n '/^---$/,/^---$/p' | grep "^field:" | sed 's/^field: *//'` → **raw** value, whitespace-trimmed on the left only; a missing field yields the empty string (and the `_grep` failure is swallowed with `|| true` at the link call sites).

### 3.4 `cmd_dep` (write form) — `ticket:774-811`; `cmd_undep` — `ticket:1119-1151`
`dep`:
- <2 args ⇒ 3-line usage to stderr, exit 1 (`:774-779`), literal `ticket`, already in `src/cli/commands/dep.ts:10-14`.
- `file=ticket_path "$1"`; `dep_file=ticket_path "$2"`; `dep_id=id_from_file "$dep_file"` (normalized to full id). Either failure ⇒ `ticket_path` wording, exit 1.
- **No self-dependency check, no cycle check.**
- `current_deps=$(yaml_field "$file" "deps")`; membership test is `echo "$current_deps" | _grep -q "$dep_id"` — a **substring/regex** test, not array membership. Already present ⇒ stdout `Dependency already exists`, **exit 0** (`:796-799`).
- Append: `[]` ⇒ `update_yaml_field deps "[$dep_id]"`; else `sed "s/\]/, $dep_id]/"` (inserts before the FIRST `]`) then update (`:802-808`).
- stdout on success: `Added dependency: <full id of subject> -> <full dep id>` (`:810`).
- **Bug to decide on:** a ticket with **no** `deps:` field yields `current_deps=""`, which is not `[]`, so `sed` on the empty string produces `""` and `update_yaml_field` writes a bare `deps: ` line. TS should write `deps: [<id>]`; flag as a fix + BDD scenario.
  > **CORRECTION (Phase B, re-measured against pinned bash and independently confirmed by the Phase B reviewer):** bash writes **no** bare `deps: ` line. `current_deps=$(yaml_field …)` is a `sed|grep|sed` pipeline whose `grep` matches nothing, and under `set -euo pipefail` that failing pipeline aborts the function immediately: **exit 1, nothing printed on either stream, nothing written**. Same for `undep`. The accurate contract is whitelist divergence #14 in `scripts/parity/README.md`. Phase C: read that, not this bullet.

`undep`:
- <2 args ⇒ stderr `Usage: ticket undep <id> <dependency-id>`, exit 1 (`:1120-1123`).
- Same two `ticket_path` resolutions, same substring membership test; **not** present ⇒ stdout (not stderr!) `Dependency not found`, **exit 1** (`:1138-1141`).
- Removal (`:1145-1147`): `sed "s/, *$dep_id//g; s/$dep_id, *//g; s/$dep_id//g"` then normalize `[]`/`[, ]`/`[ ]` → `[]`. Substring-based, so removing an id that is a prefix of another corrupts the array — TS should remove by exact array element (`Ticket.withArrayField(deps.filter(...))`) and note the divergence.
- stdout: `Removed dependency: <full id> -/-> <full dep id>` (`:1150`).

BDD: `features/ticket_dependencies.feature:12-44`, `features/id_resolution.feature:85-90`, `features/ticket_directory.feature:64-71` (from a subdirectory).

### 3.5 `cmd_link` — `ticket:1175-1252`; `cmd_unlink` — `ticket:1273-1300`
`link`:
- <2 args ⇒ stderr `Usage: ticket link <id> <id> [id...]`, exit 1.
- Resolves **all** args first via `ticket_path` + `id_from_file` (`:1183-1188`); any failure aborts before mutating.
- For each ticket i, `others` = every other resolved id. An inline awk (`:1207-1241`) rewrites the FIRST-matching-per-line `^links:` line: parses existing entries, drops the ones already present from `need`, re-emits existing entries **in order**, then appends the remaining `need` ids via `for (id in need)` — **awk hash order, i.e. unspecified**. Increments `added` per appended id and prints the count to stderr, which bash captures. File replaced via `<file>.tmp` + `mv` (`:1241-1243`).
- Counting: `count` is the total across all files; stdout is `All links already exist` when 0 (`:1248`) else `Added <count> link(s) between <N> tickets` (`:1250`). Symmetric linking ⇒ 2 tickets = 2, 3 tickets = 6, partial = 4 (pinned by `features/ticket_links.feature:12-28,54-58`).
- Quirks worth preserving/deciding: awk matches `/^links:/` **anywhere in the file**, body included; a ticket with **no** `links:` line never gains one and contributes 0 (so `All links already exist` is printed misleadingly); `ticket link a a` makes each id its own "other" and would self-link. TS: use enumeration order for appended ids, only the frontmatter block, and consider de-duplicating the argument list (flag as divergence + BDD).

`unlink`:
- <2 args ⇒ stderr `Usage: ticket unlink <id> <target-id>`, exit 1.
- Resolves both, takes both full ids (`:1281-1285`). Membership test on the subject's `links` is again substring; missing ⇒ stdout `Link not found`, **exit 1** (`:1290-1293`).
- Removes symmetrically via `remove_link_from_file` (`:1254-1271`, same triple-`sed` + `[]` normalization as undep) for `file`→target and `target_file`→subject.
- stdout: `Removed link: <id> <-> <target id>` (`:1299`).
- `add_link_to_file` (`ticket:1153-1173`) is **dead code** — do not port.

BDD: `features/ticket_links.feature` (all 7), `features/id_resolution.feature:92-97`, `features/nested_folders.feature:178-185`.

### 3.6 `cmd_add_note` — `ticket:1466-1496`
- 0 args ⇒ stderr `Usage: ticket add-note <id> [note text]`, exit 1.
- `file=ticket_path "$1"`, then `shift`.
- Note text (`:1477-1484`): remaining args ⇒ `note="$*"` (**space-joined**, IFS default); else if stdin is not a TTY ⇒ `note=$(cat)` (command substitution ⇒ **trailing newlines stripped**); else stderr `Error: no note provided`, exit 1. NB: under `stdin=DEVNULL` (how BDD runs everything) the stdin branch is taken and yields an empty note, so `ticket add-note <id>` with no text succeeds with an empty note in tests — the "no note provided" arm needs a real TTY.
- `timestamp=$(_iso_date)`.
- Append (`:1490-1493`): if `grep -q '^## Notes' "$file"` fails, append `\n## Notes\n`; then always append `\n**<timestamp>**\n\n<note>\n`. Pure **byte append to end of file** — no frontmatter touched. `Ticket.withBodyAppended` + `TicketStore.save` reproduces this for normally-shaped tickets (verified by hand-tracing `TicketDocument.of`'s split/join).
- stdout: `Note added to <full id>` (`:1495`).

BDD: `features/ticket_notes.feature` (all 7), `features/nested_folders.feature:171-177`.

### 3.7 `cmd_edit` — `ticket:1498-1512`
- 0 args ⇒ stderr `Usage: ticket edit <id>`, exit 1.
- `file=ticket_path "$1"`.
- `if [ -t 0 ] && [ -t 1 ]; then "${EDITOR:-vi}" "$file"; else echo "Edit ticket file: $file"; fi` — **both** stdin and stdout must be TTYs. Non-TTY stdout string: `Edit ticket file: <absolute path>` (`:1510`), exit 0. TTY: the editor's own exit code becomes the command's; a missing editor ⇒ bash's `command not found`, exit 127. `$EDITOR` is used **unsplit** (a single word/argv0; `EDITOR="code -w"` would be looked up as one filename) — do not tokenize it, unlike `TICKET_PAGER`.

BDD: `features/ticket_edit.feature` (3 scenarios; the path assertion is `_tickets/editable-ticket.md`).

## 4. Cross-cutting notes for all writes
- Every id argument resolves through `TicketLookup.byId` ⇒ `ticket '<s>' not found` / `ambiguous ID '<s>' matches multiple tickets`, exit 1. Empty id matches nothing (divergence #9, approved) — `features/id_resolution.feature:64-77` pins it and explicitly calls out `tk close "$UNSET_VAR"`.
- All failure exits are **1**; the only non-1 codes in this batch are `edit`'s adopted editor code / 127.
- `Dependency not found`, `Link not found`, `Dependency already exists`, `All links already exist` go to **stdout**, not stderr (the first two with exit 1).
- All write commands except `create` need an existing tickets dir (bash `init_tickets_dir`); `create` mkdir -p's it and is the only one allowed to.
- Timestamps: `YYYY-MM-DDTHH:MM:SSZ`, UTC, no fractional seconds.
- Tickets are never moved: a nested ticket is edited in place (nested-folder scenarios pin this).

## 5. BDD / test wiring
- Feature files for this batch: `features/ticket_creation.feature`, `features/ticket_status.feature`, `features/ticket_dependencies.feature:1-44`, `features/ticket_links.feature`, `features/ticket_notes.feature`, `features/ticket_edit.feature`, `features/ticket_directory.feature` (create-mkdir + `dep` from a subdirectory), `features/id_resolution.feature:78-97`, `features/nested_folders.feature:65-72,96-99,125-129,145-149,171-185`.
- `features/environment.py:27-40`: each scenario gets a fresh `git init`'d temp dir (`context.test_dir`), `context.tickets = {}`.
- Reusable step helpers in `features/steps/ticket_steps.py`:
  - `get_ticket_script` (`:25-30`) — honors `TICKET_SCRIPT`; the whole suite always drives `./ticket`, so it never knows which language serves a command.
  - `create_ticket` (`:44-82`) writes fixture tickets with the canonical frontmatter order; `find_ticket_file` (`:85-104`) resolves by `id:` via `rglob`.
  - When steps: plain (`:634`), `in non-TTY mode` (`:443`, stdin=DEVNULL), `with no stdin` (`:467`), `with TICKETS_DIR set to` (`:488`), `with stdin left open` (`:522`, hang detector), `with <binary> missing from PATH` (`:605`). **Note every runner uses `stdin=subprocess.DEVNULL`**, i.e. never a TTY.
  - `_track_created_ticket` (`:145-160`) parses `create`'s JSON stdout for `id`/`full_path` — so `create` MUST keep emitting a single valid JSON line, or a large part of the suite breaks.
  - Then steps you can lean on: `the command should succeed|fail`, `the exit code should be N` (`:685`), `the output should be "…"` (exact, stripped), `the output should contain`, `stderr should contain` (`:712`), `the created ticket should have field "F" with value "V"` (`:817`), `ticket "X" should have field/…` (`:857`), `should not have field` (`:1070`), `should have "d" in deps` / `not have` (`:870`,`:882`), `should have "l" in links` / `not have` (`:894`,`:906`), `ticket "X" should contain "t"` (`:918`), `should contain a timestamp in notes` (`:926`), `should have a valid "F" timestamp` (`:1080`), `the created ticket should have a valid created timestamp` (`:834`), `a file named "f" should exist in tickets directory` (`:1090`), `the output should be valid JSON with an id field` (`:726`), `the output should match a ticket ID pattern` (`:736`), `the tickets directory should exist` / `in test root` / `in subdirectory "s"` (`:778`,`:793`,`:800`), `ticket "X" should be located in subfolder "s"` (`:1099`).
- Makefile: `build` (`:11-13`, esbuild + chmod), `typecheck` (`:15`), `unit-test` (`:20-21` = `npm test`), `parity` (`:29-31`, depends on `build`), `test` (`:35-36` = `build unit-test` then `uv run --with behave behave`). npm scripts in `package.json:7-13`; unit tests are `test/*.test.ts` transpiled by esbuild to `dist-test/` and run with `node --test` — **no test framework; do not add vitest** (`CLAUDE.md`).
- Unit-test patterns to copy: `test/list-commands.test.ts:1-45` (in-memory `Ticket` fixtures via a `ticketOf(spec)` helper, `node:test` `describe/it`, `assert/strict`) and `test/ticket-store.test.ts:23-50` (`TicketsTree` scratch-dir class with `mkdtempSync` + `rmSync` in `before/after`) — the latter is the right shape for mutation tests, which need real files.
- CI: `.github/workflows/test.yml` runs `make test` then `make parity` (`if: !cancelled()`), 20-minute timeout.

## 6. Parity harness (scripts/parity/) — and why it barely applies to writes
- `make parity` = `npm run build:parity` (bundles `scripts/parity/dump.ts` → `dist-parity/dump.mjs`) + `python3 scripts/parity/run.py`; depends on `make build` because ported commands are compared using the **shipped** `dist/ticket.mjs`.
- `harness.py:22-66` `BashReference`: copies `ticket` into `$REPO/.tmp/parity-bash-ref-*` with **both** `TS_COMMANDS` and `TS_DEP_SUBCOMMANDS` rewritten to `""` (`re.subn` per variable, `count != 1` ⇒ `SystemExit`). `$REPO/.tmp` and not TMPDIR because the system temp dir may be `noexec`.
- `TempRepo` (`harness.py:94-179`): throwaway `git init` repo, `write_scenario` materializes tickets **directly as files** (`id`,`title` from `HOSTILE_TITLES`, `status`, `deps`, `priority`, `assignee`, `tags`) with explicitly shuffled mtimes; runners `bash()`, `ts()` (dump), `ts_cli()` (real CLI), `*_result()`, `*_head_rc()`; env forces `TICKETS_DIR` + `LC_ALL=C`.
- Scenario generators: `FIXED_SCENARIOS` (`:208-229`, 11 hand-picked graph shapes incl. cycles, dangling deps, legacy `done`, duplicate deps) + `random_scenarios` (`:232-246`, seeded).
- Checks: `check_graph.py` (`ls`/`ready`/`blocked`/`closed`, `dep tree`, `dep cycle`, `show`, broken-pipe rc, id-resolution + closed-limit divergences), `check_query.py` (`query` JSONL), `check_slug.py` (`title_to_filename` vs `Slug.fromTitle`, via `dump.ts`'s only remaining mode, `dump.ts:15-16`).
- **Write commands are NOT exercised at all.** Every fixture is written by Python; no check invokes `create`, `status`, `dep <id> <dep>`, `undep`, `link`, `unlink`, `add-note` or `edit`. The only write-adjacent coverage is `check_slug.py` (create's filename rule) — and its TS side is `dump.mjs`, whose `slug` mode `dump.ts:8-9` says is "what is left, because `create` is still bash". So:
  - When `create` lands in `TS_COMMANDS`, the intended pattern (README "The TS side of a check is the real CLI … a command's `dump.ts` mode is deleted when it is ported") means `check_slug.py` should be re-pointed at `dist/ticket.mjs create` (parse `full_path` from the JSON) and the `slug` mode deleted from `dump.ts` — after which `dump.ts`/`build:parity` may have no modes left. Decide explicitly; do not leave two descriptions of the format.
  - Otherwise parity is largely **inapplicable to mutations**: it is an output-diffing harness, and a fair write comparison needs "run bash on a copy of the tree, run TS on an identical copy, diff resulting file bytes + stdout + rc". That is a genuine extension (a `mutation` check module) — worthwhile for `update_yaml_field` key-order/insert-position parity and the `deps`/`links` array-rewrite text, but it must diff **file contents**, not just stdout, and must neutralize timestamps (`created_iso`/`status_updated_iso`/`closed_iso`/note stamps) and random ids. If a phase chooses not to extend it, BDD scenarios must carry the new pins instead, and the divergences listed in §3 (`deps: ` bare line, substring membership/removal, awk-order link append, `^links:` in the body, unset `$EDITOR` splitting) must each get a scenario or an explicit whitelist entry in `scripts/parity/README.md`.
- Whitelisted divergences (1-9) live in `scripts/parity/README.md:43-132`; new deliberate behavior changes go there **and** in `docs-internal/migration-to-ts-high-level.md`, with a decision ticket if user-visible (precedents: `nid_5g3eta9cf7yi6iukmscxma6wc_e` approved, `nid_qxt3z5unr9k220aqttbw84a6a_e` pending).
- Docs/process obligations at the end of each phase: update `CHANGELOG.md`, `README.md` if flags/commands change, and `docs-internal/migration-to-ts-high-level.md`'s checklist; run `make test` (green) and `make parity` (green) before committing; rollback = remove the name from `TS_COMMANDS`.
