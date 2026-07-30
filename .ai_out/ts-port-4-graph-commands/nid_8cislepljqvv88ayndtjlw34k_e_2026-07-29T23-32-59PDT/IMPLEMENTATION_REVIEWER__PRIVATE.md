# IMPLEMENTATION_REVIEWER — private memory (T4 graph commands)

Ticket `nid_8cislepljqvv88ayndtjlw34k_e`, branch
`nid_8cislepljqvv88ayndtjlw34k_e_2026-07-29T23-32-59PDT`.
Commits reviewed: `94242f2`, `e934523`, `3019ca9` (diff base `d86f193`).

## Verification I ran myself (not trusted from the report)

Sequential, logs under `$REPO/.tmp/rev_*.log`, results in `.tmp/rev_results.txt`:

| Command | Exit | Detail |
|---|---|---|
| `make build` | 0 | `dist/ticket.mjs` 61.3kb |
| `make unit-test` | 0 | 289 pass / 0 fail |
| `make test` | 0 | 12 features, 214 scenarios, 1420 steps, 0 failed |
| `make parity` | 0 | graph OK 69 scenarios / 0 failures (19 whitelisted bash bogus cycles), query OK, slug OK |

Matches the implementer's report exactly. No discrepancy.

## What I read line by line

- bash `cmd_dep_tree` (ticket:439-639), `cmd_dep_cycle` (641-753), `cmd_dep` (755-...),
  `cmd_show` (1302-1464), `init_tickets_dir` (23-41), dispatcher (1597-1642).
- TS: `src/cli/commands/{dep,dep-tree,dep-cycle,show}.ts`, `src/cli/{ticket-lookup,pager,
  child-exit,cli-error,ticket-row,main,store-resolver}.ts`, `src/core/{dep-graph,id}.ts`.
- `scripts/parity/{README.md,check_graph.py,harness.py,dump.ts}`, both feature files,
  `test/graph-commands.test.ts`, `test/dep-graph.test.ts`.
- `_tickets/confirm-intentional-id-resolution-error-path-changes-...md` (the closed
  decision ticket) to check what the human actually approved.

## Parity reasoning I did by hand (all came out matching)

- **tree print order**: bash pushes children reversed onto one stack → pre-order DFS;
  TS recursion is the same order. Connectors decided at list-build time on both sides,
  so a skipped child can leave a `├──` last on both.
- **maxDepth**: both walk every simple path with no memo. Equivalent.
- **subtreeDepth**: bash's phase-0 push snapshots "children without a value yet" BEFORE
  any child runs, and re-runs a child that acquired a value meanwhile. TS's `pending`
  snapshot + no has-value guard reproduces exactly that. This is the single subtlest
  thing in the change and it is right.
- **cycle normalize**: bash scans `parts[2..n-1]` for the min (skips the duplicated last),
  rotates; TS normalizes over `stack.slice(start)`. Equivalent.
- **show sections**: Blockers = deps order, unknown id kept (bash `statuses[d] != "closed"`
  where unknown gives ""). Blocking filter is `status != "closed"` — NOT `isFinished`; TS
  uses `!ticket.isClosed`, which is closed-only. Correct. Children include closed tickets
  on both sides. Linked prints unknown ids as `- ghost [] `.
- **parent annotation**: both use `^parent: *` strip and "is the id known" test; fence
  counting identical.
- **empty tickets dir**: bash returns before awk for `dep tree` / `dep cycle`; TS
  short-circuits on `tickets.length === 0`. Matches.
- **missing tickets dir for `dep`**: bash's `init_tickets_dir` runs BEFORE `cmd_dep`, so
  the TS side never sees it. No divergence.
- **TICKETS_DIR is never `export`ed** in `ticket` (grepped) — TS resolves independently
  via `TicketsDirectory.resolve()`. Same as T3, fine.
