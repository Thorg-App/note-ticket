# IMPLEMENTATION REVIEW — Iteration 2 (nested folders under `_tickets`)

Reviewed: `git diff ab99cfa..HEAD` (commits `5ec302f` test-red, `2ae226a` fix), branch `nested_folders`.
Independent verification: my own `make test` (`.tmp/review2-test.out`), the new feature file run against
the **iteration-1** script (`.tmp/ticket_it1`), a **mutation test** against a deliberately guard-stripped
script (`.tmp/ticket_noguard`), hands-on probes in 10 scratch git repos (`.tmp/probe2.sh` →
`.tmp/probe2.out`), and macOS/BSD man-page evidence for the new `find`/`sort` flags.

**Verdict: the product change is correct and all 8 of my iteration-1 items are genuinely fixed.**
One BLOCKING issue remains and it is **test-only**: the 6 new "never blocks on stdin" scenarios cannot
fail — they pass against code that provably hangs. Four-line fix, given below.

---

## BLOCKING

### B3. The 6 new stdin-hang scenarios are vacuous — they pass against code that hangs
`/home/nickolaykondratyev/git_repos/note-ticket/features/steps/ticket_steps.py:442-479`

The step's docstring claims it "runs the command with a **live, never-written stdin pipe**". It does not.
`subprocess.Popen(..., stdin=subprocess.PIPE)` followed by `process.communicate(timeout=…)` with **no
input argument closes the child's stdin immediately**. `awk` therefore gets EOF instantly, and the
scenario passes whether or not the guard exists.

Proven by mutation, not argued:

```
# .tmp/ticket_noguard = HEAD's script with the cmd_ls guard and the recent_files guard deleted
$ timeout 8 bash -c 'sleep 300 | ../ticket_noguard ls'   # genuinely open stdin
exit=124                                                  # <- hangs, as predicted

$ python3 -c "...Popen(stdin=PIPE); p.communicate(timeout=8)"
completed rc= 0 out= ''                                   # <- harness sees no hang

$ TICKET_SCRIPT=.tmp/ticket_noguard behave features/nested_folders.feature
1 feature passed, 36 scenarios passed, 0 failed            # <- ALL GREEN on hanging code
```

So the S2/S3 guards are locked down by nothing. Per CLAUDE.md a test that cannot fail is worse than no
test, because a future maintainer will delete a guard and see green. Either fix the harness or delete
the scenarios and say plainly that the guards are inspection-only.

**Fix** — hold the write end open in the test process so stdin never sees EOF (`communicate()` only
auto-closes stdin when stdin *is* `subprocess.PIPE`), and kill the whole process **group** on timeout:

```python
read_fd, write_fd = os.pipe()          # parent keeps write_fd open => child's stdin never EOFs
try:
    process = subprocess.Popen(cmd, shell=True, cwd=cwd, stdin=read_fd,
                               stdout=subprocess.PIPE, stderr=subprocess.PIPE,
                               text=True, env=os.environ.copy(),
                               start_new_session=True)   # own process group
    os.close(read_fd)                  # only the child holds the read end now
    try:
        stdout, stderr = process.communicate(timeout=STDIN_OPEN_TIMEOUT_SECONDS)
    except subprocess.TimeoutExpired:
        os.killpg(os.getpgid(process.pid), signal.SIGKILL)
        process.communicate()
        raise AssertionError(...)
finally:
    os.close(write_fd)
```

`start_new_session` + `killpg` are load-bearing, not belt-and-braces: I first tried the plain
`process.kill()` form and **it deadlocked forever** — killing the bash wrapper leaves the blocked `awk`
holding the stdout pipe, so the follow-up `communicate()` never returns and the suite hangs instead of
failing. I ran the version above against both scripts (`.tmp/hangprobe.py`):

```
noguard : TIMED OUT (hang detected)      # <- the mutant is now caught
HEAD    : completed rc=0 out=''          # <- current code still passes
```

