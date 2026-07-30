# IMPLEMENTATION_PHASE_B__PRIVATE — memory for a clone of me

Task: T5 phase B — port `dep <id> <dep-id>`, `undep`, `link`, `unlink` to TS, flip into
`TS_COMMANDS`. Base commit 6a5a349. Branch `nid_2ziai8ka9l0yak2lxnwlu9lk2_e_2026-07-30T02-44-18PDT`.
NOTE: mutation results table is in the PUBLIC file; this file holds the reasoning and traps.

## Plan I executed

1. Probe pinned bash for the real behavior of every edge case (`.tmp/exp/probe.py`) —
   the exploration doc was WRONG on one point (see below).
2. `src/core/ticket-relations.ts`: `TicketRelation.DEPENDENCY`/`.LINK`, one place for
   add/remove/membership over the two id arrays. Core, no CLI knowledge.
3. `src/cli/commands/dep.ts` extended with the write branch; new `undep.ts`, `link.ts`
   (with a pure `LinkClosure`), `unlink.ts`; 4 `case` arms in `main.ts`.
4. `ticket`: `TS_COMMANDS` += `dep undep link unlink`; `TS_DEP_SUBCOMMANDS=` KEPT (harness).
5. `scripts/parity/check_write.py`: +46 agreement cases, +10 `diverges=True` cases.
6. 8 BDD scenarios, 31 unit tests, docs (parity README #13-#18, migration doc, README.md,
   CLAUDE.md), mutation table.

## Bash facts I MEASURED (probe.py) — some contradict the exploration doc

- **`dep`/`undep` on a ticket with NO `deps:` field: bash exits 1 printing NOTHING and
  changing nothing.** The exploration doc claimed `dep` writes a bare `deps: ` line — it does
  not. Root cause: `current_deps=$(yaml_field …)`, whose `sed|grep|sed` pipeline fails under
  `set -euo pipefail` when grep matches nothing, so `set -e` kills the function before the
  membership test. (`cmd_unlink` escapes this because it uses `|| true`.)
- `link` append order under this machine's awk (mawk; `awk --version` is not an option):
  `link a b c` gives a's links `[c, b]` — REVERSED. `link a b c d` gives `[d, c, b]`. But a
  2-element `need` set can also come out in argument order (measured for the partial-trio
  shape). So the order is genuinely unspecified → NOT pinnable in the harness either way.
- `link a a`: bash self-links, prints `Added 1 link(s) between 2 tickets`.
- `link` with a target that has no `links:` line: count 1, not 2.
- `link` with a `links:` line in the BODY: rewrites it too, count 3 for a pair.
- `dep`/`undep` with a `deps:` line in the BODY: rewritten too (whole-file `sed`).
- `undep t-9 t-1` where deps are `[t-1, t-111]` → `deps: [11]`. Real corruption.
- `dep t-1 t-11` where deps are `[t-11]` → `Dependency already exists` (substring).
- `unlink` where only the TARGET records the link → `Link not found`, rc 1, nothing changed.
- `unlink` where only the SUBJECT records it → rc 0, subject cleared, target untouched.
- `dep a a` (self) is allowed by bash and by TS.
- Usage strings/rc verified verbatim for 0-arg and 1-arg forms of all four commands.

## Decisions

- **One `TicketRelation` for both fields** instead of dep-specific and link-specific helpers:
  the rules are identical and a second copy is how `deps` and `links` drift apart.
- **`withAdded`/`withRemoved` return `Ticket | undefined`**, `undefined` = "already in the
  desired state". That is exactly the branch each command needs for its stdout message, and it
  makes "no change ⇒ no write" structural. `withAllAdded` returns `{ticket, addedCount}` for
  `link`, and `withAdded` is implemented in terms of it.
