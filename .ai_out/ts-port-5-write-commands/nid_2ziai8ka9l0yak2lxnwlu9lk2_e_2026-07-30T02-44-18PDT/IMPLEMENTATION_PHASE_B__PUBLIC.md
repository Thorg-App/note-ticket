# IMPLEMENTATION_PHASE_B__PUBLIC — T5 phase B: `dep <id> <dep-id>` / `undep` / `link` / `unlink`

For the reviewer and for phase C. All paths repo-relative. Nothing committed.

## Scope delivered

`dep` (whole command, write form included), `undep`, `link` and `unlink` are ported and
flipped into `TS_COMMANDS` (`ticket:1600`, now `… create status start close reopen dep undep
link unlink`). `TS_DEP_SUBCOMMANDS="tree cycle"` is **kept** with a comment saying why
(`scripts/parity/harness.py` requires exactly one assignment per delegation variable, and
emptying it is half of a `dep` rollback); `cmd_dep`'s now-unreachable delegation block is left
in place with its comment corrected, since the whole function is dead until the T6 deletion.

Every bash string, stream and exit code in scope is reproduced exactly, verified against the
pinned bash copy: the 3-line `dep` usage block, the single-line `undep`/`link`/`unlink` usage
lines (all hardcoding the literal `ticket`), `Added dependency: <full> -> <full>`,
`Removed dependency: <full> -/-> <full>`, `Removed link: <id> <-> <id>`,
`Added <n> link(s) between <N> tickets`, `All links already exist`,
`Dependency already exists` (stdout, exit 0), `Dependency not found` / `Link not found`
(**stdout**, exit 1), and the 2/6/4 link counts the existing scenarios pin.

## Files changed

New: `src/core/ticket-relations.ts`, `src/cli/commands/undep.ts`,
`src/cli/commands/link.ts`, `src/cli/commands/unlink.ts`, `test/ticket-relations.test.ts`,
`test/relation-commands.test.ts`.

Modified: `ticket` (TS_COMMANDS + two comments), `src/cli/commands/dep.ts` (write branch),
`src/cli/main.ts` (3 new cases; `dep` now resolves through `forWriteCommand()`),
`scripts/parity/check_write.py` (+56 cases), `features/ticket_dependencies.feature`,
`features/ticket_links.feature`, `scripts/parity/README.md`,
`docs-internal/migration-to-ts-high-level.md`, `CLAUDE.md`, `README.md`.

Not touched per instructions: `CHANGELOG.md`. No existing scenario was changed or removed —
all 229 pre-existing ones pass unmodified.

**Shared piece phase C should reuse:** `src/core/ticket-relations.ts` —
`TicketRelation.DEPENDENCY` / `.LINK` own the add/remove/membership rules for the two id
arrays (`idsOf`, `withAdded`, `withAllAdded`, `withRemoved`; "no change" is `undefined`, which
is exactly the branch each command needs for its message and makes "no change ⇒ no write"
structural). Command shape is Phase A's: `X.run(store, args): number`, `UsageError` for bash's
un-prefixed usage lines, `CliError` for `Error: …`. None of these commands needs
`CommandEnvironment` — bash restamps nothing here and every usage line is literal.

## Divergences declared (continuing from #12)

All six are in `scripts/parity/README.md`, `docs-internal/migration-to-ts-high-level.md`, and
a `DIVERGENCE` comment at the code that causes them.

- **#13** `deps`/`links` are id ARRAYS, not text: membership and removal are whole-element.
  bash's `grep`/`sed` made a substring id read as present and mangled the sibling it was
  contained in (`[t-1, t-111]` minus `t-1` really became `[11]`). Also covers canonical
  `[a, b]` re-serialization.
- **#14** `dep`/`undep` on a ticket with **no `deps:` field**: bash exited 1 printing NOTHING
  (its `yaml_field` pipeline fails, `set -euo pipefail` aborts the function); TS creates
  `deps: [<id>]` / prints `Dependency not found`.
- **#15** `link` on a ticket with **no `links:` field**: bash never created the field, counted
  0, and could print the misleading `All links already exist`; TS creates it.
- **#16** `link`/`dep`/`undep` edits are confined to the **frontmatter block**; bash's
  `/^links:/` and `s/^deps:.*/` also rewrote matching BODY lines (a body line made
  `tk link a b` report 3 added links).
