# IMPLEMENTATION_REVIEW — Phase A (ls / ready / blocked → TypeScript)

Commits `36e8704`, `c27e3af`, `081a9e4`. Reviewer verified everything independently;
nothing below is taken on the implementer's word.

## Summary

`ls`/`list`, `ready`, `blocked` now come from `dist/ticket.mjs`; `closed`/`query` untouched
(Phase B). New shared CLI layer: `ListOptions` (flag union), `TicketFilter`, `TicketRow`
(all four bash `printf` formats in one place), `StoreResolver` (bash `init_tickets_dir`),
`CliError`, plus a `Cli.read` skeleton in `main.ts`. `ticket` changed by exactly one line
(`TS_COMMANDS`). 10 BDD scenarios, 39 unit tests, and a materially repaired parity harness.

**Overall: strong work.** The bash semantics were re-derived rather than guessed, the
abstractions really are reusable for `closed`/`query`, and the harness hole the implementer
found and fixed was a genuine one that would have silently voided every future parity claim.

### Independently reproduced numbers

| Check | Result |
|---|---|
| `make typecheck` | exit 0 |
| `make unit-test` | 202 tests, **0 fail** |
| `make test` | 12 features, **190 scenarios, 0 failed**, 1260 steps |
| `make parity` | graph 68 scenarios / **0 failures**; query OK; slug OK |

### Harness integrity — verified, not assumed
`harness.py::BashReference` copies `./ticket` with `TS_COMMANDS` emptied (`re.subn` with a
`count == 1` assertion, so a rename fails loudly) and `ts_cli_result()` runs the shipped
bundle, so the diff is bash-vs-TS. Proof it can still fail: mutating
`padEnd(ID_COLUMN_WIDTH)` → `padEnd(9)` in `dist/ticket.mjs` produced
`graph FAIL scenarios=68 failures=888`. `make parity: build` correctly replaced the stale-bundle
dependency.

### Non-vacuity — verified
Running `features/ticket_listing.feature` against a bash-only copy
(`TICKET_SCRIPT=.tmp/ticket-bash-only`) gives **22 passed / 7 failed**, and the 7 are
precisely the behavior-change scenarios (3 missing-id shapes on `ls`, missing-id on
`ready` and `blocked`, `-a` and `-T` without a value). The other 3 new scenarios pass on
both sides — correct, they are parity locks. The missing-`id` trio covers missing key,
empty value, and no frontmatter at all, each asserting non-zero exit **and** the new
`stderr should contain` step (which reads `context.stderr` specifically). `src/core/` is
clean of `console`/argv/formatting.

## 🚨 BLOCKING

None.

## ⚠️ SHOULD-FIX

### 1. Undeclared behavior divergence: titles containing `|` in `ready`/`blocked`
`ticket:905` / `ticket:1068` pack the sort key as `prio|id|status|title` and `split()` on
`|` before printing, so bash corrupts any title containing a pipe. Reproduced live with
`tk create "Ship the thing | phase 2"`:

```
bash ready:    nid_…_e [P2][open] - Ship the thing        # title truncated at the pipe
TS   ready:    nid_…_e [P2][open] - Ship the thing | phase 2
bash blocked:  aaa1     [P1][open] - Pipe <- Title        # title fragment where blockers go
TS   blocked:  aaa1     [P1][open] - Pipe|Title <- [bbb2]
```

Why it matters: this is reachable through `tk create`, not hand-editing, so it is a
user-visible behavior change that is not in the declared divergence list — and
`make parity` reports OK because every generated title is `T <id>`. The TS behavior is the
correct one; the problem is that it is currently undeclared and unprotected, so a future
porter could "restore parity" and re-introduce the bash bug.

Concretely: add a whitelist entry #3 in `scripts/parity/README.md` ("bash `ready`/`blocked`
truncate a title at `|` because they pack sort keys with it"), a CHANGELOG **Fixed** line,
and a unit test in `test/list-commands.test.ts` asserting a `|`-bearing title renders whole
in both `ReadyCommand` and `BlockedCommand`.

