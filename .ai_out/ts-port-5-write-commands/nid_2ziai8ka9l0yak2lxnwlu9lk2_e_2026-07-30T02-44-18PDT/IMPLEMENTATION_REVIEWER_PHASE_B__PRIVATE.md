# IMPLEMENTATION_REVIEWER_PHASE_B__PRIVATE — working memory

Base commit `6a5a349`; work under review is uncommitted (`git status` shows 11 modified +
7 untracked, of which the code is `src/core/ticket-relations.ts`,
`src/cli/commands/{undep,link,unlink}.ts`, `test/{ticket-relations,relation-commands}.test.ts`).

## Scratch artifacts (all under `$REPO/.tmp/rev/`, safe to delete)

| Path | What |
|---|---|
| `bash-ref` | copy of `ticket` with BOTH `TS_COMMANDS=` and `TS_DEP_SUBCOMMANDS=` emptied (same recipe as `harness.BashReference`) |
| `probe.py` | differential driver: two identical fresh `git init` repos, run a command list on each side, compare `rc`+stdout+stderr+**every byte under `_tickets/`** |
| `cases.py` / `cases.out` | probe batch 1 (36 shapes) |
| `cases2.py` / `cases2.out` | probe batch 2 (15 hostile/malformed shapes) |
| `mut.py` / `mut2/` | my own 21-mutation runner (typecheck → build → `npm test` → `behave` → `scripts/parity/run.py`, each rc captured with `subprocess.run`, no pipe) |
| `unit.log` `typecheck.log` `parity.log` `behave.log` `gates.txt` | independent gate runs |

## Gates I ran myself (rc captured, never piped through tail/head)

```
make typecheck  rc=0
make unit-test  rc=0
make parity     rc=0   graph OK 71/0 | query OK | slug OK 13/0 | write OK cases=109 failures=0
make test       rc=0   12 features, 237 scenarios, 1589 steps, 0 failed
```
Matches Phase B's report. (`grep '^# tests'` on the unit log did not match — node's TAP
summary format here differs — but rc=0 and the parity/behave numbers are exact.)

## The contested claim (EXPLORATION §3.4 vs Phase B) — Phase B is RIGHT

`.tmp/rev/cases.out:2-56`: on a ticket with **no `deps:` field**, pinned bash `dep A B`
exits **1, prints nothing on either stream, writes nothing**. It does NOT write a bare
`deps: ` line as EXPLORATION §3.4 claimed. Same for `undep` (`cases.out:58-111`).
TS: `dep` creates `deps: [B]` as the FIRST frontmatter entry (rc 0), `undep` prints
`Dependency not found` on stdout with rc 1. Divergence #14's text in
`scripts/parity/README.md` describes exactly this. EXPLORATION is the stale document.

## Shapes probed bash-vs-TS (batch 1, `cases.out`)

AGREE (24): `deps: []` add/remove; `deps: [a,b]` undep; duplicate entry add AND remove
(`[b, b]` minus `b` → `[]` on both); `link` 2 tickets = 2; `link` 3 tickets with a-b
pre-linked = **4**; `link` twice → `All links already exist`; `link` with a bad id in FIRST
and in LAST position → abort, ZERO mutation on both sides; `dep a a` self-dep allowed;
`undep a a`; `unlink a a`; nested ticket edited in place (never moved); whitespace-padded id;
`unlink` subject without a `links:` field; `unlink` a half link recorded only by the target;
all 8 usage/arity shapes; ambiguous id; `undep` on `[ ]`.

DIFFER, each mapping to a declared divergence:
- `cases.out:2,58` → #14 (missing `deps:` field).
- `cases.out:117,217,317,415` → #13's "re-serialized canonically" clause: bash keeps
  hand-written spacing (`[ a , b , c]`, `[a,b, c]`) and on `[ ]` produces the corrupt
  `[ , c]`; TS always writes `[a, b, c]`.
- `cases.out:493` → #15 + #16 (`links:` line in the BODY: bash counts 1, TS 2 and creates
  the missing field on the other side).
- `cases.out:572` → #9 (approved): empty id — bash `ambiguous ID ''`, TS `ticket '' not found`.
- `cases.out:636,714` → #13 substring: bash `undep t-9 t-1` turned `[t-1, t-111]` into
  `[xtra_e]`/`[11]`; bash `dep` refused an id contained in a recorded one.
- `cases.out:802,862` → #14 (missing field with other fields present / with only `links:`).

## Batch 2 (`cases2.out`) — hunting UNDECLARED divergences

- `link a a b`: bash `Added 3 link(s) between 3 tickets` + records `a` in its own links;
  TS `Added 2 link(s) between 2 tickets`. This is the dedup half of #17 — described in the
  whitelist prose, but there is **no case and no scenario** for the non-collapsing dedup, so
  the reported `N` is unpinned. Filed as a NIT.
- `deps: foo` (non-array scalar): bash prints success and leaves `deps: foo` untouched (a
  lie); TS rewrites it to `deps: [foo, B]`. `links: "[]"` (quoted): bash → `["", B]`,
  TS → `["[]", B]`. Both are `Frontmatter`-level (pre-existing core parsing), not new logic,
  and both are TS-better. #13's "canonically re-serialized" sentence covers them loosely.