Also correct the claim in `IMPLEMENTATION_WITH_SELF_PLAN__PUBLIC.md` ("live, never-written stdin pipe")
once the harness actually does that.

---

## SHOULD-FIX

### S7. Docs say "non-hidden `.md` file" but hidden `.md` **files** are still listed
`README.md:13`, `ORIGINAL_README.md:11`, `ticket:1559`

Only hidden **directories** are pruned. Verified (`.tmp/probe2.out` section E): `_tickets/.draft.md` is
listed by `ticket ls` exactly like a normal ticket. The three doc sites all say "Every non-hidden `.md`
file at any depth under `_tickets/` is a ticket", which a reader will take to mean `.draft.md` is
excluded. Either reword to "every `.md` file at any depth, except those inside hidden directories", or
extend the prune to hidden files. I'd reword — the current behavior is the less surprising of the two
(a dot-file the user explicitly created inside `_tickets` is plausibly a real ticket), and it is what the
CHANGELOG already says ("Hidden directories … are skipped").

---

## NICE-TO-HAVE

- Pruning a hidden directory also removes any **non-hidden** subtree under it — verified
  (`_tickets/.trash/keepme/x.md` is dropped, probe C). That is the right semantic (`-prune` is what makes
  `.obsidian`/`.git` cheap), but one clause in `README.md` would prevent a "where did my folder go" bug
  report.
- Symlink loop under `_tickets` (`_tickets/self -> _tickets`): with the `2>/dev/null` gone, GNU find now
  prints `File system loop detected` to stderr on every command; output is still correct and exit is 0
  (probe H). Acceptable, and better than silence, but it will be permanent noise for anyone who does it.
- `show` still traverses the tree twice — unchanged from iteration 1, still fine at current scale.
- `cmd_closed` newline-in-filename limitation is now documented at the `ls -t` loop (`ticket:948-949`).
  Agreed 80/20; nothing further needed.
- macOS is still not exercised in CI. The flags are now documented-safe (below), but a `macos-latest`
  job in `.github/workflows` would retire the whole class of assumption for a Homebrew-shipped tool.
  Worth a follow-up ticket.

---

## VERIFIED-GOOD

### Portability of the new enumeration line — adjudicated, NOT blocking

`find -L "$TICKETS_DIR" -mindepth 1 -name '.*' -type d -prune -o -type f -name '*.md' -print0 | LC_ALL=C sort -z`

- **`sort -z` IS available on macOS.** macOS ships BSD sort (Apple `text_cmds`, the FreeBSD/Kovesdan
  rewrite), whose man page documents verbatim: *"**-z, --zero-terminated** Use NUL as record separator.
  By default, records in the files are supposed to be separated by the newline characters. With this
  option, NUL ('\0') is used as a record separator character."* Present in the macOS man page dated
  **March 19, 2015** (i.e. every macOS release Homebrew still supports) and identically in current
  FreeBSD sort(1). GNU coreutils has it too. **Not a portability blocker.**
- **`find -L`, `-mindepth`, `-prune`, `-print0`, `-name` are all documented in macOS `find(1)`**, with
  `-mindepth` as *"Always true; do not apply any tests or actions at levels less than n"* and `-L`
  making `-type f` report the **target's** type — which is precisely what S1 relies on. `-mindepth`
  appears first in the expression, so GNU's "global option" warning is also avoided.
- **The prune expression cannot drop legitimate tickets.** Precedence is
  `(-mindepth 1 -a -name '.*' -a -type d -a -prune) -o (-type f -a -name '*.md' -a -print0)`;
  `-mindepth 1` is "always true" so it does not break the left conjunction, and it is what stops a
  dot-named `TICKETS_DIR` from pruning itself. Verified by hand: `TICKETS_DIR=<repo>/.tickets` lists its
  tickets correctly (probe D). The only subtree lost is one under a hidden ancestor, which is the
  intended rule (see NICE-TO-HAVE).