- **Pager**: bash's `TICKET_PAGER="${TICKET_PAGER:-${PAGER:-}}"` is a plain (unexported)
  assignment, so node reads the raw env; TS `TICKET_PAGER || PAGER` is equivalent.
  `spawnSync(binary, args)` — no shell, so no injection (bash used `read -a` + exec, also
  no shell). Safe.

## Mutations I ran MYSELF (throwaway copy at `$REPO/.tmp/mut`, real tree untouched)

Copy made with `tar` + symlinked `node_modules`.

1. **Memoize `measureSubtreeDepths`** (`if (this.subtreeDepth.has(id)) return;`):
   `make unit-test` PASSED (mutation survives unit tests) but `make parity` FAILED with
   `MISMATCH scenario=[random#42] check=[dep tree --full n4]`. → the "refinement" comment
   at `src/core/dep-graph.ts:294-300` is genuinely load-bearing and genuinely guarded,
   by parity only. Confirms the implementer measured rather than guessed.
2. **Remove the re-check in `layoutChildren`** (`dep-graph.ts:321-324`): unit tests
   PASSED. Parity run was still going when I finished; my analysis says it will pass too,
   because the re-check is UNREACHABLE: a sibling is listed only when
   `depth+1 === maxDepth[child]`, and inside an earlier sibling's subtree that child can
   only occur at depth ≥ depth+2 > maxDepth, so it can never have been printed in between.
   In `--full` mode `isPrintable` is state-independent, so it is a pure no-op there.
   Conclusion: harmless dead defensive code mirroring bash's pop-time check. NOT a
   vacuity problem — nothing claims it is tested.

Vacuity spot-checks done by reading:
- `children` "has any parent" mutation: really is caught now — `test/dep-graph.test.ts`
  gained the `other-child` (parent: elsewhere) fixture. Non-vacuous.
- `show` Blocking/Children swap: caught by `test/graph-commands.test.ts:168-178`
  (deepEqual on the heading list) AND `check_graph._check_show_relations`. Non-vacuous.
- BDD empty-id scenario: the step runner uses `shell=True` on `<script> show ""`, so an
  actual empty argv element reaches the CLI. Non-vacuous.

## Findings I raised (see PUBLIC file)

