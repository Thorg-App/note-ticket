# IMPLEMENTATION_REVIEWER_PHASE_A__PRIVATE — working memory

Reviewed the uncommitted tree vs `85b30a0`. Read-only w.r.t. source; all scratch under
`.tmp/rev/`. Tree left pristine (`git status --short` identical before/after) and
`make build` re-run at the end.

## Tooling I built (reusable)

- `.tmp/rev/bash-ref` — copy of `ticket` with `TS_COMMANDS` and `TS_DEP_SUBCOMMANDS`
  rewritten to `""` via `re.subn(..., count=1)` with an `assert n == 1` per variable (the
  same technique as `scripts/parity/harness.py:22-66`).
- `.tmp/rev/bashbin/tk` = that copy; `.tmp/rev/tsbin/tk` = a **copy** of `ticket` plus a
  `dist` symlink into the repo. WHY a copy and not a symlink to `./ticket`: `_exec_ts`
  resolves `script_dir` as `cd "$(dirname "${BASH_SOURCE[0]}")" && pwd -P`, which resolves
  the *directory*, not the symlinked file, so a symlink made the bundle unfindable. Both
  sides being named `tk` is what makes `$(basename "$0")` usage lines comparable.
- `.tmp/rev/differ.py` — the write-command differential harness the project does NOT have:
  builds two identical `git init` repos, runs a command sequence on each with
  `stdin=DEVNULL` + `LC_ALL=C`, then compares stdout+stderr+rc per command **and a dump of
  every file under `_tickets/`**, with `nid_[a-z0-9]{25}_e` mapped to `<IDn>` in
  first-appearance order, ISO stamps to `<TS>`, and the repo root to `<ROOT>`.
  63 cases. `python3 .tmp/rev/differ.py [substring]`.
- `.tmp/rev/mutate.py` — patches one source file, runs `npm test`, `make build` + `behave`,
  and the differ; reports which gate caught it. Restores the file in a `finally` and
  rebuilds at the end.
  **Harness bug I hit and fixed**: I first ran behave as `behave 2>&1 | tail -40`, so the
  pipeline exit code was `tail`'s and every mutation looked BDD-green. Re-ran the six
  apparent escapes without the pipe. Worth remembering — it is the same class of mistake as
  the repo's documented vacuous-test history.

## Gates (independently run, logs in `.tmp/`)

`rev-typecheck.log` rc=0 · `rev-unit.log` rc=0 (323 pass) · `rev-bdd.log` rc=0 (12 features,
226 scenarios) · `rev-parity.log` rc=0 (graph 71 scenarios, query, slug 13 titles).
Matches the implementer's claims exactly.

## Differential results

61 of 63 shapes byte-identical (files AND streams). Non-identical:

| case | verdict |
|---|---|
| `create x --design` | declared divergence #10; bash `.../tk: line 308: $2: unbound variable`, both rc=1, both leave `_tickets/` created → #10's text is ACCURATE |
| `create $'tab\there …'` | declared divergence #5 (bash emits a raw tab = invalid JSON) |
| `close ""` / `status "" closed` | declared divergence #9; bash says `ambiguous ID ''`, TS `ticket '' not found`; **both mutate nothing** — verified in the tree dump |
| `create $'line1\nline2'` | UNDECLARED: bash names the file `line1<LF>line2.md`, TS `line1line2.md`. Root cause: bash's `sed 's/[^a-z0-9-]//g'` is line-oriented so the LF survives; `Slug.fromTitle`'s regex deletes it. `HOSTILE_TITLES` has no LF so `check_slug.py` cannot see it. Bash also emits invalid JSON here. |
| `_tickets/dup.md` is a DIRECTORY | UNDECLARED: bash `[[ -f ]]` is false → `> dir` fails `Is a directory`, rc=1; TS `existsSync` is true → writes `dup-1.md`, rc=0. Pathological. |
| `git config user.name = "  Padded Name  "` | UNDECLARED: bash writes `assignee:   Padded Name  `, TS writes `assignee: Padded Name` (`Git.output().trim()`). The WHY comment in `git.ts:28-33` claims parity with command substitution, which only strips trailing newlines. |

