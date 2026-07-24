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

## Iteration 2 — response to `IMPLEMENTATION_REVIEW__PUBLIC.md`

All 8 review items (2 BLOCKING, 6 SHOULD-FIX) and the one NICE-TO-HAVE worth doing were
**accepted**; one (S5) was accepted in a modified form. Nothing was rejected outright.
Red-then-green throughout: 6 new scenarios failed against the iteration-1 script, then passed.

The whole fix is concentrated in `_collect_ticket_files` — the single source of truth that
iteration 1 introduced paid off here: B1, B2, S1, S5 and S6 are all one enumeration rule.

```bash
find -L "$TICKETS_DIR" -mindepth 1 -name '.*' -type d -prune -o -type f -name '*.md' -print0 \
  | LC_ALL=C sort -z
```

| Item | Verdict | What was done / why |
|------|---------|---------------------|
| **B1** symlinked `_tickets` finds zero tickets | **Accepted** | `find -L`. Real regression — the old glob resolved through the symlink. Two scenarios (`ls`, `show` through a symlinked `_tickets`). |
| **B2** `ls`/`query` order regressed to filesystem order | **Accepted** | `LC_ALL=C sort -z` (NUL-safe, so it keeps the filename robustness). Per TOP_LEVEL decision the pre-change alphabetical order is contractual. Two scenarios lock the order, chosen so that path order ≠ creation order ≠ ID order (`_tickets/alpha…`, `_tickets/backend/zebra…`, `_tickets/mango…`). |
| **S1** `-type f` drops symlinked ticket files | **Accepted** | Subsumed by `-L`; covered by its own scenario (ticket file moved outside `_tickets` and symlinked back). |
| **S2** `cmd_show` had no empty-array guard | **Accepted** | Guard added, and it **errors** (`Error: ticket '<id>' not found`, exit 1) rather than returning 0 — a silent success there would be indistinguishable from a ticket with no relations. |
| **S3** `cmd_closed` `recent_files` could be empty | **Accepted** | `(( ${#recent_files[@]} )) || return 0` added. |
| **S4** two scenarios did not discriminate old vs new | **Accepted** | `blocked` now asserts the rendered blocker `<- [nest-0001]`, `ready` asserts the root dep IS listed while the blocked nested one is not; plus two new scenarios asserting the transition after closing the dependency (blocked drops it, ready gains it). 4 scenarios where there were 2. |
| **S5** `find … 2>/dev/null` swallows real errors | **Accepted, modified** | Suppression removed, but only after `[[ -d "$TICKETS_DIR" ]] || return 0` — a missing tickets dir is a normal state already handled by callers with a proper message, so it must not become find noise. Verified by hand: a permission-denied subdirectory now prints `find: '…/secret': Permission denied` while the rest still lists. Not BDD-covered (a chmod-000 fixture is flaky under root/CI). |
| **S6** hidden subdirectories traversed | **Accepted (prune)** | Chose pruning over documenting-only: a `.trash/` entry resurfacing as an open ticket is a correctness problem, not a documentation problem. `-mindepth 1` is load-bearing — without it a dot-named `TICKETS_DIR` (e.g. `TICKETS_DIR=.tickets`, which the CHANGELOG still advertises) would prune its own root and find nothing. Verified by hand plus a scenario. |
| **NTH** `local f` leaking | **Accepted** | Added in both read loops (`_collect_ticket_files`, `cmd_closed`). |
| **NTH** `show` traverses twice | **Not done** | Correctness is now guarded (S2); the optimization needs `ticket_path` to return through a temp file or global. Real cost only at ticket counts we do not have. Unchanged from iteration 1's assessment. |
| **NTH** newline-in-filename note in `closed` | **Accepted** | WHY-NOT comment added at the `ls -t` loop so the asymmetry with the NUL-safe helper is discoverable. |
| **NTH** macOS/bash 3.2 unverifiable here | **Acknowledged, open** | `-L`, `-mindepth`, `-prune`, `-print0` and `sort -z` are all present in BSD/macOS find and sort, but this sandbox has GNU only. Still an untested assumption; a macOS CI job would retire it. |

