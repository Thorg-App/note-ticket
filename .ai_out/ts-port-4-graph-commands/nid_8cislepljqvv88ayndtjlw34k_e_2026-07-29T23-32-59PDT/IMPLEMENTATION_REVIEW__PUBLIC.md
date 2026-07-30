# Implementation review — T4 graph commands (`dep tree`, `dep cycle`, `show`)

Ticket `nid_8cislepljqvv88ayndtjlw34k_e`. Commits `94242f2`, `e934523`, `3019ca9`
(base `d86f193`). Reviewed read-only; nothing in the tree was modified.

## Summary

`dep tree [--full] <id>`, `dep cycle` and `show <id>` are now served by the TS bundle.
`show` flips through `TS_COMMANDS`; `dep` correctly does **not** — only its `tree`/`cycle`
branches delegate, from inside bash `cmd_dep`, driven by a second list
`TS_DEP_SUBCOMMANDS`, with both lists consumed by the shared `_ts_serves`/`_exec_ts`
helpers. That is exactly what the ticket asked for and it is the cleanest shape available:
one delegation mechanism, one rollback gesture, and the parity harness was taught to empty
**both** lists (and to fail loudly if either assignment disappears).

The port is careful work. The gnarliest parts — bash's three-pass tree layout, the
subtree-depth refinement, awk's `getline` newline semantics, the `%-8s` padding, the
dangling-id `ghost [] ` row — were measured against `./ticket`, not guessed, and I
confirmed one of the subtlest by mutation myself. `src/core` stayed free of CLI knowledge
(the only core addition is `DepGraph.blockerIdsOf`, which also DRYs `blocked()`).
No test or BDD scenario was removed; `dump.ts`'s `tree`/`cycle` modes went away only
because those checks now run through the real CLI, which is strictly stronger.

**No blocking issues.** Findings below are one documentation gap, one accuracy problem in
how a divergence is labelled, one misleading test name, and three cosmetics.

## Verification (my own runs, not the report's)

| Command | Exit | Actual result |
|---|---|---|
| `make build` | 0 | `dist/ticket.mjs` 61.3kb |
| `make unit-test` | 0 | 289 tests, 289 pass, 0 fail |
| `make test` | 0 | 12 features, **214 scenarios**, 1420 steps, 0 failed |
| `make parity` | 0 | graph OK (69 scenarios, 0 failures, 19 whitelisted bash bogus cycles), query OK, slug OK |

Identical to the implementer's report. No discrepancy.

### Independent mutation checks (throwaway copy under `$PWD/.tmp/`, since deleted)

I picked the two subtlest guards myself rather than re-running the implementer's list.

1. **Memoize `TreeLayout.measureSubtreeDepths`** (`if (this.subtreeDepth.has(id)) return;`,
   `src/core/dep-graph.ts:301`) — the "refinement" behaviour the WHY comment at
   `src/core/dep-graph.ts:294-300` claims is load-bearing.
   → `make unit-test` **passed** (survives), `make parity` **failed**:
   `MISMATCH scenario=[random#42] check=[dep tree --full n4]`.
   The comment is true and the behaviour is really guarded — by parity, not by unit tests.
   This is the strongest evidence that bash was measured rather than imagined.
2. **Delete the re-check in `TreeLayout.layoutChildren`** (`src/core/dep-graph.ts:321-324`)
   → unit tests **and** `make parity` both stayed green. Analysed: it is unreachable. A
   sibling is listed only when `depth + 1 === maxDepth[child]`, and inside an earlier
   sibling's subtree that child can only occur at depth ≥ `depth + 2` > `maxDepth`, so it
   can never have been printed in between; in `--full` mode `isPrintable` is
   state-independent, so it is a pure no-op there. Harmless (it mirrors bash's pop-time
   check) but see Suggestion 3.