- **#17** `link` de-duplicates arguments by resolved id and refuses a set that collapses to one
  ticket (`Error: nothing to link: every id resolves to ticket <id>`, exit 1); bash's
  `tk link a a` linked a ticket to itself and reported `Added 1 link(s) between 2 tickets`.
- **#18** appended link ids follow **argument order**; bash used awk's `for (id in need)` hash
  order (measured `[c, b]` for `link a b c` on this machine's mawk).

**Note for the human, no `decide` ticket filed:** #13–#16 are bug fixes for shapes where bash
corrupted data or died silently, i.e. the same class as the already-untickceted #10/#11/#12
bundled in `nid_r3mp6uylht7t77iwxtuqvhxv2_e`. **#17 is the one genuinely debatable call** — it
turns a (nonsensical) success into an error with a NEW message. I judged "a ticket related to
itself is data nobody can act on" worth refusing rather than half-applying, and it is one line
to revert. Flagging it here rather than blocking; adding it to that existing `decide` ticket is
a reasonable reviewer ask.

## How `check_write.py` was extended

+56 `Case(...)` entries (63 → **109**, all passing):
- 46 agreement cases: `dep` add / twice / second dep / self-dep / partial vs exact id /
  whitespace id / nested ticket in place / 0-and-1-arg usage / unknown-ambiguous ids / no
  tickets dir; `undep` only-dep, first-of-two, last-of-two, not-found, usage, unknown id;
  `link` pair, pair twice, a 3-ticket chain, usage, abort-without-mutation on a bad id (first
  and last position); `unlink` round trip, half link from each side, not found, links-less
  ticket, self, usage, unknown target.
- 10 `diverges=True` cases pinning #13 (×3), #14 (×2), #15, #16 (×2), #17.
- Three shared fixture sets added (`SUBSTRING_IDS`, `LINK_CHAIN`, `HALF_LINK`) plus a `_with()`
  helper so `BASE` stays the single description of the common tree.
- **Deliberately NOT added:** `link a b c` on three unlinked tickets. bash's append order is
  awk hash order, so neither "agrees" nor "diverges" is stable across awk builds and such a
  case could go red in CI on a different awk. The WHY-NOT is a comment in `CASES` and a
  paragraph in the parity README; `LINK_CHAIN` is shaped so every file gains exactly ONE id,
  which removes order from the comparison. TS's order is pinned by a unit test + a scenario.

## Tests added

**8 BDD scenarios** (`ticket_dependencies.feature` +4, `ticket_links.feature` +4): substring id
still added; removal leaves the containing sibling intact; `dep` creates a missing `deps`
array; `undep` on a deps-less ticket reports it missing; link append order asserted as the
whole `links` value; linking a links-less ticket; self-link refused; unlink leaves the
containing sibling intact.

Worth knowing: each of the four commands has at least one scenario that can only pass if TS
serves it (bash corrupts or dies on those inputs), so the `TS_COMMANDS` flip itself is pinned
per command, not assumed.

**31 unit tests** (365 total, was 334): `TicketRelation` reading/adding/removing —
missing-field, first-entry insert position, substring both ways, duplicate removal,
field isolation, multi-add order and count; `LinkClosure` — symmetric closure, argument order,
counts 2/6/4, unchanged tickets not rewritten, append-not-replace; the four usage blocks.

## Mutation evidence (real, unmasked exit codes)

Runner `.tmp/mutate_t5b.py` — each mutation is one literal source replacement, gates run with
`subprocess.run(...).returncode`, **no pipe anywhere**. Gates: `unit` = `make unit-test`,
`bdd` = `make build && behave` (behave alone, so a unit failure is not misread as a BDD one),
`parity` = `make parity`.

| # | mutation | caught by (rc) |
|---|---|---|
| M1 | membership by substring, as bash's grep | unit=2, parity=2 |
| M2 | removal by substring, as bash's sed | unit=2 |
| M3 | a missing field is not a relation to add to | bdd=1 |
| M4 | appended link ids in reverse order | unit=2, bdd=1 |
| M5 | count one link per ticket, not per appended id | unit=2, bdd=1 |
| M6 | rewrite every named ticket, changed or not | unit=2 |
| M7b | no de-duplication of link arguments | bdd=1 (parity=0, see below) |
| M8 | `dep` reports the typed ids, not the resolved ones | parity=2 |
| M9 | `undep` succeeds when the dependency is absent | bdd=1 |
| M10 | `Dependency not found` to stderr | bdd=1 |
| M11 | `Dependency already exists` fails | bdd=1 |
| M12 | `unlink` drops the link on the subject side only | bdd=1 |
| M13 | `unlink` decides existence from the TARGET's links | parity=2 |
| M14 | `Link not found` to stderr | bdd=1 |
| M15 | `link` and `deps` share one frontmatter field | unit=2, bdd=1 |
| M16 | `dep` does not save the ticket it changed | bdd=1 |
| M17 | `link` skips unresolvable ids instead of aborting | bdd=1 |
| M18 | `undep`'s usage line names `dep` | unit=2 |

**18/18 caught.** Two honest notes:
- My first M7 (`if (!distinct.has(id))` → `if (true)`) was an **equivalent mutant** — a `Map`
  de-duplicates regardless of the guard, so nothing could have caught it. Re-run as M7b, which
  removes the Map entirely; BDD catches it.
- M7b leaves `parity=0` **by construction**: its only relevant case is `diverges=True`, which
  merely demands the two sides differ, and the mutant differs from bash too (2 vs 1 links). An
  inverted expectation cannot pin the TS side; that is what the BDD scenario is for. Worth
  remembering when reading a green `make parity`.

## Gate results (each run separately, rc captured directly)

```
make typecheck  rc=0
make unit-test  rc=0   ℹ tests 365  ℹ pass 365  ℹ fail 0            (was 334)
make test       rc=0   12 features, 237 scenarios, 1589 steps, 0 failed   (was 229)
make parity     rc=0   graph OK 71 | query OK | slug OK 13 | write OK cases=109 failures=0
```

## Left undone

- Phase C owns `add-note` / `edit` and the shim reduction. `check_write.py` covers everything
  except those two — one `Case(...)` each.
- `CHANGELOG.md` is still stale (TOP_LEVEL_AGENT writes one entry). Content it now needs from
  this phase: the delegated-command list gains `dep`/`undep`/`link`/`unlink`, and the
  user-visible behavior changes are #14 (a missing `deps`/`links` field is now created instead
  of failing silently), #13 (ids matched whole, so `undep`/`unlink` no longer corrupt a
  similar-looking neighbour) and #17 (`tk link a a` is refused).