### The awk-reads-stdin risk is now locked down

> **Correction (iteration 3): the claim below was wrong as written in iteration 2.** The step used
> `stdin=subprocess.PIPE` + `communicate()`, which closes the child's stdin immediately, so the
> scenarios could not observe a hang. Fixed in iteration 3 — see that section for the harness and the
> mutation proof. The description below is accurate as of iteration 3.

`awk 'prog'` with no file operands reads stdin, so an unguarded empty array means a hang on a
terminal (or a silent empty success under a redirect). New step `I run "…" with stdin left open`
runs the command with a **live, never-written stdin pipe** and a 20s timeout, so a hang fails the
run instead of stalling CI. A `Scenario Outline` applies it to `ls`, `ready`, `blocked`, `closed`,
`query` on an empty tree, plus one for `show`. Honest limitation: the `show` guard (S2) itself is a
TOCTOU window that no deterministic test can enter — it is covered by inspection; the scenario only
proves `show` errors and does not block when there are no tickets at all.

### Iteration 2 test results

| Point | Features | Scenarios | Steps |
|-------|----------|-----------|-------|
| Iteration 1 end (`ca810fe`) | 12 passed, 0 failed | 153 passed, 0 failed | 1040 |
| Iteration 2 RED (`5ec302f`) | 11 passed, **1 failed** | 161 passed, **6 failed** | 1127 passed, 6 failed |
| **Iteration 2 final** | **12 passed, 0 failed** | **167 passed, 0 failed** | **1137 passed, 0 failed** |

Pre-existing scenarios: 131 → 131, unbroken. Nested-folder scenarios: 22 → 36
(+6 new behaviors, +6 stdin-safety, S4 split 2 → 4). Log: `.tmp/test2.out`.

Docs updated for the newly explicit rules (path ordering, hidden dirs, symlinks): `ticket help`
footer, `README.md`, `ORIGINAL_README.md`, CHANGELOG `[Unreleased] / Added` bullet.

## Open questions

None blocking. Two optional follow-ups worth a ticket if the human agrees:

1. **`create --folder <path>`** — the ticket explicitly deferred it. Users currently create at the
   root and `mv`. Worth doing only if the mv step proves annoying in practice.
2. **Filenames containing newlines** remain unsupported in `cmd_closed` (its `ls -t` sort is
   newline-delimited). Every other command handles them via the NUL-delimited helper. Fixing it
   would mean reimplementing the mtime sort without `ls`; low value, real complexity — I judged
   it below the 80/20 line and left it.

---

# Iteration 3 — response to the iteration 2 review

Two items were open, neither a product-code blocker. **Both accepted.** `ticket`'s enumeration logic is
unchanged apart from one help-text wording fix; all product behavior is identical to iteration 2.

| Item | Verdict | Rationale |
|------|---------|-----------|
| **B3** stdin scenarios vacuous | **Accepted in full** | The reviewer is right and the diagnosis is exact: `subprocess.Popen(stdin=PIPE)` followed by `communicate()` with no `input` closes the child's stdin at once, so awk saw EOF immediately and the six scenarios passed against code that provably hangs. That is precisely the "test that lies" case CLAUDE.md forbids. Rewrote the step with `os.pipe()` (parent holds the write end open) + `start_new_session=True` + `os.killpg(..., SIGKILL)` on timeout. |
| **S7** docs overstate hidden-file exclusion | **Accepted** | Verified by hand before changing anything: `_tickets/.draft.md` **is** listed; `_tickets/.trash/keepme/x.md` is **not**. Reworded the three doc sites; **did not** change product behavior. Also added a scenario so the doc claim is now executable rather than prose. |

## B3 — the fix

`features/steps/ticket_steps.py`, step `I run "…" with stdin left open`:

- The child gets the **read end of a raw pipe** as fd 0; this process keeps the **write end** open for
  the whole call, so the child's stdin never reaches EOF. `communicate()` only auto-closes stdin when
  stdin *is* `subprocess.PIPE`, which is why the previous form silently defeated the test.
