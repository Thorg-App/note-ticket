# IMPLEMENTATION_REVIEW_PHASE_B__PUBLIC — T5 phase B (`dep` write form, `undep`, `link`, `unlink`)

Reviewed with fresh eyes against base `6a5a349`; the change set is uncommitted. Everything
below was verified by running it, not by reading the implementer's report.

**VERDICT: READY — 0 BLOCKING.** 3 SHOULD-FIX (one test gap, one process/decision item, one
stale user-facing doc owned by TOP_LEVEL), plus 4 NITs. Nothing found that corrupts data,
loses functionality or diverges from bash undeclared.

## Summary

`dep <id> <dep-id>`, `undep`, `link` and `unlink` are ported; `dep` is flipped whole into
`TS_COMMANDS`. The add/remove/membership rules for both id arrays live in one new core class,
`src/core/ticket-relations.ts` (`TicketRelation.DEPENDENCY` / `.LINK`), with "no change" modeled
as `undefined` so "nothing changed ⇒ nothing written" is structural rather than remembered.
`link`'s symmetric closure is a separate pure class (`LinkClosure`). All four commands reuse
Phase A's plumbing (`StoreResolver.forWriteCommand`, `TicketLookup.byId`, `CliError`/
`UsageError`, `ExitCode`, `LINE_SEPARATOR`, `TicketField`) — nothing re-invented.

Quality is high: honest naming, WHY/WHY-NOT comments where the reason is not in the code, named
constants for every message, no `any`, no new runtime dependency, no vitest, no shelling out.
The parity harness was extended rather than side-stepped, and the implementer's self-reported
caveat about inverted parity cases is accurate and led me straight to the one real test gap.

## Independently verified gates

```
make typecheck  rc=0
make unit-test  rc=0
make parity     rc=0   graph OK 71/0 | query OK | slug OK 13/0 | write OK cases=109 failures=0
make test       rc=0   12 features, 237 scenarios, 1589 steps, 0 failed
```
Each was run separately with the real exit code captured (redirected to `.tmp/rev/*.log`, never
piped through `tail`/`head`). Numbers match Phase B's report.

## Parity, verified empirically against pinned bash

I built my own pinned reference (`ticket` with BOTH `TS_COMMANDS=` and `TS_DEP_SUBCOMMANDS=`
emptied) and my own differential driver that compares `rc` + stdout + stderr + **every byte
under `_tickets/`** on two identical fresh repos (`.tmp/rev/probe.py`, 51 shapes over two
batches; ids/timestamps did not need neutralising because fixtures are hand-written).

**The contested claim is resolved in Phase B's favour.** On a ticket with no `deps:` field,
pinned bash `dep A B` exits **1, prints nothing on either stream and writes nothing** — it does
NOT leave a bare `deps: ` line as `EXPLORATION_PUBLIC.md` §3.4 asserted. Same for `undep`.
Divergence #14 as written in `scripts/parity/README.md` is the accurate description; the
EXPLORATION doc is the stale one.

Shapes where bash and TS AGREE byte-for-byte (24 of batch 1), including every one the task
asked about: `link` counts **2 / 6 / 4**; `link` with a bad id in the FIRST and in the LAST
position aborts with **zero mutation on either side**; duplicate array entries (`[b, b]` minus
`b` → `[]` on both); `dep a a`, `undep a a`, `unlink a a`; nested tickets edited in place and
never moved; whitespace-padded and partial ids; `unlink` a subject with no `links:` field;
`unlink` a half link recorded only by the target; all eight usage/arity shapes; ambiguous ids;
`deps: []` and `deps: [a,b]` removal.

Every difference I found maps to a declared divergence — **no undeclared divergence in the new
code**:

| Probe | Maps to |
|---|---|
| missing `deps:` field (4 variants) | #14 |
| `deps: [ a , b ]`, `[a,b]`, `[ ]` re-spaced (bash even produces the corrupt `[ , c]`) | #13's "re-serialized canonically" clause |
| `links:` line in the BODY | #16 (+#15) |
| empty id wording | #9 (previously approved) |
| substring id add/remove (`[t-1, t-111]` minus `t-1` → bash `[11]`) | #13 |
| `link a b c` append order (bash `[c, b]`), counts equal at 6 | #18 |
| `deps: foo` scalar, `links: "[]"` quoted, duplicate `deps:` key (bash `sed` **crashes** and leaves a stray `*.tmp.<pid>`), CRLF file | pre-existing core-layer divergences (`frontmatter.ts:71-75`, #2) — bash was the one lying |

Shim integrity confirmed: `TS_DEP_SUBCOMMANDS=` assignment still present (so
`harness.py`'s exactly-one-`^VAR=` check still passes), `_ts_serves`'s `-n "$2"` guard intact —
proved by running the emptied-list copy with a bare `dep`, which prints bash's own 3-line usage
instead of delegating. `make parity` therefore still compares TS against BASH.

## Independent mutation testing

I did not reuse Phase B's table. I wrote my own runner (`.tmp/rev/mut.py`), 21 one-line source
mutations, each gate's rc captured directly with `subprocess.run` and no pipe anywhere; the
anchor string is uniqueness-checked and every file restored in a `finally`. Parity — the slow
gate — is only run for a mutant the cheap gates did not already kill, so `parity=skip` means
"not needed", never "passed".

**20 of 21 killed; the 1 survivor is provably an equivalent mutant, not a coverage hole.**

| # | mutation | verdict (rc) |
|---|---|---|
| RM1 | count all named ids as new, not just the missing ones | CAUGHT unit=1 bdd=1 parity=1 |
| RM2 | `withRemoved` drops only the FIRST matching element | CAUGHT unit=1 |
| RM3 | prepend new ids instead of appending | CAUGHT unit=1 bdd=1 |
| RM4 | report `N` as the number of CHANGED tickets | **CAUGHT parity=1 only** |
| RM5 | only the first ticket gains the others (asymmetric closure) | CAUGHT unit=1 bdd=1 |
| RM6 | `undep` succeeds when nothing was removed | CAUGHT bdd=1 |
| RM7 | `Dependency not found` to stderr | CAUGHT bdd=1 |
| RM8 | `Dependency already exists` becomes a failure | CAUGHT bdd=1 |
| RM9 | `unlink` judges existence from the TARGET's links | CAUGHT bdd=1 |
| RM10 | `unlink` forgets the target side | CAUGHT bdd=1 |
| RM11 | membership by substring (bash's `grep`) | CAUGHT unit=1 bdd=1 |
| RM12 | removal by substring (bash's `sed`) | CAUGHT unit=1 |
| RM13 | early-return `[]` when the field is absent | *SURVIVED — equivalent mutant* |
| RM14 | `link` argument de-duplication removed | CAUGHT bdd=1 |
| RM15 | `dep` never saves the ticket it changed | CAUGHT bdd=1 |
| RM16 | `dep` prints the TYPED ids, not the resolved ones | **CAUGHT parity=1 only** |
| RM17 | `undep`'s usage line names `dep` | CAUGHT unit=1 |
| RM18 | `link` accepts a single argument | CAUGHT unit=1 |
| RM19 | `TicketRelation.LINK` addresses the `deps` field | CAUGHT unit=1 bdd=1 |
| RM20 | `link` resolves lazily, writing the first id before the rest resolve | CAUGHT bdd=1 (also tc=2) |
| RM21 | `unlink` reports the typed ids | **CAUGHT parity=1 only** |

RM13 replaced `getArray(field)` with `if (!has(field)) return []; getArray(field)` — but
`Frontmatter.getArray` (`src/core/frontmatter.ts:131-134`) already returns `[]` for an absent
key, so the mutant is semantically identical to the original and nothing could have killed it.
Reported for honesty; it is not a gap. (Same category as Phase B's own M7 note.)

Two things worth carrying forward:
- RM4, RM16 and RM21 were killed by `check_write.py` **alone** — the `LINK_CHAIN` fixture and
  the partial-id cases are load-bearing, not decoration. Phase B's harness extension earns its
  keep.
- Sources were restored after every mutation and the shipped bundle rebuilt; I re-verified
  afterwards that `make build`/`typecheck`/`unit-test` are rc=0 and `git status` shows exactly
  the files under review (unit tests 365/365).

## 🚨 CRITICAL Issues

None.

## ⚠️ IMPORTANT Issues

### I1 (SHOULD-FIX) Divergence #16 has no positive pin on the TS side
`scripts/parity/README.md:#16` claims frontmatter-only editing is pinned by "two `check_write`
cases" — but both are `diverges=True`, which only demands that the two sides *differ*. As Phase B
itself noted, an inverted case can never pin the TS behavior: a mutant that rewrote body lines
*differently from bash* would keep that case green. #13/#14/#15/#17/#18 each also have a unit
test or scenario; #16 alone has none (`frontmatter.test.ts:189` only asserts the body survives a
frontmatter change generically, with no `links:`-shaped body line).

Concrete gap: change `link` to count and rewrite a body `links:` line and the only gate that can
notice is the one that cannot. Fix: one BDD scenario — a raw ticket whose BODY contains
`links: [ghost]`, then `tk link a b` must report `Added 2 link(s) between 2 tickets` and the body
line must still read `links: [ghost]`. One scenario closes the last unpinned divergence.

### I2 (SHOULD-FIX, needs the human) Divergence #17 invents a refusal and a new message
`src/cli/commands/link.ts:86-88` turns bash's (nonsensical) success into
`Error: nothing to link: every id resolves to ticket <id>`, exit 1. I agree with the judgement,
but two things make it a human call rather than a reviewer's:
1. It is a **user-visible behavior change with a brand-new error string**, the class the repo
   has consistently routed through a `decide` ticket (precedents `nid_5g3eta9cf7yi6iukmscxma6wc_e`
   approved, `nid_qxt3z5unr9k220aqttbw84a6a_e` pending). Phase B deliberately filed none.
2. It is **inconsistent with the sibling command**: `tk dep a a` still happily records a ticket as
   its own dependency (`dep.ts:27-28`, bash parity, verified AGREE), which `dep cycle` then
   reports as a cycle. So "a ticket related to itself is data nobody can act on" is enforced for
   `link` and not for `dep`. Whichever way the human decides, the two should agree.

Ask: add #17 to the pending `decide` ticket with both points, or revert the one-line refusal.

### I3 (SHOULD-FIX, TOP_LEVEL's file) `CHANGELOG.md` now states the opposite of reality
`CHANGELOG.md`'s `[Unreleased] → Changed` bullet still says only `help`/`ls`/`ready`/`blocked`/
`closed`/`query`/`show` are delegated "plus the `tree` and `cycle` subcommands of `dep` via
`TS_DEP_SUBCOMMANDS` (`dep <id> <dep-id>` stays bash)". After this phase that is false, and the
three user-visible changes (#13 no longer corrupting a similar-looking neighbour, #14/#15 creating
a missing field instead of failing silently, #17 refusing `tk link a a`) are unlogged. Phase B
correctly flagged this as TOP_LEVEL's to write; it must land in the same commit, not after it.

## 💡 Suggestions

- **N1** `TicketRelation.idsOf` and `Ticket.deps` / `Ticket.links` (`src/core/ticket.ts:83-89`)
  are now two expressions of the same knowledge (both `frontmatter.getArray(field)`), read by
  different callers (`dep-graph.ts` uses the accessors, the write commands use the relation).
  Harmless today, a drift risk the first time either side normalizes. Have one delegate to the
  other.
- **N2** `link a a b` (dedup that does NOT collapse to one ticket) changes the reported count
  line — bash `Added 3 link(s) between 3 tickets` and a self-link recorded, TS
  `Added 2 link(s) between 2 tickets`. The whitelist prose for #17 covers it, but there is no
  `Case(...)` and no scenario, so the reported `N` for a mixed argument list is unpinned. One
  `diverges=True` case would cover it.
- **N3** `src/cli/commands/link.ts:84-88`: the `&& only !== undefined` in the guard means a
  zero-ticket result would silently fall through and print `All links already exist`. It is
  unreachable (the arity check guarantees ≥1 resolution) and the comment says so, but the
  defensive clause encodes a wrong answer for a state the code claims cannot happen. Prefer
  deriving the first ticket in a way that cannot be `undefined`.
- **N4** #13's whitelist text folds in "re-serializes canonically, which additionally normalizes
  hand-written spacing". Worth one more clause: a non-array scalar (`deps: foo`) becomes
  `deps: [foo, <id>]` in TS, where bash printed success and silently changed nothing at all.

## Documentation Updates Needed

- `CHANGELOG.md` — see I3 (owner: TOP_LEVEL_AGENT).
- `EXPLORATION_PUBLIC.md` §3.4's "bare `deps: ` line" bullet is factually wrong and is the
  spec Phase C will read next. Correct it in place (or annotate it) so C does not re-derive the
  wrong contract.
- `CLAUDE.md`, `README.md`, `docs-internal/migration-to-ts-high-level.md` and
  `scripts/parity/README.md` are all updated correctly and consistently for this phase; I found
  no stale statement in them, and the divergence text matches what the code actually does in
  every case I probed.
