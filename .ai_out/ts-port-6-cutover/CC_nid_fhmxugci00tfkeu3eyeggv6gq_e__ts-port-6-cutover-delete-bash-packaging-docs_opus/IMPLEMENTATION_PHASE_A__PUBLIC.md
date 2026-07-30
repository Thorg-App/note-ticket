# TS port 6 — PHASE_A (cutover: thin wrapper, delete bash, delete parity harness)

Ticket: `nid_fhmxugci00tfkeu3eyeggv6gq_e`. Scope here is PHASE_A only. Packaging (`pkg/`,
`scripts/publish-*.sh`) and docs (`README.md`, `CLAUDE.md`, `CHANGELOG.md`,
`docs-internal/migration-to-ts-high-level.md`) are untouched — PHASE_B.

Status: **done and green**. `make test` 257 scenarios / 427 unit tests, `make typecheck`
clean, cold-start install verified end to end.

---

## 1. `./ticket` is now a thin launcher (78 lines, zero ticket logic)

The 1664-line bash implementation is gone. What is left does exactly three things:

1. resolves its own directory **through symlinks** (`tk` on PATH is a symlink into the
   checkout; the bundle and sources sit next to the real file),
2. builds `dist/ticket.mjs` when it is missing **or older than any file under `src/`**
   (`find "$SOURCE_DIR" -newer "$BUNDLE" -print -quit` — one `find` on the hot path),
3. `TICKET_INVOKED_AS="$0" exec node "$BUNDLE" "$@"`.

Decisions worth knowing:

- **Every byte this script prints goes to stderr.** `_log`/`_fail` write to `>&2`, and the
  whole build subshell is `( … ) >&2`. `tk query | jq` and `tk ls | head` stay byte-clean on
  stdout even on the invocation that builds.
- **The build is `npm`, not `make`.** An installed box should not need GNU make. It runs
  `npm install --no-audit --no-fund --silent` only when `node_modules/.bin/esbuild` is
  missing, then `npm run --silent build`. (Consequence: the wrapper will NOT reinstall when
  `package.json` gains a dep — `make build`'s stamp rule still covers the dev path. Accepted,
  80/20.)
- **`node` is required up front**, checked before anything else, so a missing runtime is a
  clear message rather than a half-run. `npm` is required only on the build path.
- **A checkout with no `src/` cannot be stale** (`_bundle_is_stale` returns false), so a
  hypothetical bundle-only install still runs. With neither bundle nor sources the wrapper
  fails naming both paths.
- **A "successful" build that produced no bundle fails** rather than reaching `exec`.
- **No locking.** Concurrent invocations racing on one build are accepted per the ticket.

### What PHASE_B packaging must know

An installed `tk` needs these on disk, in one directory, to build on demand:

| Path | Why |
|---|---|
| `ticket` | the launcher itself (install as `tk`, or symlink `tk` → it; symlinks are resolved) |
| `src/` | the sources it builds from, and the staleness input |
| `package.json` | the `build` script and the devDependencies |
| `package-lock.json` | reproducible `npm install` |
| `tsconfig.json` | not used by esbuild, but keeps `npm run typecheck` usable on the box |
| `dist/` (writable) | the build target — **the install directory must be writable by the user**, or the first run fails |
| `node_modules/` | created by the wrapper's first `npm install` (needs network on first run) |

That list is also `TOOL_COPY_FILES` + `src/` in `features/steps/ticket_steps.py`, which is
what the wrapper BDD scenarios copy — keep the two in agreement.

Runtime deps are now **node, npm, git** (git for repo-root resolution) plus **jq** only for
`query <filter>`. bash is still needed for the launcher itself; `awk`/`sed`/`findutils` are
NOT — except `find`, which the staleness check uses. Homebrew/AUR PKGBUILD depends should be
`nodejs`, `npm`, `git`, `bash`, `findutils` (or coreutils per platform).

`$EDITOR`/`$PAGER`/`TICKET_PAGER`/`TICKETS_DIR`/`TICKET_INVOKED_AS` all behave as before.

---

## 2. Parity harness deleted

Removed: `scripts/parity/` (all 8 files incl. `__pycache__`), the `parity` target and
`PARITY_ARGS` in `Makefile`, the `build:parity` npm script, the `dist-parity/` gitignore
entry, `dist-parity/` on disk, `scripts/parity/*.ts` from the `tsconfig.json` include, and
the "Run bash-vs-TS parity harness" CI step.

