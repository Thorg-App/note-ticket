# Confirmation pass — review follow-up commit `4604477`

Narrow scope: confirm the four items the implementer addressed after
`IMPLEMENTATION_REVIEW__PUBLIC.md` signalled READY. Read-only; nothing in the tree was
modified by me.

## Readiness

**NOT READY — 1 BLOCKING issue.**

Blocking list:

1. **`src/core/dep-graph.ts:317-333` — deleting the `isPrintable` re-check in
   `TreeLayout.layoutChildren` introduced a real bash-vs-TS divergence.** The code was
   NOT unreachable. Reproduced empirically against the pinned bash (below).

Everything else in the follow-up commit is correct and confirmed.

## Gate results (my own runs, sequential, logs under `$PWD/.tmp/cnf_*.log`)

| Command | Exit | Actual result |
|---|---|---|
| `make build` | **0** | bundle built |
| `make unit-test` | **0** | 289 pass, 0 fail, 0 skipped (duration 98.8 ms) |
| `make test` | **0** | 12 features, 214 scenarios, 1420 steps, 0 failed (6.7 s) |
| `make parity` | **0** | graph OK scenarios=69 failures=0 (19 whitelisted bash bogus cycles); query OK; slug OK |

Identical to the previous round. **All four gates are green and they do NOT catch the
blocking issue** — see the coverage gap below.

## Item 1 — the deleted re-check: BLOCKING

The predecessor's unreachability argument covers the *cross-sibling-subtree* case and is
correct for it. It misses the case where **`deps` contains the same id twice**, so the
snapshot `children` list itself contains that id twice. `DepGraph.depsOf()` returns
`Ticket.deps` verbatim (`src/core/ticket.ts:69` → `frontmatter.getArray`), with **no
dedup**, and `printableChildren()` only filters and sorts — duplicates survive.

In non-`--full` mode, the first occurrence does `this.printed.add(child)` at push time, so
the second occurrence's re-check used to suppress it. With the re-check gone, the second
occurrence is printed too.

### Reproduction (fixture at `/home/nickolaykondratyev/git_repos/note-ticket/.tmp/duptest`)

`_tickets/a.md` = `id: aaa`, `deps: [bbb, bbb]`; `_tickets/b.md` = `id: bbb`, `deps: []`.

Bash reference = a copy of `ticket` with **both** delegation lists emptied
(`/home/nickolaykondratyev/git_repos/note-ticket/.tmp/ticket_bash`).

```
$ ticket_bash dep tree aaa          $ ./ticket dep tree aaa   (HEAD 4604477)
aaa [open] A                        aaa [open] A
├── bbb [open] B                    ├── bbb [open] B
                                    └── bbb [open] B      <-- EXTRA ROW
```

I then built the **pre-deletion** commit `c0b49c2` into a throwaway copy
(`$PWD/.tmp/verify`, via `git archive`) and ran the same fixture:

```
$ .tmp/verify/ticket dep tree aaa
aaa [open] A
├── bbb [open] B          <-- byte-identical to bash, ├── quirk included
```

So the deletion, not anything else, is the cause. `dep tree --full aaa` is unaffected
(both sides print two rows) — consistent with the "`isPrintable` is state-independent in
`--full`" half of the argument, which does hold.

### Why this input is not hypothetical

`tk dep <a> <b>` does dedupe ("Dependency already exists"), so the CLI cannot create it.
But tickets are plain markdown that this project explicitly expects to be hand-edited and
moved, and **this very change already treats duplicate `deps` entries as a real input
class**: divergence #8 exists solely because "a ticket naming the target twice in `deps`"
was printed twice by `show`, and it is pinned by
`scripts/parity/check_graph._check_show_duplicate_blocking`. The same repo state that
motivates #8 now silently produces a wrong `dep tree`.

### Suggested fix

Restore the re-check and correct its comment (the predecessor's Suggestion 3 asked for
*either* removal *or* a corrected comment; the comment option was the safe one):

```ts
// Re-checked because an earlier sibling may BE this same id: `deps` is not deduped,
// so a duplicate entry appears twice in `children` and the first push marked it printed.
if (!this.isPrintable(child, depth + 1, path)) {
    return;
}
```

