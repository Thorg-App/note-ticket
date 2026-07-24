# Implementation Review — Nested Folders Under `_tickets` — **Iteration 3 (final)**

Reviewed: `git diff 35fb84c..HEAD` (`bf82b29`, branch `nested_folders`).
Scope of this pass: the two items left open in iteration 2 — **B3** (vacuous stdin scenarios) and
**S7** (docs overstate hidden-file exclusion). No new review threads opened, per final-pass instruction.

## READY-TO-MERGE: **YES** — 0 BLOCKING, 0 SHOULD-FIX.

---

## BLOCKING

**None.**

## SHOULD-FIX

**None.**

---

## VERIFIED-GOOD

### B3 — stdin scenarios are no longer vacuous (re-proved independently)

I did not take the implementer's evidence on faith. I built **my own** mutant from HEAD
(`.tmp/ticket_noguard`: all 7 one-line `(( ${#TICKET_FILES[@]} )) || return 0` guards plus the 2
`if (( … == 0 ))` blocks in `ticket_path()` / `cmd_show()` stripped by regex; `bash -n` clean, 1600 →
1585 lines, no remaining `TICKET_FILES[@]` guard) and ran the feature file against it:

```
TICKET_SCRIPT=$PWD/.tmp/ticket_noguard uv run --with behave behave features/nested_folders.feature
behave exit=[1]   →   30 scenarios passed, 7 failed
  :264 :265 :266 :267 :268   ls / ready / blocked / closed / query   (stdin scenario outline)
  :270                       show
  :184                       Closed with only empty subfolders (pre-existing iteration-2 scenario)
```

Five of them fail with `ASSERT FAILED: Command blocked on stdin for more than 20s: […]`. In
iteration 2 the identical mutation produced **36/36 green** — the harness was blind. It is now
discriminating. Against HEAD all 6 pass (`make test`, below).

The `closed` asymmetry the implementer disclosed is real and correctly characterised: without its
guard, `ls -t "${TICKET_FILES[@]}"` lists the cwd first, so awk dies with `read error (Is a directory)`
before it ever reaches stdin. The scenario still **fails** (it asserts success), so the guard is locked
down; only the symptom differs. Disclosing that rather than papering over it is the right call.

**Adjudication of my own iteration-2 probe — the implementer is right, I was wrong.** I re-ran it:

```
timeout 8 bash -c 'sleep 300 | ./ticket ls'   →   exit=[124]   # HEAD, i.e. the FIXED script
```

`bash` waits for the whole pipeline including `sleep 300`, so the one-liner times out regardless of
whether `ticket` returned. It cannot distinguish mutant from HEAD and proves nothing. My round-2
*conclusion* (the mutant hangs; `communicate()` closes a `PIPE` stdin) was correct, but that particular
probe was not what established it. The replacement (`os.pipe` + `start_new_session`, timing only the
`ticket` process) is the sound instrument. Good catch, fairly argued.

The harness itself (`features/steps/ticket_steps.py`, step `I run "…" with stdin left open`) is correct
on the details that matter: the child gets the raw read end as fd 0 and the parent holds the write end
for the duration, so stdin never sees EOF; `read_fd` is closed right after `Popen` with a `-1` sentinel
so the `finally` cannot double-close; `killpg` on a new session reaps the `awk` grandchild that holds
the stdout pipe — without it the follow-up `communicate()` deadlocks and the suite *hangs* instead of
failing. Both the WHY and the WHY-NOT (`stdin=subprocess.PIPE`) are recorded in the docstring, which is
what stops this regressing.

### S7 — docs now accurate

Verified against behavior, not against the prose. Scratch git repo with three tickets:

```
_tickets/.draft.md            → LISTED      ("Draftish")
_tickets/.trash/keepme/x.md   → NOT listed  (hidden dir pruned with its whole subtree)
_tickets/real-one.md          → LISTED
```

`README.md`, `ORIGINAL_README.md` and the `ticket help` footer now all say exactly this: every `.md`
file at any depth is a ticket **except those inside a hidden directory**; hidden directories are skipped
**along with their entire subtree**; **hidden files are not skipped**. Three sites, consistent wording,
no drift. `CHANGELOG.md` correctly needed no edit.

Going further and adding the executable scenario **"A hidden ticket file outside a hidden folder is
still a ticket"** (plus the `I rename the file of ticket "…" to "…"` step) is the right instinct — the
documented rule is now enforced, which is what would have prevented S7 in the first place.

### Suite

```
mkdir -p .tmp; make test > .tmp/review3-test.out 2>&1     # exit=[0]
12 features passed, 0 failed  |  168 scenarios passed, 0 failed  |  1143 steps passed, 0 failed
```

Iteration 2 → 3 delta is exactly **+1 scenario / +6 steps**, all in `features/nested_folders.feature`.
All 131 pre-existing scenarios still pass; **no behavior-capturing test was removed, weakened, or
skipped** across the three iterations. `ticket` itself changed only in the help footer this iteration —
the enumeration logic is byte-identical to the iteration-2 code already signed off.

---

## Carried forward (not blocking, already agreed in iteration 2)

- macOS CI gap — `sort -z` and `find -L -mindepth -prune` are all documented in BSD/macOS man pages, so
  this is a coverage wish, not a defect. Follow-up ticket, not a merge gate.
- `cmd_show`'s double `find` and the `closed` newline-in-filename limitation (now commented in-source)
  remain accepted trade-offs.

## Documentation Updates Needed

None. `CLAUDE.md` needs no change — nothing here alters architecture, testing, or release conventions.