- `start_new_session=True` + `os.killpg(os.getpgid(pid), SIGKILL)` are **load-bearing, not defensive**.
  The child is a `bash` wrapper whose `awk` grandchild holds the stdout pipe; `process.kill()` alone
  reaps the wrapper and leaves awk blocked, so the follow-up `communicate()` never returns and the
  **suite hangs instead of failing**. Confirmed independently of the reviewer's note.
- Both WHY / WHY-NOT are recorded in the step docstring so the next maintainer cannot re-introduce the
  `stdin=PIPE` form by accident.

## B3 — mutation proof (mandatory evidence)

**Mutant**: `.tmp/ticket_noguard` — a copy of `ticket` with **all 9 empty-array guards deleted**
(7 × `(( ${#TICKET_FILES[@]} )) || return 0`, plus the 2 `if (( … == 0 )); then … fi` blocks in
`ticket_path()` and `cmd_show()`). Product code itself was never modified.

```
$ python3 - <<'PY'   # regex-strip the guards into .tmp/ticket_noguard
  one-line guards removed=[7] if-block guards removed=[2]
$ bash -n .tmp/ticket_noguard
  syntax OK
```

**A note on the reviewer's shell probe.** The suggested one-liner is itself unsound and I did not rely
on it:

```
$ ( cd .tmp/hangdir && timeout 8 bash -c 'sleep 300 | .tmp/ticket_noguard ls' ); echo exit=[$?]
exit=[124]      # mutant
$ ( cd .tmp/hangdir && timeout 8 bash -c 'sleep 300 | ./ticket        ls' ); echo exit=[$?]
exit=[124]      # HEAD — SAME RESULT, so the probe proves nothing
```

`bash` waits for the whole pipeline, including `sleep 300`, so the wrapper times out whether or not
`ticket` returned. I replaced it with `.tmp/hangprobe.py`, which uses the exact mechanism the fixed
step uses (os.pipe + start_new_session + killpg) and times only the `ticket` process:

```
$ python3 .tmp/hangprobe.py
./ticket              ls             -> completed rc=[0] out=[]
./ticket              ready          -> completed rc=[0] out=[]
./ticket              blocked        -> completed rc=[0] out=[]
./ticket              closed         -> completed rc=[0] out=[]
./ticket              query          -> completed rc=[0] out=[]
./ticket              show nest-0001 -> completed rc=[1] err=[Error: ticket 'nest-0001' not found]
./.tmp/ticket_noguard ls             -> TIMED OUT (hang detected)
./.tmp/ticket_noguard ready          -> TIMED OUT (hang detected)
./.tmp/ticket_noguard blocked        -> TIMED OUT (hang detected)
./.tmp/ticket_noguard closed         -> completed rc=[2] err=[awk: read error (Is a directory)]
./.tmp/ticket_noguard query          -> TIMED OUT (hang detected)
./.tmp/ticket_noguard show nest-0001 -> TIMED OUT (hang detected)
```

**The scenarios themselves, run against the mutant** (iteration 2 harness: 36/36 green — vacuous):

```
$ TICKET_SCRIPT=$PWD/.tmp/ticket_noguard uv run --with behave behave features/nested_folders.feature
behave exit=[1]
  ASSERT FAILED: Command blocked on stdin for more than 20s: [.tmp/ticket_noguard ls]
  ASSERT FAILED: Command blocked on stdin for more than 20s: [.tmp/ticket_noguard ready]
  ASSERT FAILED: Command blocked on stdin for more than 20s: [.tmp/ticket_noguard blocked]
  ASSERT FAILED: Command blocked on stdin for more than 20s: [.tmp/ticket_noguard query]
  ASSERT FAILED: Command blocked on stdin for more than 20s: [.tmp/ticket_noguard show nest-0001]
Failing scenarios:
  features/nested_folders.feature:184  Closed with only empty subfolders produces no output
  features/nested_folders.feature:257  …never block on stdin… -- @1.1   (ls)
  features/nested_folders.feature:258  …never block on stdin… -- @1.2   (ready)
  features/nested_folders.feature:259  …never block on stdin… -- @1.3   (blocked)
  features/nested_folders.feature:260  …never block on stdin… -- @1.4   (closed)
  features/nested_folders.feature:261  …never block on stdin… -- @1.5   (query)
  features/nested_folders.feature:263  Show never blocks on stdin when there are no tickets
29 scenarios passed, 7 failed, 0 skipped
```