Add a unit test in `test/dep-graph.test.ts` / `test/graph-commands.test.ts` for
`deps: ["b", "b"]` in non-`--full` mode (one row, `├──` connector) and in `--full` mode
(two rows), and — separately, since this is a harness gap — teach the parity graph
generator to emit a duplicate `deps` entry sometimes.

### Secondary finding (not blocking, but the reason this slipped)

`make parity`'s random graph generator never produces a duplicate `deps` entry, which is
why both the implementer's re-run and my predecessor's mutation experiment stayed green.
Worth a follow-up ticket even after the fix lands.

## Item 2 — divergence #8 labelling: CONFIRMED CLEAN

- `scripts/parity/README.md:103-106` now carries an explicit **Approval status** block:
  order half needs no approval; duplicate-row removal is "shipped but PENDING HUMAN
  SIGN-OFF", ticket `nid_qxt3z5unr9k220aqttbw84a6a_e`, and states it is NOT covered by the
  id-resolution decision ticket.
- `docs-internal/migration-to-ts-high-level.md:115-120` says the same.
- Grep for `human-approved`/`approved` across `scripts/parity/README.md`,
  `docs-internal/migration-to-ts-high-level.md`, `src/core/id.ts`, `CHANGELOG.md` and the
  self-plan: the only surviving "approved" is `migration-to-ts-high-level.md:114`, which is
  about **#9** and is accurate. The self-plan heading is now "approval status differs per
  divergence". **No text still claims #8 is human-approved.**
- Ticket `_tickets/human-sign-off-shows-blocking-duplicate-row-removal-ts-port-divergence-8.md`
  exists, `status: open`, `tags: [decide, ts-port]`. Correct.

## Item 3 — the small ones: CONFIRMED CLEAN

- `TicketRow.paddedIdentified()` added (`src/cli/ticket-row.ts:60-63`); `idColumn` is
  `private` again (`:71`). Grep confirms the only external caller is
  `src/cli/commands/dep-cycle.ts:51`, which now calls `paddedIdentified(id, …)` — the raw
  id, so the padding knowledge stays inside `TicketRow`. No other file references
  `idColumn`.
- `test/graph-commands.test.ts:62` renamed to *"omits a dangling dependency from the tree,
  even in --full mode"*, matching its assertion; the awk-array WHY comment moved to
  `:150`, above the `show` test that actually asserts `- ghost [] `. Correct.
- `src/core/id.ts:94-95` — stale "needs human confirmation" replaced with "Confirmed as a
  bug by the owner in `nid_5g3eta9cf7yi6iukmscxma6wc_e` (closed); whitelisted divergence
  #9". Accurate.
- `CLAUDE.md:37` now says the harness empties "BOTH delegation lists (`TS_COMMANDS` and
  `TS_DEP_SUBCOMMANDS`)". Correct.
- Bonus: `CHANGELOG.md` **is** updated on this branch (7 insertions vs base `d86f193`) and
  covers all six user-visible items from the review's IMPORTANT #1, including the extended
  missing-`id` command list, the empty-id change, the `dep tree <full-id>` resolution, the
  pager wording, the `dep cycle` fix and the `show` duplicate-row fix. My predecessor's
  IMPORTANT #1 is satisfied.

## Bottom line

Three of the four follow-up items are clean. The fourth — the one flagged as riskiest —
turned a correct, load-bearing guard into a behavior divergence on an input class this
change itself already recognises. Restore the guard (with a corrected comment) plus a
regression test, and this is ready.

---

# Confirmation pass 2 — commit `2176db8` (narrow scope)

Scope by instruction: (1) is the blocking regression really fixed, (2) are the new guards
non-vacuous, (3) the judgement call the implementer flagged — the `show` set comparison,
(4) re-run the four gates. Nothing already cleared was re-opened.

## Gates — ACTUAL exit codes, run by me on the untouched tree

| Gate | rc | Result |
|---|---|---|
| `make build` | **0** | `dist/ticket.mjs` built |
| `make unit-test` | **0** | tests 291 / pass 291 / fail 0 / skipped 0 |
| `make test` | **0** | 12 features, 214 scenarios, 1420 steps, 0 failed |
| `make parity` | **0** | graph OK scenarios=71 failures=0 (19 whitelisted), query OK, slug OK |