- **`link` dedups by RESOLVED id** and refuses a set that collapses to one ticket with
  `Error: nothing to link: every id resolves to ticket <id>` (divergence #17). Rejected
  alternative: silently dropping the duplicate and printing `All links already exist` — that
  is a lie about what happened.
- **No `diverges=True` case for the link ORDER (#18)**: bash's awk hash order is not stable
  across awk builds, so such a case could go red in CI on a different awk. Pinned the TS side
  with a unit test + a BDD scenario instead, and documented the WHY-NOT in `check_write.py`
  and in the parity README. The one multi-ticket case in the harness (`LINK_CHAIN`) is shaped
  so every file gains exactly ONE id — order cannot enter the comparison.
- `main.ts` `case "dep"` switched from `forReadCommand()` to `forWriteCommand()`; comment
  explains one resolution serves all three forms.
- Kept the dead `cmd_dep` delegation block in `ticket` (removing it would be churn in a
  function that is dead in its entirety), only corrected its comment. `TS_DEP_SUBCOMMANDS=`
  MUST stay: `harness.py` demands exactly one `^VAR=` per delegation variable.

## Traps hit

- **The 10-minute Bash tool timeout killed the first mutation run mid-mutation**, leaving
  `src/cli/commands/dep.ts` mutated (`Added dependency: ${subjectSearch} …`). I restored it by
  hand. Re-ran with `run_in_background: true`. If you rerun `.tmp/mutate_t5b.py`, ALWAYS run it
  in the background and `git diff src/` afterwards.
- Python buffers the runner's stdout when redirected to a file, so `.tmp/mutate.out` stays
  empty until the process exits. Do not conclude "nothing ran".
- First version of the `#13 dep substring` case did not diverge: I had the subject add an id
  that WAS an exact element. The diverging shape is `dep t-9 t-11` where t-9's deps contain
  `t-111` (t-11 occurs INSIDE it). The harness caught my mistake with "DIVERGENCE GONE".
- The shell profile prints ~15 noise lines before every `bash` tool call here; always redirect
  gate output to `.tmp/` and grep, never pipe through `tail` (masks the rc).

## Exact commands

```
python3 .tmp/exp/probe.py > .tmp/exp/probe.out 2>&1          # bash behavior probes
make typecheck > .tmp/tc.log 2>&1; echo rc=$?
make unit-test > .tmp/unit.log 2>&1; echo rc=$?
make test > .tmp/bdd.log 2>&1; echo rc=$?
make parity > .tmp/parity.log 2>&1; echo rc=$?
python3 .tmp/mutate_t5b.py > .tmp/mutate.out 2>&1            # background only!
python3 .tmp/mutate_t5b.py M4 M7                             # a subset, by name prefix
```

## Mutation results (full table in the PUBLIC file)

18/18 caught. Gate exit codes observed: unit failure = **2** (node --test), bdd failure = 1,
parity failure = 2. Two lessons:

- My first M7 was an EQUIVALENT MUTANT: `if (!distinct.has(ticket.id))` → `if (true)` changes
  nothing because a `Map` de-duplicates by key anyway. An "ESCAPED" verdict on a mutation that
  cannot change behavior is a bug in the mutation, not a hole in the tests. Re-ran as M7b,
  which replaces the whole Map with `args.map(...)`.
- M7b shows `parity=0`: for a `diverges=True` case, parity only requires the two sides to
  DIFFER, and a broken TS still differs from bash. **An inverted parity expectation can never
  pin the TS side of a divergence** — always add a BDD scenario or unit test for those. This is
  the same class of blind spot as the `random_scenarios` duplicate-`deps` lesson in MEMORY.md.
- The runner's `caught = all(rc != 0)` rule is too strict for mixed gate sets; read the
  per-gate codes, not just the verdict.

## State at exit

All four gates green (numbers in the PUBLIC file). Nothing committed — TOP_LEVEL_AGENT commits.
CHANGELOG.md deliberately untouched. Phase C owns `add-note`/`edit` + shim reduction.

---

# Iteration 1 (response to IMPLEMENTATION_REVIEW_PHASE_B__PUBLIC) — fresh clone of me

Verdict was READY / 0 BLOCKING, 3 SHOULD-FIX + 4 NITs. Cleanup only, no redesign.

## What I changed and why

- **S1 (#16 had no positive TS pin).** Audited ALL of #13–#18 for the same defect: #13 has BDD
  scenarios, #14 two, #15 one, #17 one, #18 unit+BDD — **#16 was the only one** with nothing but
  `diverges=True` cases. Added `ticket_links.feature` scenario "A links line in the body is
  neither counted nor rewritten". Fixture deliberately has **no** frontmatter `links:` and a body
  `links: [ghost]`, because TS addresses only the FIRST occurrence of a key — with a frontmatter
  `links:` present, a body-swallowing bug would be INVISIBLE (the frontmatter line wins). That
  detail is what makes the scenario non-vacuous; the `bare.md`-style fixture alone would not.
- **S2a (self-relation inconsistency).** Kept both behaviors and wrote the WHY down in THREE
  places (`dep.ts` class doc as a WHY-NOT, `link.ts` `resolve` doc, parity README #16/#17 +
  migration doc + README.md). Rationale: a `deps` self-edge is a real graph error the tool
  already REPORTS (`dep cycle`, `ready`/`blocked`), so refusing it at write time destroys
  information; a `links` self-entry has no semantics at all. Rejected making them agree by
  extending the refusal to `dep` — that would be a second new error string on a command whose
  bash behavior is currently byte-exact, i.e. more divergence to buy consistency.
- **S2b.** Appended a full option-analysis note (#17, options a/b/c, revert cost, what pins it)
  to the existing `decide` ticket `nid_r3mp6uylht7t77iwxtuqvhxv2_e` via
  `... | ./ticket add-note`, retitled it (it said "four divergences"), added a pointer line to
  its body and widened its acceptance criteria to include #17.
- **S3.** REJECTED on scope as instructed — `CHANGELOG.md` untouched; the verbatim correction
  TOP must apply is in the PUBLIC file.
- **N1 (DRY).** New public `Ticket.arrayField(key)`; `deps`/`links`/`tags` and
  `TicketRelation.idsOf` all go through it. Chose this direction because `ticket-relations.ts`
  imports `ticket.ts` — making `Ticket.deps` call `TicketRelation` would close an import cycle.
- **N2.** Did it as a BDD scenario ("A repeated id is counted once when other tickets remain"),
  NOT the suggested `diverges=True` parity case: an inverted case cannot pin TS's count, which
  is the whole lesson of I1. Better ROI for the same effort.
- **N3.** Rewrote `LinkCommand.resolve` to resolve `args[0]` separately and seed the Map with it,
  so "the single ticket everything collapsed to" is type-guaranteed. The dead `&& only !==
  undefined` clause is gone. Abort-before-write and argument order are unchanged.
- **N4.** Extended #13 with the scalar clause — and MEASURED both sides first rather than
  trusting the review: pinned bash `dep aaa bbb` on `deps: foo` prints `Added dependency: …`,
  rc 0, file UNCHANGED (its insert is `sed "s/\]/, $dep_id]/"`, and a scalar has no `]`); TS
  writes `deps: [foo, bbb]`. The `sed` line is `ticket:807`.
- **Extra (review's "Documentation Updates Needed").** Annotated the wrong bullet in
  `EXPLORATION_PUBLIC.md` §3.4 in place with a `> CORRECTION (Phase B …)` block, since Phase C
  reads that file as its spec. Did not rewrite the surrounding text.

## Mutation evidence, iteration 1 (`.tmp/mutate_b_it1.py`, no pipes, restore in `finally`)

| # | mutation | gate rcs | which scenarios failed |
|---|---|---|---|
| MU-A | `TicketDocument.parse` terminated branch → block = every line after the opening `---`, body empty, shape `unterminated` (bash's whole-file matching) | build=0 **behave=1** | 12 passed, 1 failed: **"A links line in the body is neither counted nor rewritten"** — the new scenario, and ONLY it |
| MU-B | `link` argument de-duplication removed (Map keyed by index instead of id) | build=0 **behave=1** | 11 passed, 2 failed: **"A repeated id is counted once when other tickets remain"** (new) + "Linking a ticket to itself is refused" |

MU-A is the honest one to remember: I first tried block = all-lines-after-opening WITH a
frontmatter `links:` in the fixture and it SURVIVED, because first-occurrence addressing means
the frontmatter line is still the one edited. Removing the frontmatter `links:` from the fixture
is what gave the scenario its teeth. Sources verified restored (`grep` for the mutant strings).

## Gate results, iteration 1 (each run separately, rc read directly, output to `.tmp/g_*.log`)

```
make typecheck  rc=0
make unit-test  rc=0   ℹ tests 365  ℹ pass 365  ℹ fail 0     (unchanged — no new unit test)
make test       rc=0   12 features, 239 scenarios, 1609 steps, 0 failed   (was 237/1589)
make parity     rc=0   graph OK 71/0 | query OK | slug OK 13/0 | write OK cases=109 failures=0
```

## Commands (iteration 1)

```
uv run --with behave behave features/ticket_links.feature > .tmp/it1_links.log 2>&1; echo rc=$?
python3 .tmp/mutate_b_it1.py > .tmp/it1_mut.out 2>&1; echo rc=$?     # ~40s, foreground OK
# pinned-bash probe for the #13 scalar clause:
sed -e 's/^TS_COMMANDS=.*/TS_COMMANDS=""/' -e 's/^TS_DEP_SUBCOMMANDS=.*/TS_DEP_SUBCOMMANDS=""/' \
    ticket > .tmp/b1/tkbash
```

`make test`'s behave is `uv run --with behave behave` — plain `uv run behave` fails with
"Failed to spawn: behave". Cost me one wasted run.