- Duplicate `deps:` key in one frontmatter block: bash `undep` **crashes**
  (`sed: unterminated s command`, rc 1) and leaves a stray `a.md.tmp.<pid>` behind; TS
  edits the first occurrence. Already documented at `src/core/frontmatter.ts:71-75`.
- CRLF file: bash `ticket ... not found`, TS `has no 'id' frontmatter field` — pre-existing
  divergence #2 class, not Phase B's.
- `link a b c` on three unlinked tickets: counts agree (6/6); order differs, bash `[c, b]` for
  `a` — exactly #18, and exactly why no parity case exists. Correct call.
- No trailing newline; nested tickets with both fields; `unlink` when the subject lists the
  target twice; `deps: [x] # comment` → all AGREE.

Conclusion: no undeclared divergence in the NEW code. Everything that differs is either a
declared #13–#18, an older whitelisted item, or malformed-input handling where bash lied.

## Shim integrity

- `ticket:1601` `TS_COMMANDS` gains `dep undep link unlink`; `ticket:1607`
  `TS_DEP_SUBCOMMANDS="tree cycle"` assignment **still present** → `harness.py`'s
  "exactly one `^VAR=`" check (harness.py:34,54-61) still passes; verified by `make parity`
  rc=0 and by `grep -n '^TS_COMMANDS=\|^TS_DEP_SUBCOMMANDS=' .tmp/rev/bash-ref` → both `""`.
- `_ts_serves`'s `-n "$2"` guard intact (`ticket:46-48`); proved empirically: bare `dep` on
  `bash-ref` (both lists emptied) prints the 3-line bash usage and exits 1 — it does NOT
  delegate.
- `make parity` therefore still compares TS against pinned BASH, not TS against TS.

## Positive TS-side pins per divergence (the gap Phase B flagged)

| # | inverted parity case | positive pin |
|---|---|---|
| 13 | 3 cases | unit `ticket-relations.test.ts:66-74,102-110` + 2 BDD (`ticket_dependencies.feature`, `ticket_links.feature`) |
| 14 | 2 cases | 2 BDD (`dep` creates array / `undep` reports missing) |
| 15 | 1 case | 1 BDD ("Linking a ticket with no links field creates the array on both sides") |
| 16 | 2 cases | **NONE** — no unit test, no scenario asserts a body `links:`/`deps:` line is left alone and uncounted. Only `frontmatter.test.ts:189` ("keeps the body when the frontmatter changes") generically. → SHOULD-FIX |
| 17 | 1 case | 1 BDD ("Linking a ticket to itself is refused"); the dedup-without-collapse path unpinned |
| 18 | none (by design) | unit `relation-commands.test.ts:58-61` + BDD "Link appends ids in the order the tickets were named" |

## My own mutation results (21 mutations, independent of Phase B's table)

Runner `.tmp/rev/mut.py`, verdicts in `.tmp/rev/mut-run.out`, per-gate logs in `.tmp/rev/mut2/`.
Results table is in the PUBLIC file: **20/21 killed, 1 equivalent mutant (RM13)**.
Anchors are uniqueness-checked (`count(old) != 1` ⇒ skipped and reported loudly), every source
restored in a `finally`, final `make build` re-ships the clean bundle.

Cost note: parity is ~3.5 min per run, so the runner only runs it for a mutant the cheap gates
did not already kill (`parity=skip` therefore means "not needed", never "passed"). My FIRST
attempt ran all four gates unconditionally and I killed it mid-run with `pkill` — Python's
`finally` does NOT run on SIGTERM, so RM2's mutation was left in
`src/core/ticket-relations.ts:84` and I had to restore that line by hand. **If a future
reviewer kills a mutation runner, verify the source afterwards.** I did, and re-verified at
the end that `git status` lists exactly the files under review and `make build`/`typecheck`/
`unit-test` are rc=0 with 365/365 unit tests.

Mutants killed by `check_write.py` ALONE (no unit test, no scenario): RM4 (N reported as the
number of changed tickets — the `LINK_CHAIN` case is the only fixture where those two numbers
differ), RM16 (`dep` printing the typed rather than the resolved ids), RM21 (same for
`unlink`). Phase B's harness extension is load-bearing.

RM13 (`if (!has(field)) return []` before `getArray`) survived every gate because
`Frontmatter.getArray` (`frontmatter.ts:131-134`) already returns `[]` for an absent key —
a semantically equivalent mutant, verified by reading the method, not a coverage hole.

## Ruled out (checked, not a finding)

- `link` abort-before-mutation: `resolve()` calls `store.loadAll()` and resolves EVERY arg
  before the first `store.save`; probes with a bad id first and last leave both trees
  byte-identical to bash's.
- `unlink` self case: `subject === target` (same object from `loadAll`), so the second
  `withRemoved` recomputes from the original and writes the same bytes — harmless, AGREEs.
- `TicketRelation.withRemoved` uses `filter`, i.e. removes EVERY occurrence — matches bash's
  global `sed` (probe AGREE) and is pinned by a unit test.
- `src/core/ticket-relations.ts` imports only `./ticket.js`: no argv, no console, no
  formatting. Phase C can reuse it.
- Shared Phase A plumbing reused, not re-invented: `StoreResolver.forWriteCommand`,
  `TicketLookup.byId`, `CliError`/`UsageError`, `ExitCode`, `LINE_SEPARATOR`, `TicketField`.
- No `any`, no new runtime dependency, no vitest, no hardcoded secret, no shell/`exec` of user
  input, named constants for every literal message.