1. CHANGELOG.md untouched — several user-visible changes. SHOULD-FIX.
2. "both human-approved" is inaccurate: the closed decision ticket covers ONLY id
   resolution (#9). Divergence #8's duplicate-row removal has no approval record.
   `dep cycle`'s corrected algorithm IS sanctioned by the pre-existing whitelist note
   ("Remove this whitelist when T4 flips `dep cycle` to TS"). SHOULD-FIX (labeling).
3. `test/graph-commands.test.ts:63-66` — test name says the dangling dep is printed; the
   assertion says the opposite (and the assertion is the correct bash behavior).
   SHOULD-FIX.
4. `src/core/id.ts:94-95` stale comment ("Needs human confirmation…") — the ticket it
   points at is closed and confirmed. NICE-TO-HAVE.
5. `dep-cycle.ts:51` passes a pre-padded id into `TicketRow.identified(id, …)`.
   NICE-TO-HAVE.
6. Unreachable re-check at `dep-graph.ts:321-324`. NICE-TO-HAVE.

Nothing BLOCKING. No test or scenario was deleted (checked the feature diff: additions
only; `dump.ts` lost tree/cycle modes but those were fixtures, replaced by real-CLI
comparisons — a strict improvement).

## Open suspicions / things a clone should look at next

- The pager path really is untested. I agree with the 80/20 call (TTY-only, bash had no
  test either), but note the missing-pager message now reads `Error: less: command not
  found` where bash said `./ticket: line NNN: less: command not found` — an undeclared
  (if trivial) wording divergence, same shape as the jq one that DID get a CHANGELOG line.
- `IdResolver` reports the TRIMMED search in its error message, so `tk show " abc "` says
  `ticket 'abc' not found` where bash quoted the untrimmed string. Pre-existing from T2/T3,
  not introduced here, but it is not in the whitelist.
- `show` on a repo with two files carrying the same id: bash echoes the file `ticket_path`
  picked, TS echoes whichever `IdResolver` picked while the graph keeps last-wins. Not
  exercised anywhere. Very low value; T6 makes it moot.
- Edge: bash prints a bare `## Linked` heading when `links:` is non-empty but every entry
  is empty (e.g. `links: [,]`); TS omits it. Not worth a ticket.

---

# CONFIRMATION PASS (fresh instance, commit `4604477`)

## Gates I ran myself — ALL FOUR EXIT 0

`make build` 0 / `make unit-test` 0 (289 pass) / `make test` 0 (12 features, 214
scenarios, 1420 steps) / `make parity` 0 (graph 69 scenarios, 0 failures, 19 whitelisted).
Logs: `.tmp/cnf_{build,unit,test,parity}.log`, summary `.tmp/cnf_results.txt`.

## MY PREDECESSOR (me) WAS WRONG ABOUT THE `layoutChildren` RE-CHECK

The unreachability proof covered only the cross-sibling-subtree case. It **missed
duplicate `deps` entries**: `depsOf` returns `Ticket.deps` verbatim (no dedup),
`printableChildren` only filters+sorts, so `deps: [b, b]` puts `b` in `children` TWICE.
First push does `printed.add(b)`; the deleted re-check was what suppressed the second.

Empirically reproduced (`.tmp/duptest`, bash ref `.tmp/ticket_bash` = both TS lists
emptied):
- `ticket_bash dep tree aaa` → ONE `├── bbb` row.
- `./ticket dep tree aaa` @ 4604477 → TWO rows (`├──` + `└──`). DIVERGENCE.
- `.tmp/verify/ticket` (built from `c0b49c2` via `git archive`) → ONE row, matches bash.
- `--full` matches on both sides (isPrintable IS state-independent there — that half of
  the argument holds).

Lesson: my earlier mutation run "parity stayed green" was NOT evidence of unreachability —
the parity graph generator never emits duplicate `deps`. **Do not infer unreachability
from a green differential harness whose generator you have not read.** Should have checked
`Ticket.deps` for dedup before asserting a snapshot list has distinct elements.

Also worth a follow-up ticket: parity generator gap (no duplicate `deps`).

## Corrections to my earlier findings

- IMPORTANT #1 (CHANGELOG untouched) was **WRONG**: `git diff d86f193 HEAD -- CHANGELOG.md`
  shows 7 insertions covering all six items. (`git log <range> -- CHANGELOG.md` printed
  nothing for me — do not trust it here, diff the trees.)

## Items 2 and 3 — genuinely clean

- `scripts/parity/README.md:103-106` + `migration-to-ts-high-level.md:115-120` carry an
  explicit "shipped but PENDING HUMAN SIGN-OFF" block naming
  `nid_qxt3z5unr9k220aqttbw84a6a_e`. Grep for `approved` leaves only the #9 mention, which
  is accurate. Ticket file exists, `status: open`, `tags: [decide, ts-port]`.
- `paddedIdentified` added, `idColumn` private, sole external caller now passes a raw id.
- Test renamed to "omits a dangling dependency…"; awk comment moved to the `show` test.
- `src/core/id.ts` pointer and `CLAUDE.md` both-lists wording correct.

## Verdict: NOT READY — 1 blocking (restore the re-check + regression test).

---

# CONFIRMATION PASS 2 (fresh instance, commit `2176db8`)

Narrow scope by instruction: the fix for my blocking finding, the non-vacuity of the new
guards, the `_show_mismatches` set-comparison judgement call, and the four gates.

## Gates, measured on the untouched tree (`git status` clean)

| Gate | rc | Result |
|---|---|---|
| `make build` | **0** | `dist/ticket.mjs` |
| `make unit-test` | **0** | tests 291 / pass 291 / fail 0 / skipped 0 |
| `make test` | **0** | 12 features, 214 scenarios, 1420 steps, 0 failed |
| `make parity` | **0** | graph OK scenarios=71 failures=0 (19 whitelisted), query OK, slug OK |

Logs `.tmp/c2_g_{build,unit,test,parity}.log`. Matches the implementer's round-3 table exactly.

## 1. Regression IS fixed — verified byte-wise, not taken on faith

Fixture `.tmp/c2/repo` (`aaa` deps `[bbb, bbb]`, `bbb` deps `[ddd]`, `ccc` deps `[aaa]`),
reference `.tmp/c2/ticket_bash` = `ticket` with BOTH `TS_COMMANDS` and `TS_DEP_SUBCOMMANDS`
sed-emptied. `diff -u` bash vs `./ticket` for `dep tree {aaa,ccc}` and `dep tree --full
{aaa,ccc}`: **all four IDENTICAL, rc 0/0**. Default prints `├── bbb` once; `--full` prints
both. Guard is back at `src/core/dep-graph.ts:326-328` with a comment naming duplicate
`deps` as the reason.

## 2. New guards are NON-VACUOUS — proven by my own mutation

Throwaway `git archive HEAD` copy at `.tmp/mut2` (symlinked `node_modules`); real tree never
touched.

- Guard deleted ⇒ `make unit-test` **rc=2**, pass 290 / fail 1, and the ONE red test is
  *"prints a duplicated dependency once, keeping the branch connector"* (actual
  `['a','├── b','└── b']`). Exactly as claimed.
- Guard deleted ⇒ `make parity` **rc=2**, `failures=2`: `MISMATCH scenario=[duplicate-dep]
  check=[dep tree a]` and `scenario=[duplicate-dep-with-subtree]`. The harness hole is closed.

## 3. THE JUDGEMENT CALL — the set comparison DOES weaken `_show_mismatches`. FINDING.

Reasoning first (all sound): a genuinely MISSING row is still caught (its content drops to
zero occurrences on one side, so the sets differ); MANGLED content is caught (different set
element); WRONG SECTION is caught (source set loses it, destination set gains it, plus the
`list(bash_sections) != list(ts_sections)` heading check). Only **MULTIPLICITY** differences
are now invisible.

But the dedup was applied to ALL FOUR headings while divergence #8 covers only `## Blocking`.
Measured bash behavior on `.tmp/c2/showrepo` (`tgt` with `deps: [d1, d1, ghost, ghost]`,
`links: [l1, l1, nolink, nolink]`): bash prints **two** `- d1`, **two** `- ghost []`, **two**
`- l1`, **two** `- nolink []`. TS matches today (diff shows ONLY the known `## Blocking` row).
So Blockers/Linked multiplicity is real contracted behavior that nothing checks any more.

**Concrete regression that now slips through, executed not argued.** In `.tmp/mut2`, one
plausible line in `src/cli/commands/show.ts:109` — `[...new Set(ids)].map(...)`, i.e. "list
each ticket once", the exact phrasing of #8's own comment — dedupes every section. Result:
`make unit-test` **rc=0** and `make parity` **rc=0, failures=0**. A silent divergence from
bash in `## Blockers` and `## Linked` ships green. No unit test covers it either
(`test/graph-commands.test.ts` Blockers/Linked tests use single-element fixtures).

**Fix, verified end to end in `.tmp/mut2`:** dedupe only for `## Blocking`, e.g.
```python
dedupe = (lambda rows: sorted(set(rows))) if heading == "## Blocking" else sorted
if dedupe(bash_rows) != dedupe(ts_sections[heading]):
```
- with the show-dedup mutation ⇒ parity **rc=2**, `MISMATCH … check=[show a (## Blockers
  rows)]` on BOTH new duplicate-dep scenarios. Caught.
- with clean sources ⇒ parity **rc=0**. No false positive from divergence #8.

So the new fixtures already carry the duplicate `deps` needed to make the narrow comparator
bite; the broad dedup is what throws that coverage away. Same failure shape as the round-2
regression: a guard weakened by argument instead of measured.

## Verdict: NOT READY — 1 blocking (harness-only, one line + a README wording tweak).
