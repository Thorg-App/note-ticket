# IMPLEMENTATION_PHASE_A__PUBLIC — T5 phase A: `create` + `status`/`start`/`close`/`reopen`

For the reviewer and for **phases B (dep/undep/link/unlink) and C (add-note/edit + shim
reduction)**. All paths repo-relative.

## Scope delivered

`create`, `status`, `start`, `close`, `reopen` are ported and flipped into `TS_COMMANDS`
(`ticket:1600`, now `… show create status start close reopen`). Bash `cmd_create`/`cmd_status`
/`cmd_start`/`cmd_close`/`cmd_reopen` are dead code but LEFT IN PLACE — T6 is the sanctioned
deletion point, and `TS_DEP_SUBCOMMANDS` must keep existing because
`scripts/parity/harness.py:34` fails loudly without it.

Verified byte-identical to bash (empirically, by running the same commands against a bash
copy and against `./ticket`): frontmatter key order, optional-line presence, `tags` comma
re-spacing with no trimming (`a,b , c` → `[a, b ,  c]`), title quote escaping, the JSONL line
with `full_path` last, `closed_iso` inserted as the FIRST frontmatter entry, `closed_iso`
removal on any non-closed status, `Updated <full id> -> <status>`, every usage/error string
and exit code 1.

## Shared abstractions added — USE THESE, do not re-add

| Item | File | How to use it |
|---|---|---|
| `Clock` / `SystemClock` / `FixedClock` | `src/core/clock.ts` | `environment.clock.nowIso()` → bash `_iso_date` format. `new FixedClock("2026-…Z")` in tests |
| `Git` | `src/core/git.ts` | `Git.repoRoot(cwd)`, `Git.configuredUserName()`; every probe returns `undefined` instead of throwing. The ONLY place git is spawned |
| `TicketField` | `src/core/ticket.ts` (exported) | on-disk key names in one place; phases B/C want `TicketField.DEPS`, `TicketField.LINKS`. Do **not** write `"deps"` in a command module |
| `ProgramName.invoked()` | `src/cli/program-name.ts` | `TICKET_INVOKED_AS` → basename; was `Cli.programName()` (private) |
| `CommandEnvironment` | `src/cli/command-environment.ts` | `programName`, `clock`, `newTicketId()`, `defaultAssignee()`. Built once in `Cli.run` and passed to every command; tests construct their own |
| `StoreResolver.forWriteCommand()` / `forCreateCommand()` | `src/cli/store-resolver.ts` | **B and C use `forWriteCommand()`** (dir must exist). `forCreateCommand()` mkdirs and is for `create` only |
| `StatusUpdate.applied(ticket, status, now)` | `src/cli/commands/status.ts` | the pure frontmatter change, if anything else ever needs to close a ticket |

**Command shape to copy** (phases B/C): `X.run(store, args, environment): number`, throwing
`UsageError([...])` for bash's un-prefixed `Usage:` lines and `CliError(msg)` for
`Error: msg`; add a `case` in `src/cli/main.ts` picking the right `StoreResolver` method.
Split each command into a pure part (testable bytes/strings) and a thin I/O part — see
`NewTicketDocument` / `CreateOptionsParser` / `StatusUpdate`.

Two bash orderings that are now encoded and that B/C must respect:
`create` mkdirs BEFORE parsing arguments (so a rejected `create` still leaves the dir), and
`status` validates the status BEFORE resolving the id (so nothing is mutated on failure).

## Files changed

New: `src/core/clock.ts`, `src/core/git.ts`, `src/cli/program-name.ts`,
`src/cli/command-environment.ts`, `src/cli/commands/create.ts`, `src/cli/commands/status.ts`,
`test/create-command.test.ts`, `test/status-command.test.ts`, `test/git.test.ts`.

Modified: `ticket` (TS_COMMANDS), `src/cli/main.ts` (5 new cases, environment plumbing,
`Cli.programName` removed), `src/cli/store-resolver.ts` (three named entry points over one
private `existingStore()`), `src/core/ticket.ts` (`TicketField` exported + extended),
`src/core/ticket-store.ts` (git call moved to `Git`), `features/ticket_creation.feature`,
`features/ticket_status.feature`, `features/id_resolution.feature`,
`features/ticket_directory.feature`, `CLAUDE.md`,
`docs-internal/migration-to-ts-high-level.md`, `scripts/parity/README.md`,
`scripts/parity/dump.ts` (header only).

Not touched, per instructions: `CHANGELOG.md`, `README.md` (no user-visible behavior needing
a doc change), no commits.