Ruled out / confirmed identical (worth not re-checking): multiple positionals (last wins),
unknown option wording+rc, `create --bogus` still leaving the dir, quote escaping, unicode,
empty title → `Untitled` + `untitled.md`, empty `--tags` omitting the line, `--tags 'a,b , c'`
→ `[a, b ,  c]`, single tag, three-way slug collision (`-1`,`-2`), every optional field in
order, `-a ""`, `--parent` partial/ambiguous/unresolvable/empty, unvalidated `-p high`, bare
`-`, `--`, no-git-repo message pair, `TICKETS_DIR` pointing at a missing path, all `status`
usage/validation paths, close→close, close→reopen (`closed_iso` gone), reopen of an
already-closed fixture, closing a ticket that LACKS `status_updated_iso`/`closed_iso`
(insert lands first on both sides), nested ticket edited in place, unknown/ambiguous/
whitespace ids, extra args ignored, exact-beats-partial, `start|close|reopen` with no args,
create from a subdirectory, nested same-slug file (bash only checks top level — TS matches),
250-char truncation, punctuation-only titles, multiline description, `-d '---'`,
`--tags 'a],b'`, repeated flags, `-a 'he "said"'`, `--external-ref` alone, legacy
`status: done` close/reopen, relative `TICKETS_DIR` for both create and status,
`git config user.name` unset → `assignee` line omitted on both sides.
Symlinked ticket + `close` checked by hand: both sides replace the symlink with a regular
file and leave the target untouched — no regression, matches `_sed_i`.

## Mutation results (my own list, 20 mutations)

CAUGHT: M3 append-instead-of-prepend (unit), M4 flag-with-no-value (unit), M5 empty-title
fallback (unit), M7 `closed_iso` never removed (unit), M8 `status_updated_iso` not restamped
(unit), M9 `external-ref` misspelled (unit), M10 tags not re-spaced (unit+bdd), M12 title
quotes unescaped (unit), M18 body's leading blank line dropped (unit), M2 validate-after-
resolve (bdd), M6 write commands may mkdir (bdd), M14 fractional seconds kept (bdd),
M20 slug collision ignored (bdd).

ESCAPED unit + BDD (only my differ saw them):
- **M1** `assignee: options.assignee ?? ""` — the git-config default silently gone.
- **M13** `parentId → return parent` — `--parent` no longer normalised to the full id and an
  unresolvable parent no longer aborts. `features/ticket_creation.feature:46-50` passes
  because the fixture id `parent-001` is used as an EXACT id, so typed == full: vacuous for
  the property it looks like it covers.
- **M15** `ProgramName.invoked` returning the literal `ticket` — structurally invisible to
  BDD (the suite always invokes `./ticket`, whose basename IS `ticket`) and `ProgramName`
  has no unit test; the status usage tests inject `"tk"` through `CommandEnvironment` and
  never exercise the resolver.
- **M16** no trailing newline after `create`'s JSON line.
- **M19** `Updated ${search}` instead of `${ticket.id}` — the full-id echo is unpinned.

Note M11 (`if (false && invokedAs)`) LOOKED caught by BDD, but only because it fell through
to `basename(argv[1])` = `ticket.mjs`. The honest hardcode (M15) escapes. Do not count M11.

## Things I checked and decided were fine

- `src/core/{clock,git}.ts` contain no argv/console/formatting → core stays CLI-free.
- `main.ts` evaluates `StoreResolver.forCreateCommand()` (mkdir) before `CreateCommand.run`
  parses, reproducing bash's `ensure_dir`-before-parse order; pinned by my differ case
  `create: unknown option leaves dir` (no repo pin, but M17 wasn't needed — see M6/BDD).
- The single-clock-read "refinement" cannot regress: `StatusUpdate.applied(t, status, now)`
  takes `now` as a parameter, so there is only one reading by construction.
- `save()`'s write-then-rename matches `_sed_i`'s durability and its symlink-clobbering.
- No `any`, no new runtime deps, no vitest, strict TS, named constants throughout.
- `LINE_SEPARATOR = "\n"` is now defined in 6 modules — trivial local constant, not worth a
  finding beyond a NIT.
- CHANGELOG.md's Unreleased entry enumerating delegated commands is now stale.
