# TS port 6 — PHASE_A (cutover: thin wrapper, delete bash, delete parity harness)

Ticket: `nid_fhmxugci00tfkeu3eyeggv6gq_e`. Scope here is PHASE_A only. Packaging (`pkg/`,
`scripts/publish-*.sh`) and docs (`README.md`, `CLAUDE.md`, `CHANGELOG.md`,
`docs-internal/migration-to-ts-high-level.md`) are untouched — PHASE_B.

Status after **ITERATION_A** (review `IMPLEMENTATION_REVIEW_A__PUBLIC.md` on commit `42ccf92`):
**done and green**. `make test` **261 scenarios** / **429 unit tests**, `make typecheck`
clean, cold-start install re-verified end to end. The blocking finding (B1) is fixed; the
incorporated/rejected table for every review item is in §8.

**Owner-approved behavior change (2026-07-30, ticket `nid_fhmxugci00tfkeu3eyeggv6gq_e`):**
`tk <unknown>` reports `Unknown command: <name>` + help regardless of whether a tickets
directory exists. bash resolved the tickets directory first and answered with
`tickets directory '…' does not exist`; that ordering was an artifact of its `case` default
arm, not a decision, and is dropped. Recorded here in the whitelist's own sign-off convention
so PHASE_B can carry it into `CLAUDE.md` and `CHANGELOG.md`. Pinned by
`ticket_directory.feature` → "An unknown command is reported without needing a tickets
directory".

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
| 7a | 141 on a broken pipe with large output, 0 with small (`BrokenPipe`'s EPIPE listener) | only an `ExitCode` constant test — **was unpinned end to end** | `ticket_listing.feature` **"A large listing into a short reader exits 141"** + **"…fits in the pipe buffer exits 0"**, via a new `piped into` step |
| 7b | a SIGNALLED `jq` child surfaces as 128+SIGPIPE (`ChildExit.codeOf`, a different code path) | nothing — **missed in the first pass; found by review (B1)** | `ticket_query.feature` **"A large filtered query into a short reader adopts jq's signal death"** |
| 8 | `## Blocking` lists each ticket once; rows in path order | `test/dep-graph.test.ts` "lists a dependent once however often it names the target" (graph level only) | `test/graph-commands.test.ts` **"lists a dependent that names the target twice ONCE under Blocking"** + **"orders Blocking rows by enumeration order, not by id"** |
| 9 | id resolution: exact beats partial, empty matches nothing | BDD scenarios | — |
| 10 | `--design` with no value → clean usage error | `ticket_creation.feature` | — |
| 11 | newline in title → `line1line2.md`, escaped JSON | nothing (source comment only) | `test/slug.test.ts` case `["line1\nline2", "line1line2"]`; `test/create-command.test.ts` **"…parseable JSON line for a title containing a newline"** + **"drops a newline from the filename…"** |
| 12 | slug name taken by a DIRECTORY → `<slug>-1.md` | nothing (source comment only) | `test/create-command.test.ts` **"suffixes the filename when the slug is taken by a DIRECTORY"** |
| 13 | `deps`/`links` are whole-id arrays | BDD ×3 features (substring/removal halves) | the **non-array scalar** sub-case (`deps: foo` ⇒ `[foo, <id>]`) was pinned nowhere — found by review (I2) — now `test/ticket-relations.test.ts` **"reads a scalar value as a single-element relation"** + **"re-serializes a scalar value as an array when adding to it"** |
| 14 | missing `deps:` field handled | 2 BDD scenarios | — |
| 15 | missing `links:` field created | 1 BDD scenario | — |
| 16 | edits confined to the frontmatter block | `ticket_links.feature` "A links line in the body is neither counted nor rewritten" | — |
| 17 | `link a a` refused; counts collapse | 2 BDD scenarios | — |
| 18 | `link` appends in argument order | unit test on `LinkClosure` + BDD | — |
| 19 | `$EDITOR` not on PATH → 127 naming it | `test/edit-command.test.ts` | — |

**Correction (ITERATION_A).** The first version of this report claimed "Nothing in the
whitelist is now unpinned". That was **inaccurate**: #7 names two harness pins and I had
folded only the `ls` one, and #13's scalar sub-case was marked "already pinned" when it was
not. Both are fixed above (rows 7b and 13). As of this iteration every whitelist entry,
including every sub-case the whitelist text names explicitly, has a BDD or unit pin — the
`diverges=True` cases (#5, #9–#17), which by construction could never pin the TS side,
included.

### The behavior change, now approved

`#QUESTION_FOR_HUMAN:` **RESOLVED — owner said keep the TS behavior (2026-07-30).** Approval
recorded at the top of this document in the whitelist's sign-off convention. The reasoning
below is kept because PHASE_B needs it for the CHANGELOG entry.

**The bash "unknown command reports the missing tickets dir first" quirk is gone, and I did
not reproduce it.**

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
directory"**, whose comment records the change. PHASE_B must drop the "pinned behavior"
sentence from `CLAUDE.md` and add the change to `CHANGELOG.md`.

---

## 3. BDD for the wrapper — `features/ticket_wrapper.feature` (7 scenarios)

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
5. *A missing npm is reported when a build is needed* (ITERATION_A / I1) — the other half of
   "missing `node`/`npm` → clear failure".
6. *A failed build is reported and the stale bundle is not run* (ITERATION_A / I1) — a
   corrupt source file in the isolated copy; the marker bundle it decided was stale must NOT
   appear on stdout. This pins the "must not reach `exec`" guard, previously inspection-only.
7. *A copy without sources is reported, not silently served* (ITERATION_A / S2) — see §7.

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
| M9 | `ChildExit.codeOf` returns 1 instead of `128+signal` | `ticket_query.feature` "…adopts jq's signal death" (got 1) | ✅ ITERATION_A |
| M10 | `_require_command npm` dropped from `_build_bundle` | wrapper scenario 5 | ✅ only that one, ITERATION_A |
| M11 | build failure swallowed (`\|\| true`) so `exec` still runs | wrapper scenario 6 | ✅ only that one, ITERATION_A |
| M12 | `Frontmatter.getArray` reads a non-`[…]` value as empty | both new `TicketRelation` scalar tests | ✅ ITERATION_A |
| M13 | missing `src/` degrades silently (`return 1`, the arm the reviewer flagged) | wrapper scenario 7 | ✅ only that one, ITERATION_A |

The reviewer independently reproduced M1, M2, M4 and M7 and confirmed each is killed by
exactly one test. M4 also incidentally proved the wrapper's staleness path end to end in the real repo: editing
`src/cli/main.ts` made the next `./ticket` invocation rebuild with no manual `make build`.

---

## 3b. Wrapper changes made in ITERATION_A

- **`</dev/null` on the build subshell** (S3). The build must never consume the caller's
  stdin — it belongs to the command being launched. Was incidentally fine; now guaranteed.
  Verified on a cold tree: `printf 'note' | tk add-note <id>` with `dist/` deleted still
  records the piped note.
- **`src/` is now required, loudly** (S2). The old `[[ -d "$SOURCE_DIR" ]] || return 1` arm
  made a source-less tree silently "never stale", i.e. it would serve whatever `dist/` held
  forever. Distribution is build-from-source, so that is not a supported install shape:
  `_bundle_is_stale` now fails with `no sources at [...]; this is not a complete install of
  the tool`. This also DRYs the check — `_build_bundle`'s own `-d` test is gone, there is one
  place that says sources are required — and turns an unreachable, inspection-only branch
  into a state pinned by wrapper scenario 7.
- **A comment on `_bundle_is_stale` recording the future-mtime behavior** (S1): a source file
  dated in the future rebuilds on every invocation, forever. Left as-is deliberately (a stamp
  file recording the newest source mtime already built would be the real fix, and that is
  more state than a single-user tool warrants); the comment names the symptom and the escape
  hatch (`touch src/**`) so nobody rediscovers it under a deadline.

## 4. CI (`.github/workflows/test.yml`)

- Parity step deleted.
- **New first step, "Smoke-test the build-on-demand install path"**, running on a checkout
  with **no `dist/` and no `node_modules/`** (asserted, so it can never silently go warm):
  symlinks `tk` into `$HOME/bin`, runs `tk help`, and greps line 1 of stdout for
  `tk - minimal ticket system with dependency tracking`. That single line proves three things
  at once — stdout uncontaminated by build chatter, symlink resolution to the checkout, and
  `$0` reaching the CLI as the program name. It must stay BEFORE `make test`, which builds.
- The smoke test also `git init`s a scratch repo and runs `tk create` + `tk ls` there
  (ITERATION_A / S6), so git-based tickets-dir resolution is covered on a cold box too —
  `help` is the one command that needs no tickets directory.
- `make test` still runs the whole BDD suite against `./ticket`, i.e. the wrapper.
- Added a `make typecheck` step (it was not in CI before), placed **before** `Run tests`
  (ITERATION_A / I4): it is the fastest gate, and a BDD failure must not hide type errors.
  WHY-NOT `if: !cancelled()` — ordering solves it outright, with no second failing step to
  read past.

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
| `rm -rf dist` then `printf 'note' \| tk add-note <id>` | rc 0, the note IS recorded — the build subprocess does not eat the caller's stdin (re-run in ITERATION_A after the `</dev/null` change) |

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
- `make test` green (**261 scenarios**, 1729 steps; **429 unit tests**). `make typecheck` green.

---

## 8. ITERATION_A — every review item, incorporated or rejected

| Item | Decision | What was done / why not |
|---|---|---|
| **B1** #7 folded only half-way; report claimed otherwise | **Incorporated** | `ticket_query.feature` "A large filtered query into a short reader adopts jq's signal death"; mutation M9 (`ChildExit` ignores the signal) kills it. Folding table now has rows 7a/7b, and the inaccurate "nothing unpinned" sentence is corrected in place. |
| **I1** npm-missing and build-failure arms untested | **Incorporated** | Two wrapper scenarios (5, 6). The build-failure one also pins that the stale bundle is NOT exec'd. Mutations M10, M11. |
| **I2** #13's scalar `deps:` sub-case unpinned | **Incorporated** | Two `test/ticket-relations.test.ts` cases; mutation M12 kills both. Folding table row 13 corrected — it was wrongly marked "already pinned". |
| **I3** 14 comments point at a doc that lacks the whitelist | **Incorporated as a PHASE_B spec, not a code change** | Coordinating rather than duplicating: the exact required content is in "PHASE_B must pick up" item 2 below. Comments keep pointing at the doc — re-pointing them anywhere else would just have to be undone. |
| **I4** typecheck after tests, no `!cancelled()` | **Incorporated** | Moved **before** `Run tests`. Ordering beats `!cancelled()`: the fastest gate reports first and there is no second failing step to scroll past. |
| **S1** future-dated source rebuilds forever | **Incorporated as a comment; behavior unchanged** | Agreed with the reviewer's own 80/20 call. Comment on `_bundle_is_stale` names the trigger, the real fix (a newest-mtime stamp) and the escape hatch. |
| **S2** unreachable `src/`-absent arm | **Incorporated, as "fail loudly" rather than "delete"** | Deleting the arm outright would let `find` fail and spray a shell error on stderr. Instead the arm now `_fail`s, which removes the silent-degradation state (the reviewer's actual objection), DRYs the check into one place, and is pinned by wrapper scenario 7 + mutation M13. |
| **S3** build subshell inherits stdin | **Incorporated** | `( … ) >&2 </dev/null`. Re-verified cold with a piped `add-note`. |
| **S4** node_modules symlink precondition; `tool_dir` leak | **Incorporated** | `_isolated_tool_copy` now asserts the developer's `node_modules` exists (naming `make build` in the message) instead of letting npm write THROUGH a dangling symlink into the real tree, and registers `tool_dir` before the copy so a mid-copy failure is still cleaned up. |
| **S5** `TOOL_COPY_FILES` is a de-facto packaging manifest | **Rejected as a code change here; handed to PHASE_B** | Pre-solving packaging in a test file is the wrong direction. PHASE_B's instruction is in "PHASE_B must pick up" item 4. |
| **S6** smoke test only covers `tk help` | **Incorporated** | CI smoke now also `git init`s a scratch repo and runs `tk create` + `tk ls`, asserting one row. |
| Reviewer note: symlink resolution is NEW behavior, not preserved | **Incorporated as a PHASE_B note** | Correct — the old `_exec_ts` resolved the directory but not a symlinked script FILE, so `ln -s /checkout/ticket ~/bin/tk` would have failed. Added to the CHANGELOG instruction below. |
| Reviewer micro-notes: `_fail` exits 1 like the CLI; `CDPATH` in `_script_dir` | **Rejected**, as the reviewer suggested | A distinct launcher exit code is not worth the surface, and every reachable `dirname` result here is absolute or `.`, both of which bypass `CDPATH`. |

## Open items / State

Working tree left dirty and uncommitted, as instructed. No `change_log` entry written, ticket
not closed.

**PHASE_B must pick up:**

1. `CLAUDE.md` architecture section: still describes the bash script, `TS_COMMANDS`,
   `TS_DEP_SUBCOMMANDS`, the `cmd_*` differential oracle, `make parity` and
   `scripts/parity/` — all gone. Also drop the "unknown command reports the missing tickets
   dir BEFORE the help — pinned behavior" sentence (see §2; the owner approved dropping it).
2. **`docs-internal/migration-to-ts-high-level.md` — the one blocking doc dependency.**
   14 comments in `src/`, `test/` and `features/steps/` now cite this file for the divergence
   rationale, and the text is currently only in git history. It must gain:
   - a **"Deliberate divergences from bash"** section carrying whitelist entries **#1–#19
     verbatim**, keeping the numbering (comments cite `#3`, `#4`, `#8`, `#9`, `#11`, `#12`,
     `#13` by number) — recover with `git show 42ccf92^:scripts/parity/README.md`, section
     "Whitelisted divergences";
   - a preamble noting the harness that produced them is deleted, so each entry's "pinned by
     `check_*`" clause should be re-read as "pinned by the BDD/unit test named in
     `IMPLEMENTATION_PHASE_A__PUBLIC.md` §2";
   - **#20**, the newly approved unknown-command change (see the top of this document);
   - Distribution section rewritten: it still recommends committing `dist` at release tags,
     which is superseded by build-on-demand.
3. `README.md` / `ORIGINAL_README.md`: dependency list (bash/git/sed/awk/find + ripgrep) is
   wrong; it is node/npm/git/bash/find now, with jq for `query <filter>`, and first run
   builds. `.github/workflows/release.yml` mentions awk — check it.
4. Packaging per §1's table, including the **install directory must be writable** and
   **network on first run** constraints the ticket already called out. **Make one side the
   source of truth for the install manifest**: `TOOL_COPY_FILES` in
   `features/steps/ticket_steps.py` (+ `src/`) is the same list `pkg/` will need, and two
   copies will drift. Cheapest resolution: have the PKGBUILD/formula install exactly that set
   and leave a comment in each naming the other — or, if you prefer one owner, move the list
   into a small file both read.
5. `CHANGELOG.md` entry. Two items are behavior changes, not just refactors:
   **(a)** `tk <unknown>` now says `Unknown command` instead of reporting a missing tickets
   directory (owner-approved, above); **(b)** the launcher resolves a symlinked script FILE,
   which the old shim did not — `ln -s /checkout/ticket ~/bin/tk` used to look for
   `~/bin/dist/ticket.mjs` and fail, so this is what makes symlink installs viable.

**Non-blocking follow-ups I did not take (no ticket created; say the word and I will):**

- The wrapper reinstalls `node_modules` only when `esbuild` is absent, so a changed
  `package.json` does not trigger `npm install` on an installed box. Harmless today (one
  devDep set), would matter if deps churn.
- The `find src -newer` check costs one `find` per invocation (~2 ms here). Fine.
- A future-dated source file rebuilds on every invocation (S1) — documented in the code,
  deliberately not fixed.