## Divergences

- **NEW #10** — a value-taking `create` flag at the END of the argument list
  (`tk create x --design`): bash died with the shell's own
  `./ticket: line 308: $2: unbound variable`; TS exits 1 with
  `Error: option '--design' requires a value`. Declared in `scripts/parity/README.md`,
  `docs-internal/migration-to-ts-high-level.md`, a code comment on
  `CreateOptionsParser.parse`, and a BDD scenario. **No `decide` ticket filed** — it swaps a
  shell crash for an actionable message at the same exit code, the same class as the already
  un-ticketed #6 (`jq` message). Flagging it here for the human rather than blocking.
- **#9 extended to writes** — `tk close ""` now fails instead of closing the only ticket in a
  one-ticket repo (bash's `index(s,"")==1`). Already-approved divergence; new scenario pins it.
- **Refinement, not whitelisted**: `status` reads the clock ONCE where bash called
  `_iso_date` twice, so `status_updated_iso` and `closed_iso` can no longer differ by a second
  while describing the same event. Documented as a WHY in `status.ts` + the migration doc.
- Also documented honestly: `make parity` exercises **no** write command, so a green parity run
  says nothing about this phase (new section in `scripts/parity/README.md`, one line in
  `CLAUDE.md`). Write pins live in `features/*.feature` and `test/*.test.ts`.

## Tests + mutation evidence

New BDD scenarios (11): tags-as-inline-array, unknown option, flag-with-no-value, empty title
→ `Untitled`; `status` with no args / id-only / `close` with no args; invalid status leaves the
ticket untouched; invalid status reported even when the ticket does not exist; **empty id
closes no ticket** (the required carry-over pin, in `features/id_resolution.feature`); write
command does not create the tickets directory. Every pre-existing create/status scenario is
unchanged.

New unit tests (28): `CreateOptionsParser` defaults/last-positional/unknown-flag/missing-value,
`NewTicketDocument` two GOLDEN files captured from bash (minimal + every option and section),
tags spacing, `Untitled` fallbacks, the JSON line; `StatusUpdate` restamping + `closed_iso`
insert position/removal/refresh; `StatusCommand` usage lines (program name `tk`, so a
hardcoded `ticket` fails) and the wrapper→status map; `Git` user.name/repo-root.

**Mutation-tested, 13/13 caught** (runner `.tmp/mutate_t5a.py`, results table in the PRIVATE
file). Two findings worth the reviewer's attention:
- One scenario ESCAPED its mutation at first: "empty title falls back to Untitled" asserted
  only the FILENAME, which `Slug.fromTitle("")` produces on its own — vacuous. Fixed to assert
  the frontmatter `title`.
- `status_updated_iso` restamping is likewise unguardable by BDD (the fixture already carries a
  valid timestamp, so "should have a valid timestamp" passes without any restamping); the unit
  test is the real guard.

## Verification (actual output, summarized)

```
make typecheck  rc=0
make unit-test  rc=0   ℹ tests 323  ℹ pass 323  ℹ fail 0
make test       rc=0   12 features passed, 226 scenarios passed, 0 failed, 0 skipped
make parity     rc=0   graph OK scenarios=71 failures=0 | query OK | slug OK
```
(`make build` runs as a prerequisite of both `test` and `parity`; `dist/ticket.mjs` is
gitignored and was rebuilt last, so the tree is consistent.)

## Left undone / for later phases

- Phases B and C own `dep`/`undep`/`link`/`unlink`/`add-note`/`edit`; the `dep` write branch
  still runs bash, and `TS_DEP_SUBCOMMANDS` still exists (needed by the parity harness).
- No BDD pin for `create`'s default assignee: the value comes from the developer's/CI's global
  `git config user.name` and a scenario would be flaky. `test/git.test.ts` pins the reader.
- A write-mutation parity check (run bash and TS on identical trees, diff file bytes with
  timestamps/ids neutralized) remains unbuilt and is called out in the harness README.

---

# Iteration 1 — response to review (verdict NOT-READY, 0 blocking, 7 should-fix)

Everything above describes the original run and still holds, EXCEPT where noted below
(`Git.output` no longer `.trim()`s; `make parity` now DOES diff write commands).

## The 7 findings

| # | Verdict | What was done |
|---|---|---|
| **I1** `--parent` normalisation unpinned, scenario vacuous | **INCORPORATED** | `features/ticket_creation.feature`: the parent scenario now passes the PARTIAL id `001` and asserts `parent` = `parent-001`; new scenario for an unresolvable `--parent zzz` asserting `Error: ticket 'zzz' not found` AND that no ticket was written (new step `no ticket file should exist with title "…"`). Plus 2 unit tests on `CreateCommand.run`. Mutation `return parent;` now fails BOTH gates |
| **I2** default assignee untested end to end | **INCORPORATED** | New BDD step `Given the git user.name is "X"` — repository-local config beats global, so it is deterministic, and the reviewer was right that the flakiness worry did not hold. 2 scenarios (default + `-a` override) and 2 unit tests with an injected `CommandEnvironment`. Mutation `?? ""` now fails BDD |
| **I3** `Updated <FULL id>` unpinned | **INCORPORATED** | One assertion added to the partial-id `status` scenario (renamed to say what it pins). Mutation `Updated ${search}` now fails BDD |
| **I4** `ProgramName.invoked()` untestable by BDD | **INCORPORATED as a unit test**, as the review suggested — BDD structurally cannot see it (the suite always invokes `./ticket`). `test/program-name.test.ts`: env var basename, `argv[1]` fallback, the EMPTY-env-var arm, and the last-resort default |
| **I5** `.trim()` diverges, comment misstates why | **INCORPORATED as a BUG FIX, not a doc fix** | `Git.output` now strips TRAILING NEWLINES only (`/\n+$/`), which is exactly what bash's `$( )` does, so a `user.name` of `"  Padded Name  "` reaches the `assignee:` line intact and a repo path ending in whitespace is no longer corrupted. Comment rewritten with an explicit WHY-NOT-`.trim()`. No whitelist entry — there is no longer a divergence. Pinned by a unit test and by a `check_write` case that configures the padded name |
| **I6** two undeclared divergences | **INCORPORATED (declared)** | #11 newline in a `create` title (bash: file literally named `line1<LF>line2.md` + unparseable JSON; TS: `line1line2.md` + valid JSON) and #12 `_tickets/<slug>.md` existing as a DIRECTORY (bash: `Is a directory`, rc 1; TS: picks `<slug>-1.md`). Both verified against the pinned bash copy by me, then declared in `scripts/parity/README.md`, `docs-internal/migration-to-ts-high-level.md`, a code comment on `Slug.fromTitle` / `TicketStore.topLevelFileExists`, and a `diverges=True` case each in the new write-parity check. **Sub-suggestion REJECTED:** adding `\n` to `harness.HOSTILE_TITLES` / `check_slug.TITLES` — those checks assert AGREEMENT, so a known divergence there is a permanent red, not a pin. Written up as a WHY-NOT in `check_slug.py`'s docstring |
| **I7** CHANGELOG stale | **REJECTED (scope)** | TOP_LEVEL_AGENT writes ONE entry for the entire flow, per my instructions. **Its content, verified as still needed:** refresh the delegated-command list (now `… show create status start close reopen`), extend the empty-id entry from `tk show ""` to writes (`tk close ""`), and log divergence #10's new message. #11/#12 are pathological-input changes worth one line at most |

## Suggestions

| # | Verdict | What was done |
|---|---|---|
| S1 trailing newline unpinned | **INCORPORATED** | `CreateCommand` unit tests assert the emitted text ends with `}\n` and is exactly one line |
| S2 `LINE_SEPARATOR` in six modules | **INCORPORATED** | `src/core/text.ts` exports it; `frontmatter.ts`, `cli-error.ts`, `query.ts`, `show.ts`, `create.ts`, `status.ts` import it. Phases B/C: import, do not re-declare |
| S3 `TicketStatus` union | **DEFERRED to a ticket** — `nid_em5zmsstl3kz85jp8n70aidbb_e`. Pre-existing, touches the read commands too, and as a pure refactor it would lose every merge race against phases B/C; the ticket says to do it with or after phase C |
| S4 one `decide` ticket for #6 + #10 | **INCORPORATED and widened** — `nid_r3mp6uylht7t77iwxtuqvhxv2_e` (tag `decide`) bundles #6, #10, #11 and #12, i.e. every "bash crashed or wrote garbage, TS does something sane" decision that shipped without sign-off, with the per-item revert cost spelled out |

## Write-parity harness: PROMOTED into `make parity`

The reviewer's throwaway differ is now **`scripts/parity/check_write.py`**, a fourth row in
`make parity` output (`write OK cases=63 failures=0`) and therefore in CI.

What it does: creates two identical throwaway git repos, runs the same command sequence with
the pinned bash copy in one and the shipped `./ticket` in the other, and compares a transcript
of `rc` + stdout + stderr for every command **plus every byte of every file under
`_tickets/`**. Only generated ids (`<ID1>`, `<ID2>`, … consistently) and ISO timestamps
(`<TS>`) are neutralised. Each repo sets its own `git config user.name`, so `create`'s default
assignee is inside the comparison instead of leaking the developer's global config.

**How phases B and C use it: add one `Case(...)` to `CASES`.** That is the whole extension
cost for `dep <id> <dep-id>`, `undep`, `link`, `unlink`, `add-note` and `edit`. Use
`Case(name, commands, fixtures)` for "must agree" and `Case(..., diverges=True)` for a
declared divergence — that arm INVERTS the expectation and fails loudly with
"DIVERGENCE GONE … the README.md whitelist entry is stale" if the two sides ever agree again.
It reuses `harness.BashReference`, so the "both delegation lists emptied exactly once" guard
protects it too; the TS side is the real `./ticket`, so both sides have basename `ticket` and
usage strings compare directly. It uses its own `WriteRepo` rather than `harness.TempRepo`
(WHY-NOT documented in the class): `TempRepo` pre-creates `_tickets` and sets `TICKETS_DIR`,
and "the dir does not exist yet" plus "resolve the root from the cwd" are half the contract.

**It is not vacuous, and that is measured:** 8 mutations of the TS write path all turn it red
(`closed_iso` never written, a new frontmatter field appended instead of prepended, tags not
re-spaced, git-config assignee default dropped, `--parent` not expanded, `Updated <typed id>`,
`.trim()` back on git output, slug collisions ignored). Forcing every `diverges` flag to
`False` reports exactly the 5 divergence cases and nothing else — the other 58 agree
byte-for-byte.

`scripts/parity/README.md`'s "Write commands are not diffed" section is replaced by
"Write commands: compared by FILE BYTES", and the matching CLAUDE.md sentence is corrected.

## New-test evidence, with real exit codes

The review's methodology warning was acted on: every gate was run as
`make X > .tmp/… 2>&1; echo rc=$?`. **No pipe anywhere**, so no `tail` can mask a failure.
The previous "13/13" table was produced under the masking trap and should not be trusted; the
6 mutations below are the re-verified ones.

| Mutation (the 5 review escapees + I5) | gate rc | verdict |
|---|---|---|
| git-config default assignee dropped | bdd=1 | CAUGHT |
| `--parent` not resolved to the full id | unit=1, bdd=1 | CAUGHT |
| program name hardcoded to `ticket` | unit=1 | CAUGHT |
| no trailing newline after `create`'s JSON | unit=1 | CAUGHT |
| `Updated <typed id>` instead of the full id | bdd=1 | CAUGHT |
| `Git.output` back to `.trim()` | unit=1 | CAUGHT |

Gates:

```
make typecheck  rc=0
make unit-test  rc=0   tests 334  pass 334  fail 0        (was 323)
make test       rc=0   12 features, 229 scenarios, 1513 steps, 0 failed   (was 226)
make parity     rc=0   graph OK 71 | query OK | slug OK 13 | write OK 63  (write is new)
```

## Files changed this iteration

New: `scripts/parity/check_write.py`, `src/core/text.ts`, `test/program-name.test.ts`.

Modified: `src/core/git.ts` (trailing-newline strip + corrected WHY), `src/core/slug.ts` and
`src/core/ticket-store.ts` (divergence comments), the six `LINE_SEPARATOR` modules,
`scripts/parity/run.py` (+`write` row), `scripts/parity/README.md`,
`scripts/parity/check_slug.py` (docstring WHY-NOT), `CLAUDE.md`,
`docs-internal/migration-to-ts-high-level.md`, `features/ticket_creation.feature`,
`features/ticket_status.feature`, `features/steps/ticket_steps.py` (2 new steps),
`test/create-command.test.ts`, `test/git.test.ts`.

Also created (they are ticket files, so they show as new `_tickets/*.md`):
`nid_r3mp6uylht7t77iwxtuqvhxv2_e` (decide) and `nid_em5zmsstl3kz85jp8n70aidbb_e`.

## Remaining known gaps

- `check_write.py` covers `create` + the status family only; the remaining write commands are
  phases B/C, one `Case(...)` each.
- `CHANGELOG.md` is still stale — deliberately, see I7.
- `README.md` needs nothing (the reviewer agreed): no flag or command surface changed.
