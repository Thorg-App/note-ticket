# IMPLEMENTATION_PHASE_A__PRIVATE — T5 phase A (create + status/start/close/reopen)

Status: **COMPLETE, iteration 1 (review response) done**. All gates green with real exit
codes. Nothing left half-done. Not committed (TOP_LEVEL_AGENT commits).
Iteration-1 notes are at the BOTTOM of this file; everything above it is the original run.

## What I did, in order

1. Read `EXPLORATION_PUBLIC.md` (leaned on it entirely — did not re-explore), `CLAUDE.md`,
   `docs-internal/migration-to-ts-high-level.md`, then the actual sources it named:
   `src/cli/main.ts`, `src/core/{ticket,ticket-store,frontmatter,slug,id}.ts`,
   `src/cli/{store-resolver,cli-error,ticket-lookup,commands/show}.ts`, bash `ticket:1-260`,
   `290-440`, `1590-1642`, `features/{ticket_status,ticket_creation,id_resolution}.feature`,
   `features/steps/ticket_steps.py` (run + assertion steps), `Makefile`, `package.json`,
   `scripts/parity/{dump.ts,README.md}`.
2. **Captured bash golden behavior empirically** in `.tmp/pa` (git init + `TICKETS_DIR`)
   BEFORE writing code — this is what the unit-test golden strings are:
   - `create 'Full Ticket "quoted"' -d … --design … --acceptance … -t bug -p 1 -a 'Jane Doe'
     --external-ref JIRA-9 --tags 'a,b , c'` → file bytes via `cat -A` + the JSON line.
     Key finding: `tags: [a, b ,  c]` (commas re-spaced, NOTHING trimmed).
   - `create x --design` (missing value) → `ticket: line 308: $2: unbound variable`, rc 1.
   - `create y --bogus` → `Unknown option: --bogus`, rc 1 (no `Error: ` prefix).
   - `create aa bb` → title `bb` (last positional wins).
   - `close <id>` → `closed_iso` inserted as the FIRST frontmatter line; `reopen` removes it.
   - `status` / `close` with too few args → usage lines; `status <id> nope` → invalid status.
3. Wrote the shared plumbing, then the two commands, then wired `main.ts`, then flipped
   `TS_COMMANDS`.
4. Re-ran the same bash commands against the TS-served `./ticket` in `.tmp/pb` and compared
   by eye: byte-identical modulo id/timestamp (including `tags: [a, b ,  c]`, JSONL
   `\\\"` escaping, `closed_iso` position, all usage strings).