**All 6 stdin scenarios now fail against the mutant** (previously all 6 passed). Full disclosure on the
one asymmetry: `closed` (`:260`) fails by **`rc=2 / awk: read error (Is a directory)`**, not by timeout.
Removing its guard triggers the documented `xargs`/`ls -t`-lists-cwd bug before awk ever reaches stdin,
so awk dies on a directory instead of blocking. The scenario still fails — it asserts success — so the
guard is genuinely locked down; it is simply caught by a different symptom. Scenario `:184` (a
pre-existing iteration-2 scenario) also fails against the mutant, which is further evidence the suite
is not blind to guard removal.

**Restored and green** — the mutant lives only in `.tmp/` (untracked); `ticket` was never edited for
this test. Full suite below.

## S7 — docs corrected, behavior untouched

Behavior verified first, so the docs now describe what the code does rather than the reverse:

```
$ find _tickets -name '*.md' | sort
_tickets/.draft.md            _tickets/.trash/keepme/x.md            _tickets/real-one.md
$ ticket ls
nid_volprfr3ayonqlurhcupop7rl_e [open] - Real one     # .draft.md  -> LISTED (same id, it is a copy)
nid_volprfr3ayonqlurhcupop7rl_e [open] - Real one     # .trash/... -> NOT listed
```

Reworded `README.md`, `ORIGINAL_README.md` and the `ticket help` footer: every `.md` file at any depth
is a ticket **except those inside a hidden directory**; hidden directories are skipped **along with
their whole subtree** (so a non-hidden folder nested under one is also dropped — the review's
NICE-TO-HAVE, folded in for one sentence); **hidden files are not skipped**, `_tickets/.draft.md` is a
ticket. `CHANGELOG.md` needed **no** change — it already said only "Hidden directories … are skipped",
which is correct.

Went one step beyond the review: added scenario **"A hidden ticket file outside a hidden folder is
still a ticket"** plus a `I rename the file of ticket "…" to "…"` step. A documented rule with no test
is the same drift risk that produced S7 in the first place.

## Iteration 3 test results

```
$ mkdir -p .tmp; make test > .tmp/test3.out 2>&1     # exit=[0]
12 features passed, 0 failed, 0 skipped
168 scenarios passed, 0 failed, 0 skipped
1143 steps passed, 0 failed, 0 skipped
```

| Point | Features | Scenarios | Steps |
|-------|----------|-----------|-------|
| Iteration 2 final | 12 passed, 0 failed | 167 passed, 0 failed | 1137 |
| **Iteration 3 final** | **12 passed, 0 failed** | **168 passed, 0 failed** | **1143 passed, 0 failed** |
| Iteration 3 vs. mutant | 1 failed | **7 failed** | 7 failed |

**No pre-existing scenario broke**: 131 pre-existing → 131, still green across all iterations. The
delta is exactly +1 scenario / +6 steps, all in `features/nested_folders.feature` (36 → 37) from the
new S7 hidden-file scenario. Log: `.tmp/test3.out`.

## Files changed in iteration 3

- `features/steps/ticket_steps.py` — non-vacuous stdin harness (`import signal`, `os.pipe`,
  `start_new_session`, `killpg`); new `I rename the file of ticket …` step.
- `features/nested_folders.feature` — new hidden-file scenario.
- `README.md`, `ORIGINAL_README.md`, `ticket` (help footer only) — S7 wording.

No new dependencies (`os` and `signal` are stdlib). Ticket left **open** and **no** `change_log` entry,
per instruction.
