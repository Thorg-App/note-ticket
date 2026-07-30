# IMPLEMENTATION_REVIEW_PHASE_A__PUBLIC — T5 phase A (`create` + `status`/`start`/`close`/`reopen`)

## Summary

`create`, `status`, `start`, `close`, `reopen` are ported and flipped into `TS_COMMANDS`
(`ticket:1600`), with shared plumbing (`src/core/clock.ts`, `src/core/git.ts`,
`src/cli/program-name.ts`, `src/cli/command-environment.ts`, three named `StoreResolver`
entry points, `TicketField`) that phases B and C can consume as-is.

**Parity correctness is genuinely good.** I built the write-mutation differential harness the
project does not have (bash pinned copy vs `./ticket`, comparing stdout+stderr+rc **and every
byte under `_tickets/`**, ids and timestamps neutralised) and ran 63 shapes. 61 are
byte-identical; the 2 declared divergences (#5, #9, #10) reproduce exactly as documented.
I found no correctness defect, no security issue, no lost functionality, and no removed
scenario. All four gates are green as claimed.

**The gap is test-pinning.** Independently mutating the new code, 5 mutations on NEW code
paths escaped both `npm test` and `behave` — including "`--parent` is no longer normalised to
the full id" and "the git-config default assignee is gone". These are exactly the class this
repo has documented being burned by twice. Every fix below is a few lines.

Harness: `.tmp/rev/differ.py`, `.tmp/rev/mutate.py`, `.tmp/rev/bash-ref` (details in the
PRIVATE file). Worth keeping — the parity README correctly says `make parity` exercises no
write command, and this closes that hole cheaply.

## Verified gates (my own runs, logs in `.tmp/`)

| gate | rc | evidence |
|---|---|---|
| `make typecheck` | 0 | `.tmp/rev-typecheck.log` |
| `make unit-test` | 0 | `.tmp/rev-unit.log`, 323 pass / 0 fail |
| `make test` | 0 | `.tmp/rev-bdd.log`, 12 features, 226 scenarios, 1496 steps, 0 failed |
| `make parity` | 0 | `.tmp/rev-parity.log`, graph 71 scenarios, query OK, slug 13 titles |

All match the implementer's claims. Tree left pristine and `make build` re-run after
mutation testing.

## 🚨 CRITICAL Issues

None.

## ⚠️ IMPORTANT Issues

### I1 — `--parent` normalisation to the FULL id is unpinned, and the existing scenario is vacuous
**SHOULD-FIX.** `features/ticket_creation.feature:46-50` uses the fixture id `parent-001` and
passes `--parent parent-001`, i.e. an EXACT id, so "the value the user typed" and "the full
id" are the same string. Replacing `src/cli/commands/create.ts:223`
(`return TicketLookup.byId(store.loadAll(), parent).id;`) with `return parent;` keeps
`npm test` AND `behave` green, while breaking three of my differ cases: `--parent 001` would
write the partial id, and `--parent zzz` / `--parent nid_` would silently succeed instead of
failing. This is a named contract in EXPLORATION §3.1.
Fix: change that scenario to `--parent 001` and assert
`the created ticket should have field "parent" with value "parent-001"`, plus one scenario
for an unresolvable `--parent` failing with `Error: ticket 'zzz' not found`.

### I2 — `create`'s default assignee (`git config user.name`) is untested end to end
**SHOULD-FIX.** `src/cli/commands/create.ts:203` →
`assignee: options.assignee ?? ""` escapes both gates. `test/git.test.ts` pins the *reader*,
not the wiring, so the fallback can be deleted silently. The stated reason ("a scenario would
be flaky") does not hold: `features/environment.py:10-18` `git init`s a private temp repo per
scenario, so a `Given the git user.name is "Golden Tester"` step running
`git config user.name` in `context.test_dir` is fully deterministic (repo-local config beats
global). A unit test on `CreateCommand.run` with an injected `CommandEnvironment` would do
equally well.

### I3 — `Updated <FULL id> -> <status>` is unpinned
**SHOULD-FIX.** `src/cli/commands/status.ts:106` → `Updated ${search} -> ${status}` escapes
both gates: "Status command with partial ID" (`features/ticket_status.feature`) asserts only
success. Bash prints the resolved full id (EXPLORATION §3.2). One line fixes it:
`And the output should contain "Updated test-0001 -> in_progress"`.

### I4 — `ProgramName.invoked()` has no test, and BDD structurally cannot cover it
**SHOULD-FIX.** Hardcoding `src/cli/program-name.ts:18` to the literal `ticket` escapes both
gates, because the BDD suite always invokes `./ticket`, whose basename IS `ticket`; the
status usage tests inject `"tk"` through the `CommandEnvironment` constructor and never reach
the resolver. EXPLORATION §1 (MISSING item 6) explicitly says "do not hardcode". The method
already takes `env` and `argv` as injectable parameters — two unit tests
(`ProgramName.invoked({ TICKET_INVOKED_AS: "/usr/local/bin/tk" }, [])` → `"tk"`, and the
`argv[1]` fallback) close it.

### I5 — `Git.output()`'s `.trim()` diverges from bash, and its WHY comment misstates why
**SHOULD-FIX (honesty).** `src/core/git.ts:34-45`. The comment says "WHY trimmed: bash reads
the same values through command substitution, which strips the trailing newline" — but
`.trim()` strips leading and trailing whitespace, which `$( )` does not.
Repro: `GIT_CONFIG_COUNT=1 GIT_CONFIG_KEY_0=user.name GIT_CONFIG_VALUE_0='  Padded Name  '
tk create T` → bash writes `assignee:   Padded Name  `, TS writes `assignee: Padded Name`.
(The same `.trim()` sits on `repoRoot`, where a repo path with trailing whitespace would be
corrupted — pre-existing, but same root cause.) Either trim only trailing newlines, or keep
the trim and make the comment say so and add a whitelist line. As written the comment claims
a parity that is not there, which is exactly what CLAUDE.md's "no lies or misconceptions"
rule is about.

### I6 — Two undeclared divergences surfaced by flipping `create`
**SHOULD-FIX (divergence hygiene).** Both are pathological inputs, but the rule in
`scripts/parity/README.md` is that every deliberate difference is declared.

1. **A newline in the title.** `tk create $'line1\nline2'`: bash creates a file literally
   named `line1<LF>line2.md` (its `sed 's/[^a-z0-9-]//g'` is line-oriented, so the LF
   survives, as does the per-line `s/^-//; s/-$//`); `Slug.fromTitle`
   (`src/core/slug.ts:26-37`) deletes it and produces `line1line2.md`. Bash additionally
   emits invalid JSON for that title. `harness.HOSTILE_TITLES` contains no newline, so
   `check_slug.py` cannot see this — the same generator blind spot the memory file records
   for duplicate `deps`. Suggest adding `\n` to `HOSTILE_TITLES` and whitelisting the
   result (TS's behaviour is the sane one).
2. **`_tickets/<slug>.md` existing as a DIRECTORY.** bash's `[[ -f ]]` is false, so it
   redirects into a directory and dies with `Is a directory`, rc=1; TS's `existsSync`
   (`ticket-store.ts:196-198`) is true, so it picks `dup-1.md` and succeeds. One whitelist
   line is enough.

### I7 — CHANGELOG.md is now stale
**SHOULD-FIX.** `CHANGELOG.md`'s Unreleased entry enumerates the delegated commands
("`help`, `ls`/`list`, `ready`, `blocked`, `closed`, `query` and `show` are delegated so
far") and no longer tells the truth, and the empty-id entry mentions only `tk show ""` when
the user-visible cost is now on `tk close ""`. Divergence #10's new message
(`Error: option '--design' requires a value`) is also a user-visible behavior change.
CLAUDE.md mandates a CHANGELOG entry for behavior changes and the previous phases did log
theirs; "not touched per instructions" leaves the file actively misleading. README.md needs
nothing — no flag or command surface changed.

## 💡 Suggestions

- **S1 (NIT)** `create`'s trailing newline after the JSON line is unpinned — removing
  `${LINE_SEPARATOR}` at `create.ts:209` escapes both gates (BDD steps `.strip()` and
  `_track_created_ticket` only parses JSON). One `assert.equal` on the emitted text, or a
  scenario asserting `the output should be valid JSON with an id field` is already there —
  so this is genuinely low.
- **S2 (NIT)** `LINE_SEPARATOR = "\n"` is now declared in six modules
  (`frontmatter.ts`, `cli-error.ts`, `query.ts`, `show.ts`, `create.ts`, `status.ts`). A
  single `src/core/text.ts` would be DRYer; not worth churn on its own, but do not add a
  seventh in phase B.
- **S3 (NIT)** `TicketField` is a static class of `string`s, so `StatusUpdate.applied(t,
  status: string, …)` and `VALID_TICKET_STATUSES: readonly string[]` give up the
  compile-time status union CLAUDE.md's "prefer compile-time checks" would want. Pre-existing;
  if phase B/C touches statuses, a `TicketStatus` union is the moment.
- **S4** Divergence #10 has no `decide` ticket. I agree with the implementer that it is the
  same class as the already-untickceted #6, but #6 and #10 together are now two silent
  "we replaced a shell crash with a message" decisions — one `decide` ticket bundling both
  would be cheap and honest.

### Explicitly good, keep doing this in B/C
- `StatusUpdate` (pure frontmatter change) split from `StatusCommand` (I/O + exit code) makes
  the file bytes and key ORDER directly assertable — that split is why 6 of my 20 mutations
  died in unit tests rather than escaping.
- The single-clock-read "refinement" cannot regress: `applied(ticket, status, now)` takes the
  timestamp as a parameter, so there is only one reading by construction rather than by
  discipline. Correctly documented as a refinement, not a divergence.
- `forReadCommand()` / `forWriteCommand()` / `forCreateCommand()` with the WHY on why the
  first two coincide *by bash's decision, not by identity* — this is the right call and the
  comment is what stops a future reader "simplifying" it.
- `src/core/clock.ts` and `src/core/git.ts` carry zero CLI knowledge; the core boundary held.
- The `scripts/parity/README.md` "Write commands are not diffed" section and the matching
  CLAUDE.md sentence are honest reporting of a real coverage hole. That honesty is why I
  built the differ instead of trusting a green `make parity`.

## Independent mutation results (20 mutations, my own list)

| | mutation | caught by |
|---|---|---|
| M2 | `status` validates AFTER resolving the id | bdd |
| M3 | new frontmatter field appended, not prepended | unit |
| M4 | flag-with-no-value silently becomes `""` (kills #10) | unit |
| M5 | empty title no longer falls back to `Untitled` | unit |
| M6 | write commands may mkdir `_tickets` | bdd |
| M7 | `closed_iso` never removed on reopen | unit |
| M8 | `status_updated_iso` not restamped | unit |
| M9 | `external-ref` spelled with `_` | unit |
| M10 | tags not re-spaced after commas | unit + bdd |
| M12 | title quotes not escaped | unit |
| M14 | clock keeps fractional seconds | bdd |
| M18 | body's leading blank line dropped | unit |
| M20 | slug collision suffix ignored | bdd |
| **M1** | **git-config default assignee dropped** | **ESCAPED** (→ I2) |
| **M13** | **`--parent` not resolved to the full id** | **ESCAPED** (→ I1) |
| **M15** | **program name hardcoded to `ticket`** | **ESCAPED** (→ I4) |
| **M16** | **no trailing newline after `create`'s JSON** | **ESCAPED** (→ S1) |
| **M19** | **`Updated <typed id>` instead of the full id** | **ESCAPED** (→ I3) |

The five escapes were all caught by my differ, which is how I know they are real behavior
changes and not equivalent mutants.

Methodology warning for whoever repeats this: running behave as `behave | tail -40` makes
the pipeline exit code `tail`'s, so **every** mutation looks BDD-green. I hit that and had to
re-run six mutations. The implementer's "13/13 caught" table should be re-checked for the
same trap.

## Documentation Updates Needed

- `CHANGELOG.md` — refresh the delegated-command list, add create/status/start/close/reopen,
  divergence #10's message, and extend the empty-id entry to writes (I7).
- `scripts/parity/README.md` — declare the two divergences in I6; consider adding `\n` to
  `harness.HOSTILE_TITLES` so `check_slug` can see the first one.
- `src/core/git.ts` — correct the `.trim()` WHY comment (I5).
- `CLAUDE.md` and `docs-internal/migration-to-ts-high-level.md` are otherwise accurate and
  well updated; #10 is described correctly (I verified bash really dies with
  `line 308: $2: unbound variable` at rc=1, and that both sides still leave `_tickets/`
  created).

## Verdict

**NOT-READY** — 0 BLOCKING issues, 7 SHOULD-FIX. No correctness, security or
lost-functionality defect was found; parity against pinned bash is byte-exact on 61 of 63
probed shapes with only declared divergences. What holds it back is that five mutations on
new code paths ship undetected (I1–I4 + S1), two of which — `--parent` normalisation and the
default assignee — are contract points named in the exploration doc, and that two
divergences and the CHANGELOG are undeclared/stale. Every item is a few lines; re-run
`npm test` + `behave` after adding the pins and this is a clean phase.