5. Unit tests + BDD scenarios, then **mutation-tested every guard** (see below).
6. Docs: `CLAUDE.md`, `docs-internal/migration-to-ts-high-level.md`,
   `scripts/parity/README.md` (+divergence #10, +"Write commands are not diffed"),
   `scripts/parity/dump.ts` header.

## Design decisions (and the WHY, for a reviewer who asks)

- **`CommandEnvironment`** (`src/cli/command-environment.ts`) bundles the four ambient,
  non-deterministic things a write command needs: `programName`, `clock`, `newTicketId()`,
  `defaultAssignee()`. Constructor takes all four with real defaults; `forProcess()` binds
  the process. Considered passing them individually — rejected: `StatusCommand.run(store,
  args, programName, clock)` grows a parameter per phase, and phases B/C need the same set.
- **`ProgramName`** extracted out of `Cli.programName()` (was `private static`). `main.ts`
  now uses `environment.programName` for help + unknown-command too.
- **`StoreResolver.forWriteCommand()` is deliberately a duplicate of `forReadCommand()`'s
  body** via a shared private `existingStore()`. NOT an alias, because "it is a write so it
  may mkdir" is exactly the wrong inference (bash `WRITE_COMMANDS="create"`). Documented.
  `forCreateCommand()` mkdirs, and is called from `main.ts` BEFORE `CreateCommand.run`, which
  reproduces bash's "ensure_dir before arg parsing".
- **`Clock`/`SystemClock`/`FixedClock` in core** — injectable so file bytes are testable.
  `FixedClock` ships in `src/core/clock.ts` (5 lines, used by tests, will be used by B/C).
- **`Git` in core** — extracted `TicketsDirectory.gitRepoRoot` into it and added
  `configuredUserName()`; both go through one `Git.output()` (DRY on the
  `execFileSync` + `stdio:["ignore","pipe","ignore"]` + try/catch shape). `undefined` for
  "unknown", which is bash's `2>/dev/null || true`.
- **`TicketField` exported from `src/core/ticket.ts`** replacing the module-private
  `FIELD_*` consts, and extended with `TYPE`, `EXTERNAL_REF`, `CREATED_ISO`,
  `STATUS_UPDATED_ISO`, `CLOSED_ISO`. Phases B/C: use `TicketField.DEPS` / `.LINKS`, do NOT
  re-spell key names.
- **`create` split three ways**: `CreateOptionsParser` (pure arg parse),
  `NewTicketDocument` (pure bytes; `of()` + `titleOf()`), `CreateCommand.run` (I/O).
  Same for `status`: `StatusUpdate.applied()` is the pure frontmatter change, extracted from
  a first draft where it was `private static restamped` — made public precisely so the
  key-order assertions are unit-testable without stdout capture.
- **One clock read in `status`** where bash calls `_iso_date` twice. Judged not a
  user-visible divergence (both are "now"); documented as a WHY in code + migration doc, no
  parity whitelist entry.
- Left bash `cmd_create`/`cmd_status`/… and `TS_DEP_SUBCOMMANDS` in place: dead but the
  sanctioned deletion point is T6, and `scripts/parity/harness.py:34` REQUIRES both
  delegation assignments to exist.

## Divergences declared

- **#10** (new, `scripts/parity/README.md` + migration doc + code comment on
  `CreateOptionsParser.parse` + BDD scenario): a value-taking flag at the end of the arg list
  → `Error: option '--design' requires a value`, exit 1, instead of bash's
  `./ticket: line 308: $2: unbound variable`. **No `decide` ticket filed**: it replaces a
  shell crash message with an actionable one at the same exit code, which is the same class
  as already-approved-without-a-ticket #6 (the `jq` message). Call it out to the human, but
  it did not warrant blocking.
- #9 (already whitelisted) now also covers writes: `tk close ""` fails instead of closing the
  only ticket. New BDD scenario in `features/id_resolution.feature`.

## Mutation testing — runner and results

Runner: `.tmp/mutate_t5a.py` (NOT committed; `.tmp/` is scratch). It patches one anchor
string, runs either `npm run --silent test` (requiring a `✖ <named test>` line) or
`make build && uv run --with behave behave -n "<scenario>"` (requiring `N failed > 0`), then
restores the file. Run: `python3 .tmp/mutate_t5a.py` (optionally `python3 .tmp/mutate_t5a.py M13`).

All 13 CAUGHT on the final run:

| # | Mutation | Caught by |
|---|---|---|
| M1 | `IdResolver` empty search returns all candidates | BDD "An empty ID closes no ticket" |
| M2 | status usage hardcodes `ticket` | unit "prints the invoked program name…" |
| M3 | `Frontmatter.withField` appends instead of prepends | unit "inserts closed_iso as the FIRST" |
| M4 | `closed_iso` kept on reopen | BDD "Reopening a closed ticket removes closed_iso" |
| M5 | create body loses its blank line | unit golden "body of one blank line" |
| M6 | tags not re-spaced | BDD "Tags are stored as an inline array" |
| M7 | unknown option gains `Error: ` | unit "un-prefixed wording" |
| M8 | `forWriteCommand` mkdirs | BDD "Error when no tickets directory for a write command" |
| M9 | id resolved before status validated | BDD "An invalid status is reported even when…" |
| M10 | first positional wins | unit "lets the LAST positional win" |
| M11 | `Git` reads `user.email` | unit "reads user.name from the enclosing repository" |
| M12 | `status_updated_iso` not restamped | unit "restamps status_updated_iso from the clock" |
| M13 | empty title not defaulted | BDD "An empty title falls back to Untitled" (after fix) |