I also confirmed by reading that the two guards flagged as previously-vacuous are now
real: `test/dep-graph.test.ts` gained the `other-child` (`parent: elsewhere`) fixture, so
a "has any parent" mutation of `children()` fails; and the empty-id BDD scenario runs
through `shell=True` on `<script> show ""`, so a genuinely empty argv element reaches the
CLI rather than no argument at all.

### Parity reasoning done by hand (all matching)

Tree pre-order and connector assignment, `maxDepth` over every simple path, cycle
rotation over `parts[2..n-1]`, `show`'s Blockers/Blocking/Children/Linked semantics
(including that Blocking filters on `status != "closed"` and NOT on `isFinished`, and that
Children include closed tickets), fence counting, the empty-tickets-dir short circuits,
and the fact that bash's `init_tickets_dir` runs *before* `cmd_dep` so the missing-dir
error is still bash's. Security: `Pager` uses `spawnSync(binary, args)` with no shell —
same as bash's `read -a` + exec, so no new injection surface.

## 🚨 CRITICAL Issues

None.

## ⚠️ IMPORTANT Issues

### 1. CHANGELOG.md was not updated (SHOULD-FIX)

`CLAUDE.md` requires a CHANGELOG entry for "new commands, flags, bug fixes, behavior
changes". This change ships at least six user-visible ones and CHANGELOG.md is untouched:

- an **empty id no longer resolves** — `tk show "$UNSET_VAR"` used to print an arbitrary
  ticket in a one-ticket repo and now fails. This is the one a user could be bitten by;
- `dep tree <full-id>` now resolves where it used to say "ambiguous";
- `dep cycle` no longer prints bogus cycles and no longer misses real ones;
- `show` lists a duplicate dependent once instead of twice;
- `dep tree` / `dep cycle` / `show` now **hard-error on a `.md` with no `id`**. The
  existing `Changed` bullet explicitly enumerates which commands that is live for
  (`ls`/`list`, `ready`, `blocked`, `closed`, `query`) and promises "the remaining
  enumerating commands follow as they are delegated" — that list now needs extending;
- a missing `$TICKET_PAGER` binary now reports `Error: <pager>: command not found`
  instead of the shell's `./ticket: line NNN: …` (the same shape as the `jq` change,
  which *did* get a CHANGELOG line).

The report defers this to TOP_LEVEL_AGENT. Fine as a division of labour, but it must not
be dropped — flagging so it is tracked.

### 2. "Both human-approved" overstates the record for divergence #8 (SHOULD-FIX)

`IMPLEMENTATION_WITH_SELF_PLAN__PUBLIC.md:74` says "Declared divergences from bash (**both
human-approved**)". I read the closed decision ticket
(`_tickets/confirm-intentional-id-resolution-error-path-changes-before-flipping-readwrite-commands.md`):
it covers **only** id resolution, i.e. divergence #9. Divergence #8 has two halves:

- the **ordering** half is unavoidable and needs no approval — bash's order is awk hash
  order, i.e. unspecified, so any implementation must choose something;
- the **duplicate-row removal** (a ticket naming the target twice in `deps` was printed
  twice under `## Blocking`) is a real, deliberate behaviour change with no approval
  record anywhere I can find.

It is obviously a bug fix, it is documented in three places and pinned by
`check_graph._check_show_duplicate_blocking`, so I am not asking for it to be reverted —
I am asking for it to be **labelled honestly**: "#9 approved in
`nid_5g3eta9cf7yi6iukmscxma6wc_e`; #8's duplicate-row removal is a new fix awaiting
sign-off". Per CLAUDE.md, deviations from existing behaviour need human approval, and
mislabeling one as already-approved is exactly the kind of thing that erodes trust in the
divergence list.

(For contrast, `dep cycle`'s corrected algorithm — divergence #1 — *is* sanctioned: the
pre-existing whitelist entry said "Remove this whitelist when T4 flips `dep cycle` to TS",
so the plan of record already anticipated it. No issue there.)

