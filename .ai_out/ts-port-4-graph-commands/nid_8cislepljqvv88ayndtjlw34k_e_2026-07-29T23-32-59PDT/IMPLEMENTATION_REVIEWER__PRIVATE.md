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