Working tree clean. The implementer's round-3 table is accurate.

## 1. Regression fixed — CONFIRMED byte-wise against pinned bash

Reference = `ticket` with BOTH `TS_COMMANDS` and `TS_DEP_SUBCOMMANDS` emptied. Fixture:
`aaa` with `deps: [bbb, bbb]`, `bbb → ddd`, plus `ccc → aaa` so the duplicate also sits one
level down. `diff -u` bash vs `./ticket`, rc 0/0, for all four invocations
(`dep tree aaa`, `dep tree ccc`, and both with `--full`): **byte-identical**. Default emits
`├── bbb` once, `--full` emits both. The report's table holds.

## 2. New guards — CONFIRMED non-vacuous by my own mutation

In a throwaway `git archive HEAD` copy (real tree untouched), deleting the guard again:

- `make unit-test` → **rc=2**, 290 pass / 1 fail, the red one being exactly *"prints a
  duplicated dependency once, keeping the branch connector"*.
- `make parity` → **rc=2**, `failures=2`, `MISMATCH … check=[dep tree a]` on both
  `duplicate-dep` and `duplicate-dep-with-subtree`.

## 3. JUDGEMENT CALL — 🚨 the set comparison is TOO BROAD (blocking, harness-only)

Answering the four questions directly: a **missing** row is still caught, **mangled content**
is still caught, and a row in the **wrong section** is still caught (both sets change, and
the heading list is still compared in order). Only **multiplicity** is now invisible — and
that is broader than divergence #8, which is `## Blocking` ONLY.

Measured bash behavior (fixture `tgt` with `deps: [d1, d1, ghost, ghost]`,
`links: [l1, l1, nolink, nolink]`): bash prints each of those rows **twice** under
`## Blockers` and `## Linked`, and TS matches today — the only diff is the known
`## Blocking` row. That duplicate-preserving behavior is now unguarded.

**Concrete input that slips through (executed, not argued):** change
`src/cli/commands/show.ts:109` to `[...new Set(ids)].map(...)` — a one-line "list each ticket
once" cleanup, the exact phrasing of #8's own comment. Result: `make unit-test` **rc=0**,
`make parity` **rc=0, failures=0**. A silent `## Blockers`/`## Linked` divergence from bash
ships green. The unit tests do not cover it either: the Blockers and Linked tests in
`test/graph-commands.test.ts` use single-element fixtures.

**Fix — one line, and I verified BOTH directions in the throwaway copy:**

```python
# in _show_mismatches, replace the unconditional `sorted(set(...))`
dedupe = (lambda rows: sorted(set(rows))) if heading == "## Blocking" else sorted
if dedupe(bash_rows) != dedupe(ts_sections[heading]):
```

- with the `show` dedup mutation ⇒ parity **rc=2**, `MISMATCH … check=[show a (## Blockers
  rows)]` on both new duplicate-dep scenarios → caught.
- with clean sources ⇒ parity **rc=0** → no false positive from divergence #8.

The two new fixtures already contain the duplicate `deps` that make this bite; the broad
dedup is precisely what discards that coverage. Please also narrow the `check_graph.py`
comment and the `scripts/parity/README.md` #8 wording to say the dedup applies to
`## Blocking` only.

This is the same failure shape as the round-2 regression — a guard weakened by argument
rather than by measurement — which is why it is called blocking rather than a suggestion,
despite being harness-only and cheap.

## Not findings

Shipped behavior is correct and byte-verified; no test or scenario was removed; the round-1
and round-2 items stay clean.

# FINAL READINESS: **NOT READY**

Blocking list (1 item, harness-only):

1. `scripts/parity/check_graph.py` `_show_mismatches` — restrict the set (dedup) comparison
   to `## Blocking`; keep the multiset (`sorted`) comparison for `## Blockers`,
   `## Children`, `## Linked`. Update the adjacent comment and `scripts/parity/README.md`
   divergence #8 wording to match. Fix verified above in both directions.