Every code comment that pointed at `scripts/parity/README.md` (9 in `src/`, 4 in `test/`,
1 in `features/steps/`) now points at `docs-internal/migration-to-ts-high-level.md`.
**PHASE_B action:** the 19-item divergence whitelist must land in that doc, or those
pointers go stale. Recover the text with
`git show HEAD:scripts/parity/README.md` (section "Whitelisted divergences").

### Divergence folding table

Verdict per divergence: where the **TS side** is pinned now that the harness is gone.

| # | TS behavior | Already pinned by | Newly pinned by (this phase) |
|---|---|---|---|
| 1 | `dep cycle` finds real cycles only, all of them | `features/ticket_dependencies.feature` (both halves of the bash bug) | — |
| 2 | 3 distinct corrupt-file messages, CRLF blamed on line endings | `ticket_listing.feature` ×5, `ticket_query.feature`, `test/ticket-store.test.ts`, `test/frontmatter.test.ts` | — |
| 3 | `\|` in a title printed whole | `test/list-commands.test.ts` "a title containing the sort-key separator '\|'" (ready+blocked); `ticket_listing.feature` ready/blocked scenarios | `ticket_listing.feature` **"List shows a title containing a pipe in full"** (the `ls` gap the harness had byte-compared) |
| 4 | `--limit=` is a plain count or an error | `ticket_listing.feature` ×4, `test/list-commands.test.ts` `RowLimit` ×7 | `test/list-commands.test.ts` **"rejects head's leading plus"** (`+5` was pinned nowhere) |
| 5 | control char stays valid JSON | `ticket_query.feature` ×2, `test/query-command.test.ts` | `test/create-command.test.ts` **"prints a parseable JSON line for a title containing a tab"** (the value's BIRTH, previously only `check_write`) |
| 6 | `query <filter>` without jq: 127 + own message | BDD (PATH stripped of jq) | — |
| 7 | 141 on a broken pipe with large output, 0 with small | only an `ExitCode` constant test — **was unpinned end to end** | `ticket_listing.feature` **"A large listing into a short reader exits 141"** + **"…fits in the pipe buffer exits 0"**, via a new `piped into` step |
| 8 | `## Blocking` lists each ticket once; rows in path order | `test/dep-graph.test.ts` "lists a dependent once however often it names the target" (graph level only) | `test/graph-commands.test.ts` **"lists a dependent that names the target twice ONCE under Blocking"** + **"orders Blocking rows by enumeration order, not by id"** |
| 9 | id resolution: exact beats partial, empty matches nothing | BDD scenarios | — |
| 10 | `--design` with no value → clean usage error | `ticket_creation.feature` | — |
| 11 | newline in title → `line1line2.md`, escaped JSON | nothing (source comment only) | `test/slug.test.ts` case `["line1\nline2", "line1line2"]`; `test/create-command.test.ts` **"…parseable JSON line for a title containing a newline"** + **"drops a newline from the filename…"** |
| 12 | slug name taken by a DIRECTORY → `<slug>-1.md` | nothing (source comment only) | `test/create-command.test.ts` **"suffixes the filename when the slug is taken by a DIRECTORY"** |
| 13 | `deps`/`links` are whole-id arrays | BDD ×3 features | — |
| 14 | missing `deps:` field handled | 2 BDD scenarios | — |
| 15 | missing `links:` field created | 1 BDD scenario | — |
| 16 | edits confined to the frontmatter block | `ticket_links.feature` "A links line in the body is neither counted nor rewritten" | — |
| 17 | `link a a` refused; counts collapse | 2 BDD scenarios | — |
| 18 | `link` appends in argument order | unit test on `LinkClosure` + BDD | — |
| 19 | `$EDITOR` not on PATH → 127 naming it | `test/edit-command.test.ts` | — |

Nothing in the whitelist is now unpinned. The `diverges=True` cases (#5, #9–#17), which by
construction could never pin the TS side, are all covered by BDD or unit tests above.

### One divergence NOT folded, deliberately — new behavior, needs sign-off

`#QUESTION_FOR_HUMAN:` **the pinned "unknown command reports the missing tickets dir first"
quirk is gone, and I did not reproduce it.**

Measured before deleting anything, in a git repo with no `_tickets/`:

- bash `./ticket bogus` → `Error: tickets directory '…/_tickets' does not exist`, exit 1.
  It never says the command is unknown.
- TS `node dist/ticket.mjs bogus` → `Unknown command: bogus` + help on stderr, exit 1.

Nothing pinned the bash ordering — no BDD scenario, no unit test, not even a harness case;
only a sentence in `CLAUDE.md` and the migration doc. I judged it an accident of bash's
dispatch order (it resolved the tickets dir before the `case`), not a decision: an
unrecognized name is a usage problem and reproducing the quirk would mean deliberately
resolving a tickets directory the command will never read, to print a message about the
wrong thing. So the TS behavior now stands and is pinned by a new scenario,
`ticket_directory.feature` → **"An unknown command is reported without needing a tickets
directory"**, whose comment records the change. **If you want bash's ordering back, say so
and I will reproduce it explicitly** — it is a two-line change in `main.ts`, but it is a
deliberate un-improvement and I will not make it silently. PHASE_B should drop the
"pinned behavior" sentence from `CLAUDE.md` either way.

---

## 3. BDD for the wrapper — `features/ticket_wrapper.feature` (4 scenarios)

Scenarios run against an **isolated copy** of the tool under `$REPO/.tmp/` (wrapper +
manifests + `src/`, with `node_modules` SYMLINKED so the build needs no network). WHY a
copy: these scenarios delete and back-date the bundle, and doing that to the developer's own
`dist/` would break every other scenario and leave the working tree without a build. The copy
is removed in `after_scenario`, and `context.ticket_script_override` (reset per scenario in
`environment.py`) is what redirects `When I run "ticket …"` to it — no scenario order
dependency, nothing mutated outside `.tmp/`.

WHY `$REPO/.tmp` and not the system temp dir: it is mounted `noexec` in this dev container
and the copy's `ticket` is executed. (First run of these scenarios failed with exit 126,
exactly as project memory warned.)

The stale/fresh arms use a **marker bundle** (`process.stdout.write("MARKER BUNDLE\n")`) with
a back-dated or forward-dated mtime, so "did the wrapper rebuild?" is answerable from stdout
alone.

1. *A missing bundle is built on the first invocation* — succeeds, bundle exists and is not
   the marker, **stdout is exactly the one `ls` row** (line count 1), chatter is on stderr.
2. *A bundle older than the sources is rebuilt* — no `MARKER BUNDLE` in the output.
3. *A bundle newer than the sources is run as it is* — output IS `MARKER BUNDLE` (pins the
   hot path: no rebuild when current).
4. *A missing node is reported, and nothing reaches stdout* — exit non-zero, message on
   stderr, stdout empty.

### Mutation table (every new guard proved non-vacuous)

| # | Mutation | Killed by | Result |
|---|---|---|---|
| M1 | `_bundle_is_stale` never consults `find` (existence only) | wrapper scenario 2 | ✅ only that one |
| M2 | `_log` + build subshell write to stdout | wrapper scenario 1 (line count 1 → more) | ✅ only that one |
| M3 | `_bundle_is_stale` always true (always rebuild) | wrapper scenario 3 | ✅ only that one |
| M4 | `BrokenPipe.reportAsSignalDeath()` removed | `ticket_listing.feature` "A large listing … exits 141" (got 1) | ✅ |
| M5 | `activeDependents` emits one row per `deps` ENTRY (bash behavior) | new `show` Blocking-dedup test (+ the pre-existing `DepGraph` one) | ✅ |
| M6 | `activeDependents` sorted by id | new "orders Blocking rows by enumeration order" test | ✅ |
| M7 | `topLevelFileExists` back to `[[ -f ]]` semantics | new DIRECTORY-collision test | ✅ |
| M8 | `Slug` keeps a newline (bash `sed` behavior) | new slug case + `create` filename test | ✅ |

M4 also incidentally proved the wrapper's staleness path end to end in the real repo: editing
`src/cli/main.ts` made the next `./ticket` invocation rebuild with no manual `make build`.

---

## 4. CI (`.github/workflows/test.yml`)

- Parity step deleted.
- **New first step, "Smoke-test the build-on-demand install path"**, running on a checkout
  with **no `dist/` and no `node_modules/`** (asserted, so it can never silently go warm):
  symlinks `tk` into `$HOME/bin`, runs `tk help`, and greps line 1 of stdout for
  `tk - minimal ticket system with dependency tracking`. That single line proves three things
  at once — stdout uncontaminated by build chatter, symlink resolution to the checkout, and
  `$0` reaching the CLI as the program name. It must stay BEFORE `make test`, which builds.
- `make test` still runs the whole BDD suite against `./ticket`, i.e. the wrapper.
- Added a `make typecheck` step (it was not in CI before).

## 5. Makefile / package.json — `make test` still depends on `build`

Deliberate, recorded as a comment on the target. WHY keep it even though the wrapper builds
on demand: a broken build must surface as a **build failure**, not as a puzzling failure
inside whichever scenario shells out first; and it keeps ~250 scenarios off the build path
entirely. The on-demand path is not left untested — `ticket_wrapper.feature` exercises it
against an isolated copy, and CI smoke-tests a genuinely cold checkout before `make test`
runs. `build`, `unit-test`, `typecheck` unchanged.

## 6. Cold-start verification (manual, end to end)

A copy of the working tree with **no `.git`, no `dist/`, no `node_modules/`**, `git init`ed,
with `tk` a **symlink** from a separate bin dir on PATH:

| Step | Result |
|---|---|
| `tk help` | rc 0; stdout line 1 `tk - minimal ticket system…` (program name from the symlink); build chatter (`ticket: building …`, esbuild summary) entirely on stderr; `dist/ticket.mjs` created |
| `tk create "Cold start ticket"` | rc 0, JSON line on stdout, stderr empty, assignee from `git config user.name` |
| `tk ls` | rc 0, stderr empty, stdout starts with the id (verified with `od -c`) |
| `tk query \| jq -c .` | rc 0, valid JSON through jq, stderr empty |
| `touch src/core/ticket.ts` then `tk ls` | rebuilt (one stderr line), stdout byte-identical to before |
| `tk ls` again | stderr empty — no rebuild on the hot path |

Gotcha for whoever repeats this: this shell has a `tk` **function** that shadows the PATH
lookup; use `env PATH="$BIN:$PATH" tk …`, or the test silently exercises the installed tool.

## 7. Acceptance

- `git grep -E '^\s*cmd_[a-z_]+\(\)'` (excluding `.ai_out/`, `_tickets/`, `_change_log/`
  archives): **none**.
- No awk-based ticket logic: the only `awk` hits outside markdown are comments in `src/` and
  `test/` describing what bash used to do, plus `pkg/aur/…/PKGBUILD` (PHASE_B) and
  `.github/workflows/release.yml`.
- Bash left in the repo: `ticket` (the launcher), `scripts/publish-{aur,homebrew}.sh`
  (PHASE_B), `test.sh` / `test_pre_push.sh` (dev glue, no ticket logic).
- `make test` green (257 scenarios, 1708 steps; 427 unit tests). `make typecheck` green.

---

## Open items / State

Working tree left dirty and uncommitted, as instructed. No `change_log` entry written, ticket
not closed.

**PHASE_B must pick up:**

1. `CLAUDE.md` architecture section: still describes the bash script, `TS_COMMANDS`,
   `TS_DEP_SUBCOMMANDS`, the `cmd_*` differential oracle, `make parity` and
   `scripts/parity/` — all gone. Also drop the "unknown command reports the missing tickets
   dir BEFORE the help — pinned behavior" sentence (see §2).
2. `docs-internal/migration-to-ts-high-level.md`: Distribution section still recommends
   committing `dist` at release tags (superseded), and it must now carry the divergence
   whitelist, because 14 code comments point at it. Recover from
   `git show HEAD:scripts/parity/README.md`.
3. `README.md` / `ORIGINAL_README.md`: dependency list (bash/git/sed/awk/find + ripgrep) is
   wrong; it is node/npm/git/bash/find now, with jq for `query <filter>`, and first run
   builds. `.github/workflows/release.yml` mentions awk — check it.
4. Packaging per §1's table, including the **install directory must be writable** and
   **network on first run** constraints the ticket already called out.
5. `CHANGELOG.md` entry.

**Non-blocking follow-ups I did not take (no ticket created; say the word and I will):**

- The wrapper reinstalls `node_modules` only when `esbuild` is absent, so a changed
  `package.json` does not trigger `npm install` on an installed box. Harmless today (one
  devDep set), would matter if deps churn.
- The `find src -newer` check costs one `find` per invocation (~2 ms here). Fine.