### 3. A test name asserts the opposite of what the test checks (SHOULD-FIX)

`test/graph-commands.test.ts:63-66`:

```ts
it("prints a dangling dependency with empty status and title in --full mode", () => {
    const graph = graphOf([{ id: "a", deps: ["ghost"] }]);
    assert.equal(DepTreeCommand.render(graph, "a", true), "a [open] a\n");
});
```

The assertion says the dangling dependency is **not** printed — and that is the correct,
bash-matching behaviour (`isPrintable` requires `maxDepth.has(id)`; bash's `build_children`
has the same `!(child in max_depth)` skip). The name and the leading comment describe the
`show`/`dep cycle` dangling-row case instead. CLAUDE.md: "Behavior MUST thoroughly match
Naming." Suggest renaming to something like *"omits a dangling dependency from the tree,
even in --full mode"* and moving the awk-array comment to where `ghost [] ` is actually
asserted (`test/graph-commands.test.ts:149-151`).

## 💡 Suggestions

1. **Stale pointer in `src/core/id.ts:94-95`** — "Needs human confirmation before the
   write commands are flipped — ticket `nid_5g3eta9cf7yi6iukmscxma6wc_e`." That ticket is
   closed and the decision was made; the comment now misinforms whoever does T5.
2. **`src/cli/commands/dep-cycle.ts:51`** —
   `TicketRow.identified(TicketRow.idColumn(id), open.get(id))` passes a pre-padded id into
   a parameter whose doc calls it `id`. It composes correctly, but the padding knowledge
   arrives sideways. A `TicketRow.paddedIdentified(...)` (or an options arg) would say what
   it means. Cosmetic.
3. **`src/core/dep-graph.ts:321-324`** — the re-check is unreachable (proved by mutation
   above: removing it left both unit tests and parity green, and the argument for why is in
   the review body). It mirrors bash's pop-time check, which is a defensible reason to
   keep it, but the comment "Re-checked here because an earlier sibling's subtree may have
   printed it" claims a scenario that cannot occur. Either drop it or change the comment to
   say it mirrors bash's structure and is not reachable.
4. **`CLAUDE.md`** — the long "Bash behavior is the contract" paragraph still says the
   harness diffs a copy "with `TS_COMMANDS` emptied"; the new paragraph above it correctly
   says both lists. One-word fix for consistency.

### On the implementer's flagged gap (the pager)

I agree it is an acceptable 80/20 call, not a real risk. It runs only when stdout is a
TTY, which neither BDD nor parity can produce; bash had no test for it either; and the
code is a faithful, simpler-than-bash reading of the `pipefail` contract via the shared
`ChildExit`. The one thing worth capturing is the **wording** change for a missing pager
binary (see IMPORTANT #1) — that is a user-visible string, and the analogous `jq` change
was both CHANGELOG'd and pinned.

## Documentation Updates Needed

- `CHANGELOG.md` — the six items in IMPORTANT #1, including extending the existing
  missing-`id` bullet's command list.
- `IMPLEMENTATION_WITH_SELF_PLAN__PUBLIC.md:74` and, if it repeats the claim, the
  divergence prose — correct the "both human-approved" labelling (IMPORTANT #2).
- `src/core/id.ts:94-95` — drop the "needs human confirmation" pointer.
- `CLAUDE.md` — one-list/two-list wording (Suggestion 4).

`README.md`, `docs-internal/migration-to-ts-high-level.md` and `scripts/parity/README.md`
are all updated correctly and thoroughly; divergences #8 and #9 are described in both the
parity README and the migration doc, and each is pinned by a check.

## Readiness

**READY** — no blocking issues. The three SHOULD-FIX items (CHANGELOG, the "both
human-approved" labelling, the misleading test name) are small and none of them affect
shipped behaviour; they should land before the ticket is closed, but they do not warrant
another implementation round on their own.