### 2. The parity generator's titles hide every metacharacter
`scripts/parity/harness.py::write_scenario` writes `title: "T <id>"` for every ticket, so
the byte-compare has never seen `|`, `[`, `]`, `"`, `:` or a trailing space in a title —
which is exactly how finding #1 slipped through a green run. Cycle a small list of hostile
titles (e.g. `T %s`, `a | b`, `has [brackets]`, `Fix: the thing`, `say "hi"`) the way
`assignee`/`tags` are already cycled. Cheap, and it hardens `closed`/`query` in Phase B too.

### 3. `main.ts` has two user-error channels — pick one
`src/cli/store-resolver.ts:4-7,27` returns message arrays that already contain the
`Error: ` prefix, printed inline by `main.ts:83-85`; `CliError`/`MissingTicketIdError` are
instead prefixed by the `catch` at `main.ts:50`. Two implementations of one responsibility
(render a user-facing failure), and `closed`/`query` will each have to pick a side. Fold
`StoreResolver` into the throwing channel — e.g. give `CliError` an optional
`readonly detailLines: readonly string[]` (bash's "Run inside a git repo, or set TICKETS_DIR
env var" second line is *not* `Error:`-prefixed, so multi-line support is required) and
have `StoreResolver` throw. Then `main.ts:80-90` shrinks to store-open + write, and there is
exactly one place that knows how errors look.

### 4. CRLF ticket files now hard-fail every listing with a misleading message
A ticket file with CRLF line endings (Windows/synced vault) makes bash list nothing and
exit 0 (its `/^---$/` never matches `---\r`), while TS exits 1 with
`Error: <path> has no 'id' frontmatter field` — on a file that visibly contains
`id: aaa1`. The loud failure itself is pre-approved, but the wording violates POLS and
sends the user hunting for a field that is right there. This is pre-existing
`src/core/frontmatter.ts` parsing, newly user-visible because of this change. Not for this
commit: file a follow-up ticket to either tolerate a trailing `\r` on frontmatter fence and
field lines, or word the error so an unparseable frontmatter block is distinguishable from a
genuinely absent `id`.

## 💡 NITs

- `src/cli/ticket-row.ts:13-15` claims each method "reproduces a bash `printf` byte for
  byte". Bash `%-8s` pads **bytes**, `padEnd` pads UTF-16 units, so a non-ASCII id
  (`id: ééé1`) diverges: bash 1 pad space, TS 4. Hand-edit-only (ids are generated
  `[a-z0-9]`), so no code change needed — just soften the claim to "ASCII ids" so the
  comment isn't a small lie.
- `src/cli/list-options.ts:9,25` — `limitText` is dead code until `closed` lands. Fine if
  Phase B is immediate; if Phase B slips, delete it rather than ship unused surface.
- `scripts/parity/harness.py:_run` returns the `CompletedProcess` but every check compares
  `.stdout` only. Comparing `returncode` as well is free and closes a small vacuity hole
  (a bash-side failure that prints nothing currently looks equal to a TS empty success).
- `TicketRow.withStatus` is documented as "the `closed` row" but is also the base of the
  `ls` row via `withDeps`; the doc reads as if it were `closed`-specific.

## Documentation Updates Needed

- `scripts/parity/README.md` — whitelist entry for the `|`-in-title divergence (#1); the
  "Whitelisted divergences" preamble says "these two", so the count needs updating.
- `CHANGELOG.md` — **Fixed**: `ready`/`blocked` no longer truncate a title at `|`.
- `docs-internal/migration-to-ts-high-level.md` — the "verify these while porting" list is
  the natural home for "`ready`/`blocked` bash packs sort keys with `|`; do not reproduce".
- Nothing else: CLAUDE.md's new `src/cli/` section and pinned-bash-copy rule are accurate,
  the README already documents the missing-`id` hard error, and the CI-parity gap is
  correctly captured as ticket `nid_94f11043dhpk198dj9e6gr6pn_e` rather than dropped.

## Verdict

**READY** for convergence. No blocking defects, no lost pre-existing behavior (the
`features/` diff is additions only; the two declared divergences are the pre-approved ones),
suites reproduced green, and the parity harness proven to still be capable of failing.
Findings #1 and #2 are small and directly protect the contract claim — please land them
before merge; #3 is best done now while there are only three commands to touch, and #4 as a
ticket.
