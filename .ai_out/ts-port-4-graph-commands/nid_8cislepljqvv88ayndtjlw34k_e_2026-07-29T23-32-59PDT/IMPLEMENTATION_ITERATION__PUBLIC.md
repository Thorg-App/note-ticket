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