**M13 ESCAPED on the first run** and this is the interesting one: the scenario originally
asserted only `a file named "untitled.md" should exist`, which `Slug.fromTitle("")`'s OWN
fallback produces regardless — a textbook vacuous assertion. Fixed by asserting the
frontmatter `title` is `Untitled`; the filename assertion is kept with a comment saying why
it cannot carry the pin. Note M12 is also a case where the BDD scenario is vacuous by
construction (the fixture already has a valid `status_updated_iso`, so "should have a valid
timestamp" passes without any restamping) — the unit test is the real guard there.

## Commands used (verbatim, all from repo root)

```bash
make typecheck ; make unit-test ; make build ; make test ; make parity     # logs in .tmp/*.log
python3 .tmp/mutate_t5a.py
# golden capture / manual bash-vs-TS compare
rm -rf .tmp/pa && mkdir -p .tmp/pa && cd .tmp/pa && git init -q . && export TICKETS_DIR=$PWD/_tickets
```

Final gate output: unit 323 pass / 0 fail; BDD 226 scenarios passed, 0 failed (12 features);
parity `graph OK (71 scenarios)`, `query OK`, `slug OK`.

## Notes / gaps for whoever continues

- No BDD scenario pins `create`'s DEFAULT assignee (`git config user.name`). Deliberate:
  the BDD temp repo has no local `user.name`, so the value depends on the developer's/CI's
  global config and a scenario would be flaky. `test/git.test.ts` pins the underlying reader
  with a repo-local `user.name` + `process.chdir`.
- `make parity` does not exercise ANY write command; I documented that loudly rather than
  extending the harness (a fair write diff needs file-byte comparison with timestamp/id
  neutralization — a real project, and phase-scope creep here).
- `dist/ticket.mjs` is gitignored; rebuilt at the end of the run so the tree is consistent.
- Untouched on purpose: `CHANGELOG.md`, `README.md` (no user-visible behavior change worth
  documenting there — the empty-id sentence already generalizes), `change_log` tool, git.

---

# ITERATION 1 — response to IMPLEMENTATION_REVIEW_PHASE_A (NOT-READY, 0 blocking, 7 should-fix)

Fresh instance. Rehydrated from this file + PUBLIC + the review. Did NOT re-explore bash.

## Decisions, one line each

| Review item | Decision |
|---|---|
| I1 `--parent` normalisation unpinned, scenario vacuous | INCORPORATED — scenario now passes a PARTIAL id; + unresolvable-parent scenario; + 2 unit tests on `CreateCommand.run` |
| I2 default assignee untested end to end | INCORPORATED — new BDD step `Given the git user.name is "X"` (repo-local config, deterministic) + 2 scenarios + 2 unit tests |
| I3 `Updated <FULL id>` unpinned | INCORPORATED — one assertion added to the partial-id status scenario |
| I4 `ProgramName.invoked()` untestable by BDD | INCORPORATED — `test/program-name.test.ts`, 4 cases (incl. the empty-env-var arm) |
| I5 `.trim()` diverges + comment lies | INCORPORATED as a **bug fix, not a doc fix** — `Git.output` now strips trailing newlines only (`/\n+$/`), which is what `$( )` does; comment rewritten with a WHY-NOT; pinned by unit test + a `check_write` case with `user.name="  Padded Name  "` |
| I6 two undeclared divergences | INCORPORATED as declarations (#11 newline in title, #12 slug-shaped directory): code comments on `Slug.fromTitle` / `TicketStore.topLevelFileExists`, `scripts/parity/README.md`, migration doc, AND a `diverges=True` case each in the new write-parity check. REJECTED the sub-suggestion to add `\n` to `harness.HOSTILE_TITLES`/`check_slug.TITLES` — those checks expect AGREEMENT, so a known divergence there is just a permanent failure; documented that WHY-NOT in `check_slug.py`'s docstring |
| I7 CHANGELOG stale | REJECTED (scope) — TOP_LEVEL_AGENT writes ONE entry for the whole flow; recorded in PUBLIC for it |
| S1 trailing newline after the JSON line | INCORPORATED — `CreateCommand` unit tests assert the emitted text ends `}\n` and is exactly one line |
| S2 `LINE_SEPARATOR` in six modules | INCORPORATED — `src/core/text.ts` exports it; all six import it. Mechanical, and it removes the "do not add a seventh" trap for phases B/C |
| S3 `TicketStatus` union | DEFERRED to a ticket (`nid_em5zmsstl3kz85jp8n70aidbb_e`) — pre-existing, touches read commands, would lose a merge race against phases B/C |
| S4 one `decide` ticket for #6 + #10 | INCORPORATED and widened to #6/#10/#11/#12 — ticket `nid_r3mp6uylht7t77iwxtuqvhxv2_e`, tag `decide` |

## The high-leverage item: write-parity harness PROMOTED

The reviewer's throwaway (`.tmp/rev/differ.py`) is now `scripts/parity/check_write.py`, wired
into `run.py` (a 4th result row: `write OK cases=63 failures=0`) and therefore into
`make parity` and CI.

Differences from the reviewer's version, and why:
- reuses `harness.BashReference.path()` + `harness.TICKET`, so the "both delegation lists must
  be emptied exactly once" guard covers it too. TS side is the real `./ticket`, so both sides
  have basename `ticket` and usage strings compare directly.
- `WriteRepo` instead of `harness.TempRepo` (documented WHY-NOT in the class doc): TempRepo
  pre-creates `_tickets` and sets `TICKETS_DIR`, and "what happens when the dir does not
  exist" plus "resolve the root from the cwd" are half of what a write command must get right.
- each repo sets its OWN `git config user.name`, so `create`'s default assignee is part of the
  compared bytes instead of leaking the developer's/CI's global name. One case uses a PADDED
  name, which is what pins I5.
- `Case(..., diverges=True)` INVERTS the expectation, so #5/#9/#10/#11/#12 are pinned, not
  merely described, and a "divergence gone" message names the stale README entry.

Vacuity proof (`.tmp/mutate_write_parity.py`, logs in `.tmp/it1wparity/`): 8 mutations of the
TS write path, **8/8 CAUGHT**, `rc=1` each — `closed_iso` never written, new frontmatter field
appended instead of prepended, tags not re-spaced, git-config assignee default dropped,
`--parent` not expanded, `Updated <typed id>`, `.trim()` on git output, slug collisions
ignored. Separately, forcing every `diverges` to `False` reports exactly the 5 divergence
cases and nothing else (58/63 agree byte-for-byte), which is the other half of the proof.

## Mutation results — the five review escapees, real exit codes

Runner `.tmp/mutate_it1.py`, logs `.tmp/it1mut/`. Output is REDIRECTED to files and the code
read from `subprocess.returncode` — never `cmd | tail`, which was the reviewer's methodology
warning and is why the original 13/13 table was untrustworthy.

| # | Mutation | gate rc | verdict |
|---|---|---|---|
| M1 | git-config default assignee dropped | bdd=1 | CAUGHT |
| M13 | `--parent` not resolved to the full id | unit=1, bdd=1 | CAUGHT |
| M15 | program name hardcoded to `ticket` | unit=1 | CAUGHT |
| M16 | no trailing newline after `create`'s JSON | unit=1 | CAUGHT |
| M19 | `Updated <typed id>` | bdd=1 | CAUGHT |
| M21 | `Git.output` back to `.trim()` | unit=1 | CAUGHT |

`escaped=[]`. (The `bdd` gate here is `behave features/ticket_creation.feature
features/ticket_status.feature`, not the whole suite — faster, and the pins live there.)

## Gates (this iteration, final, unmasked)

```
make typecheck  rc=0    .tmp/it1-g2-typecheck.log
make unit-test  rc=0    .tmp/it1-g2-unit.log     tests 334  pass 334  fail 0
make test       rc=0    .tmp/it1-g2-test.log     12 features, 229 scenarios, 1513 steps, 0 failed
make parity     rc=0    .tmp/it1-g2-parity.log   graph OK 71 | query OK | slug OK 13 | write OK 63
```
Each was run as `make X > file 2>&1; echo rc=$?` — no pipe anywhere.

## Commands used this iteration

```bash
make typecheck > .tmp/it1-g2-typecheck.log 2>&1; echo rc=$?     # and unit-test / test / parity
python3 .tmp/mutate_it1.py              # the 6 mutations above
python3 .tmp/mutate_write_parity.py     # the 8 write-parity mutations
python3 -c "...check_write.run()"       # single check, and the all-diverges-False variant
./ticket create ...                     # the two follow-up tickets (also a live smoke test of the port)
```

## Gaps left, honestly

- `check_write.py` covers `create` + the status family only. `dep`/`undep`/`link`/`unlink`/
  `add-note`/`edit` need one `Case(...)` each in phases B/C — that is now the cheapest test in
  the repo, so there is no excuse for skipping it.
- The write check runs 63 cases × 2 sides × ~1.2 commands = ~150 process pairs; `make parity`
  is still under ~4 min wall clock here. If it ever becomes the bottleneck, split it rather
  than trimming cases.
- `CHANGELOG.md` still not updated — deliberate, TOP_LEVEL_AGENT's job.