- `TicketStatus` union (Phase A's S3, ticket `nid_em5zmsstl3kz85jp8n70aidbb_e`) is untouched;
  this phase adds no new status handling, so it is still a clean post-C refactor.

---

# Iteration 1 — response to IMPLEMENTATION_REVIEW_PHASE_B__PUBLIC

Verdict acted on: READY, 0 BLOCKING, 3 SHOULD-FIX + 4 NITs. Targeted cleanup, no redesign.
Nothing committed. `CHANGELOG.md` still untouched.

## Findings: INCORPORATED / REJECTED

| Finding | Disposition |
|---|---|
| **I1/S1** #16 has no positive TS pin | **INCORPORATED.** New BDD scenario, plus an audit of #13–#18 (below) |
| **I2/S2a** self-link vs self-dep inconsistency | **INCORPORATED as "state the WHY".** Behavior kept on both sides; the rationale is now written down in `dep.ts`, `link.ts`, `scripts/parity/README.md` #17, the migration doc and user-facing `README.md` |
| **I2/S2b** no `decide` ticket for #17 | **INCORPORATED.** Appended to `nid_r3mp6uylht7t77iwxtuqvhxv2_e` |
| **I3/S3** stale `CHANGELOG.md` | **REJECTED on scope** as instructed (TOP_LEVEL owns the file). Verbatim correction below |
| **N1** `Ticket.deps`/`links` duplicate `TicketRelation.idsOf` | **INCORPORATED** |
| **N2** `link a a b` count unpinned | **INCORPORATED, but as a BDD scenario, not the suggested parity case** — see rationale |
| **N3** dead defensive clause in `LinkCommand.resolve` | **INCORPORATED** |
| **N4** #13 missing the non-array-scalar clause | **INCORPORATED, after measuring both sides** |
| Review's doc note: `EXPLORATION_PUBLIC.md` §3.4 is wrong | **INCORPORATED** — annotated in place |
| RM13 survivor | **No action, agreed** — `Frontmatter.getArray` already returns `[]` for an absent key, so the mutant is semantically identical |

### S1 — the audit the review asked for

Checked every divergence this phase declared for "pinned only by an inverted parity case":

| # | positive TS-side pin | verdict |
|---|---|---|
| #13 | BDD in both `ticket_dependencies.feature` and `ticket_links.feature` + unit tests | already pinned |
| #14 | two BDD scenarios | already pinned |
| #15 | one BDD scenario ("Linking a ticket with no links field …") | already pinned |
| #16 | **nothing** — its two `check_write` cases are both `diverges=True` | **GAP, fixed** |
| #17 | one BDD scenario (refusal); the mixed-list COUNT was unpinned → N2 | fixed |
| #18 | `LinkClosure` unit test + BDD asserting the whole `links` value | already pinned |

New scenario, `features/ticket_links.feature` — "A links line in the body is neither counted nor
rewritten": a raw ticket with **no frontmatter `links:`** and a body line `links: [ghost]`;
`tk link body-0001 link-0002` must print `Added 2 link(s) between 2 tickets`, the frontmatter must
become `links: [link-0002]`, and the body line must still read `links: [ghost]`.

**Why the fixture has no frontmatter `links:` (load-bearing):** TS addresses only the FIRST
occurrence of a key, so with a frontmatter `links:` present a body-swallowing bug edits the
frontmatter line anyway and the scenario is VACUOUS. I confirmed that by mutation — the first
version of the fixture survived MU-A. Do not "tidy" that fixture by giving it a `links: []`.

### S2a — the WHY, on the record

`tk link a a` is refused; `tk dep a a` is recorded, exactly as bash recorded it. That asymmetry is
deliberate: a `deps` entry is an edge in a graph the tool reasons about, so a self-edge is a real
error that `dep cycle` names and `ready`/`blocked` act on — reporting it is strictly more useful
than refusing the write. A `links` entry carries no graph semantics at all, so a self-link is
inert data no reader can act on. Rejected the alternative of extending the refusal to `dep`:
that is a *second* brand-new error string on a command whose bash behavior is otherwise
byte-exact, i.e. buying consistency with more divergence. The human can still choose it (option
(c) on the ticket).

### S2b — decide ticket

**`nid_r3mp6uylht7t77iwxtuqvhxv2_e`** (tag `decide`, still `open`) — appended a note covering
#17: what bash did, what TS does, the `dep a a` consequence, and three options (approve as
shipped / revert `link` to bash / extend the refusal to `dep`) each with its concrete cost. Also
retitled it (it read "four TS-port divergences"), pointed its body at the appended note, and
widened its acceptance criteria to `#6, #10, #11, #12, and #17`.