### Every iteration-1 item genuinely resolved

| Item | Status | Evidence |
|------|--------|----------|
| **B1** symlinked `_tickets` → 0 tickets | **Fixed** | probe A: both root and nested tickets listed through a `_tickets -> vault` symlink, exit 0. Scenario `:196`/`:206` fail against `ca810fe`. |
| **B2** `ls`/`query` order regression | **Fixed** | probe B: `alpha, backend/zebra, beta, kiwi, mango` — byte-wise **path** order, byte-identical across repeated runs (md5 match). Scenarios `:220`/`:230` fail against `ca810fe`. Ordering is now stated in CHANGELOG/README/help. |
| **S1** symlinked ticket file dropped | **Fixed** | subsumed by `-L`; scenario `:213` fails against `ca810fe`. |
| **S2** `cmd_show` unguarded array | **Fixed** | `ticket:1289-1293`; errors (`not found`, exit 1) instead of silently succeeding — the right call. All **10** `"${TICKET_FILES[@]}"` sites are now guarded; I grepped, none missed. |
| **S3** `recent_files` unguarded | **Fixed** | `ticket:956-958`. |
| **S4** non-discriminating scenarios | **Fixed properly** | `:81` now asserts the rendered blocker `<- [nest-0001]`; `:90` asserts the root dep IS listed; two new transition scenarios (close the dep → `blocked` drops it / `ready` gains it). Not weakened assertions — strengthened ones. |
| **S5** `find … 2>/dev/null` swallowing errors | **Fixed, well-judged** | probe G: `find: '…/secret': Permission denied` now reaches stderr while the remaining tickets still list and exit stays 0. The `[[ -d "$TICKETS_DIR" ]] || return 0` pre-check keeps "no tickets dir yet" from becoming noise; dangling `_tickets` symlink still gets the clean `does not exist` message (probe I). |
| **S6** hidden dirs traversed | **Fixed (prune)** | probe C: `.trash/` contents excluded. Scenario `:240` fails against `ca810fe`. Prune (not doc-only) was the right choice. |
| **NTH** `local f` | **Fixed** | both loops. |

### Other verified facts

- **`make test` on my own run: 12 features / 167 scenarios / 1137 steps, 0 failed.** Pre-existing 131
  scenarios all still present and green — no behavior-capturing test was removed or weakened anywhere in
  this diff. Implementer's numbers are accurate.
- **Red-then-green is real for the 6 substantive scenarios**: run against `ca810fe`, exactly
  `:196 :206 :213 :220 :230 :240` fail. (The 6 stdin scenarios pass there too — see B3; the implementer
  did *not* claim otherwise in the results table, only in the prose.)
- **Filename robustness survives the new pipeline**: a ticket whose filename contains a literal newline
  is still listed correctly through `find -print0 | sort -z` (probe F).
- **The fix stayed in one place.** All of B1/B2/S1/S5/S6 are the single `_collect_ticket_files` line —
  no per-call-site patching. The WHY comment block above it (`ticket:114-128`) explains each flag,
  including why `-mindepth 1` is load-bearing. This is the DRY payoff the iteration-1 design promised.
- **Docs updated coherently**: `ticket help` footer, `README.md`, `ORIGINAL_README.md`, CHANGELOG
  `[Unreleased] / Added` all now state the ordering, hidden-dir and symlink rules (modulo S7's wording).

## Documentation Updates Needed

- The S7 wording fix in `README.md`, `ORIGINAL_README.md`, and the `ticket help` footer.
- No CLAUDE.md change required.

---

## READY-TO-MERGE: **no** — 1 blocking item (test-only, ~4 lines) + 1 doc wording fix.

To be explicit: **no product-code blocker remains**, and I would sign off on `ticket` as it stands. The
block is B3 — six scenarios that assert a safety property they cannot actually observe. Fix the harness
(or delete them and say the guards are inspection-only), reword S7, and this merges.