### N2 — why a scenario instead of a `Case(...)`

The suggestion was one `diverges=True` case. That is exactly the construct I1 proves cannot pin
the TS side: it asserts only that the two sides differ. New scenario "A repeated id is counted
once when other tickets remain" pins `Added 2 link(s) between 2 tickets` and both `links` values
positively, for the same effort.

### N4 — measured, not assumed

Verified against a pinned-bash copy before writing it down: on `deps: foo`, bash `dep aaa bbb`
prints `Added dependency: aaa -> bbb`, exits 0 and leaves the file **unchanged** — its insert is
`sed "s/\]/, $dep_id]/"` (`ticket:807`) and a scalar has no `]`. TS writes `deps: [foo, bbb]`.
Both facts are now in #13.

## Files changed in this iteration

`src/cli/commands/link.ts` (N3 rewrite of `resolve` + WHY), `src/cli/commands/dep.ts` (WHY-NOT),
`src/core/ticket.ts` (new `arrayField`), `src/core/ticket-relations.ts` (`idsOf` delegates),
`features/ticket_links.feature` (+2 scenarios), `scripts/parity/README.md` (#13/#16/#17),
`docs-internal/migration-to-ts-high-level.md`, `README.md`,
`_tickets/decide-four-ts-port-divergences-…md` (+ the `add-note`),
`EXPLORATION_PUBLIC.md` (§3.4 correction annotation).

Not touched: `CHANGELOG.md`, `check_write.py`, `ticket`, any existing scenario or unit test.

## Mutation evidence (no pipes; rc from `subprocess.run`; restore in `finally`)

Runner `.tmp/mutate_b_it1.py`.

| # | mutation | rc | which scenarios failed |
|---|---|---|---|
| MU-A | `TicketDocument.parse`: frontmatter block swallows the body (bash's whole-file matching) | build=0 **behave=1** | 12 passed / **1 failed**: "A links line in the body is neither counted nor rewritten" — the new scenario and ONLY it |
| MU-B | `link` argument de-duplication removed | build=0 **behave=1** | 11 passed / **2 failed**: "A repeated id is counted once when other tickets remain" (new) + "Linking a ticket to itself is refused" |

Both mutants restored and the bundle rebuilt; sources re-grepped for the mutant strings.

## Gate results (each run separately, real unmasked rc, output to `.tmp/g_*.log`)

```
make typecheck  rc=0
make unit-test  rc=0   ℹ tests 365  ℹ pass 365  ℹ fail 0
make test       rc=0   12 features, 239 scenarios, 1609 steps, 0 failed   (was 237/1589)
make parity     rc=0   graph OK 71/0 | query OK | slug OK 13/0 | write OK cases=109 failures=0
```

## CHANGELOG correction TOP_LEVEL_AGENT must apply (verbatim)

In `CHANGELOG.md`, `## [Unreleased]` → `### Changed`, **replace this bullet**:

> - TypeScript port started (strangler-fig): `ticket` now delegates the commands listed in its `TS_COMMANDS` variable to a Node bundle at `dist/ticket.mjs`; `help`, `ls`/`list`, `ready`, `blocked`, `closed`, `query` and `show` are delegated so far, plus the `tree` and `cycle` subcommands of `dep` via `TS_DEP_SUBCOMMANDS` (`dep <id> <dep-id>` stays bash). Requires `node` on PATH and `make build` from a source checkout. Removing a name from either list rolls that command back to bash.

**with**:

> - TypeScript port started (strangler-fig): `ticket` now delegates the commands listed in its `TS_COMMANDS` variable to a Node bundle at `dist/ticket.mjs`; `help`, `ls`/`list`, `ready`, `blocked`, `closed`, `query`, `show`, `create`, `status`, `start`, `close`, `reopen`, `dep`, `undep`, `link` and `unlink` are delegated so far. `dep tree`/`dep cycle` were delegated separately via `TS_DEP_SUBCOMMANDS` before the whole `dep` command moved. Requires `node` on PATH and `make build` from a source checkout. Removing a name from either list rolls that command back to bash.

and **add these three bullets** under the same `### Changed` heading (they are the user-visible
behavior changes of this phase; #14/#15 are arguably `### Fixed` — TOP's call):

> - `dep`, `undep`, `link` and `unlink` now treat `deps`/`links` as arrays of whole ids. Removing an id no longer cuts its text out of a similar-looking neighbour (`deps: [t-1, t-111]` minus `t-1` used to become `deps: [11]`), and adding an id that merely occurs inside a recorded one is no longer refused as already present.
> - `dep` and `link` now create a missing `deps:`/`links:` field instead of failing. `tk dep a b` on a ticket with no `deps:` line used to exit 1 printing nothing at all, and `tk link a b` used to report `All links already exist` while linking nothing.
> - `tk link` now counts a repeated id once and refuses an argument list whose ids all resolve to the same ticket (`Error: nothing to link: every id resolves to ticket <id>`); it used to record a ticket in its own `links`. A self-*dependency* is still recorded — `dep cycle` reports it.

(The delegated-command list in the replacement bullet is the live value of `TS_COMMANDS` at
`ticket:1601`, so it also fixes Phase A's omission of `create`/`status`/`start`/`close`/`reopen`.)

## Left for Phase C (in addition to the list above)

- `EXPLORATION_PUBLIC.md` §3.4's bare-`deps:`-line claim is now annotated as WRONG in place —
  read whitelist #14 in `scripts/parity/README.md` for the real contract.
- If the human answers `decide` ticket `nid_r3mp6uylht7t77iwxtuqvhxv2_e` with option (b) or (c),
  #17 changes; the revert is ~6 lines in `LinkCommand.resolve` plus two scenarios.
