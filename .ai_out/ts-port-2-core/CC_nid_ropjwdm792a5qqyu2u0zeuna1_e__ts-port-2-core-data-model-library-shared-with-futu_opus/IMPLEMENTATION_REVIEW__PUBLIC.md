# T2 review — `src/core/` data-model library (commit `cd5b657`)

## Summary

Adds `src/core/{frontmatter,ticket,ticket-store,id,slug,dep-graph}.ts` + 6 `node:test` suites, a
`unit-test` make target, and a CLAUDE.md module map. No `TS_COMMANDS` flip, `ticket` and `features/`
untouched, no use cases removed, no vitest.

This is high-quality work. The code is small, immutable, strictly typed, honestly decomposed, and the
comments explain WHY (and WHY-NOT) rather than restating the code. Parity was verified empirically
rather than guessed, and the two follow-up tickets are real and well written. I independently
re-verified the load-bearing parity claims (see below) and they hold.

Two things must be settled before any write command is flipped: `save()` lost bash's atomic-rename,
and `TicketDocument.text()` makes a byte-exactness promise it does not keep for unterminated
frontmatter.

## Verified test results (I ran these, not quoting the implementer)

| Command | Result |
|---|---|
| `npx tsc --noEmit` | exit 0, clean |
| `npm test` | **154 tests, 23 suites, 154 pass, 0 fail** |
| `make test` (build + unit + behave) | **12 features, 180 scenarios, 1205 steps, 0 failed** |
| `./sanity_check.sh` | not present in this repo |

## HARD RULE (zero CLI knowledge): holds

`grep -rn 'process\.argv|console\.|process\.exit|stdout|stderr|process\.env' src/core/` → one hit:
`src/core/ticket-store.ts:25`, `resolve(env = process.env, cwd = process.cwd())`. Injectable
defaults, and the tests exercise the injected form. Compliant. No console, no argv, no formatting,
errors returned as unions.

## Parity I re-verified myself against `./ticket`

- **Discovery / byte order** — built `a<U+FFFD>.md` + `a<U+10000>.md` + `.hidden/visible/h.md` +
  `.dotfile.md` + `sub/s.md`; bash `find -L … -prune … | LC_ALL=C sort -z` and `collectFiles()`
  produced **identical** lists, U+FFFD first. A plain JS string sort would reverse that pair, so the
  `Buffer.compare` in `PathOrder` is genuinely load-bearing and genuinely tested.
- **Symlinks** — symlinked dir, symlinked file, dangling link, and a loop back to the root: same file
  set as bash (bash additionally writes "File system loop detected" to stderr; TS is silent).
- **Slug** — 11 titles through a verbatim copy of bash `title_to_filename`, incl. `İstanbul`→`stanbul`,
  `ǅuvo`→`uvo`, tab-stripped-not-hyphenated, 200-char truncation exposing a hyphen: **all match**.
- **JSONL** — real `_file_to_jsonl` vs `JSON.stringify(ticket.toJsonRecord())` for a title with
  `\"` and `\\`, a `"Colon: inside"` value, `deps: [a, b]`, `tags: []`, `assignee: John Doe`:
  **byte-identical**.
- **Frontmatter key order** — `Frontmatter#withField` prepending a new key matches bash
  `update_yaml_field` inserting after the opening `---` (read at `ticket:202-204`). Correct, and the
  test at `test/frontmatter.test.ts:122` pins it.
- **Unknown-dep-blocks-ready** — bash `ticket:898` `statuses[dep] != "closed"` with `statuses[dep]`
  absent → blocks; `DepGraph.isClosed` returns false for unknown. Match, and tested.
- **`dep tree` sibling ordering** — I did not re-run the 128-graph harness; I read
  `ticket:482-615` against `TreeLayout` line by line and they correspond, including the
  snapshot-before-recurse (= bash pushing all `!(child in subtree_depth)` children at once,
  `ticket:522-530`) and the bug-for-bug connector quirk where a `└──` can land on a row that is then
  skipped, leaving the visually-last row with `├──`.

## Divergence verdict: `dep cycle`

**Justified, correctly scoped, adequately documented and ticketed. I confirmed the bash bug myself.**

For `a→b, b→c, c→b`, bash prints:

```
Cycle 1: c -> b -> c      (real)
Cycle 2: a -> b           (NOT a cycle; and it lists only member "a")
```

and for two disjoint 2-cycles plus a bridge node `z → a, c` it invents `Cycle 3: z -> a`. Root cause
(`ticket:652-676`): on a back edge `dfs` returns the cycle string and every caller returns
immediately **without** setting `state[node]=2`, so the whole path stays gray forever; a later root
walking into a gray node reports `state==1` and the extraction loop never finds that node in `path`,
so it prepends the entire path. The same early return aborts the DFS, so other cycles are missed.

Scoping is clean: the only BDD dep-cycle scenario (`features/nested_folders.feature:162-171`) is a
real 2-cycle asserting `contains "Cycle 1:"`, which the TS algorithm also satisfies; no scenario
encodes the buggy output. `nid_fba92yfczp71jjcprn4ufmory_e` (deps: T4, `type: bug`, `priority: 1`)
requires the new scenarios at cutover. Divergence 6 (`dep tree` root resolution gaining an exact tier)
is likewise a strict improvement on an error path with no BDD coverage.

## 🚨 CRITICAL Issues

None. No security exposure (no injection surface: `execFileSync("git", [...])` with a fixed argv, no
shell, no secrets, no deserialization). No use case or anchor point removed. No swallowed errors on a
critical path — the three `catch {}` blocks in `ticket-store.ts` are each narrowly scoped to
"answer false / undefined for a stat/realpath that cannot be resolved", matching `find -L`.

## ⚠️ SHOULD-FIX

### SF-1 — `TicketStore.save` lost bash's atomic write (`src/core/ticket-store.ts:101`)

```ts
save(ticket: Ticket): void {
    writeFileSync(ticket.path, ticket.text(), FILE_ENCODING);
}
```

bash never does this. Every mutation goes through `_sed_i` (`ticket:58-63`):
`sed … "$file" > "${file}.tmp.$$" && mv "$tmp" "$file"` — i.e. **write-then-rename**.

Failure scenario: `tk close <id>` on a full disk, or the process killed mid-write, truncates the
ticket instead of leaving it intact; a concurrent `tk ls` can read a half-written file. bash is safe
against both. This is a durability regression in the exact module that owns writing, and it is
invisible today only because no command is flipped yet — it becomes real the moment T4/T5 lands.

Fix (small): write to a sibling temp then `renameSync`. **Keep bash's property that the temp name does
not end in `.md`** (bash uses `${file}.tmp.$$`), otherwise a crash leaves a stray file that
`collectFiles()` would report as a ticket.

### SF-2 — `TicketDocument.text()` byte-exactness claim is false for an unterminated block (`src/core/frontmatter.ts:187, 236`)

The doc says "Byte-identical to the input when nothing was changed." Measured:

```
in  "---\nid: x\nstatus: open"     out "---\nid: x\nstatus: open\n---"
in  "---\nid: x\nstatus: open\n"   out "---\nid: x\nstatus: open\n\n---"   <-- also injects a blank line
```

`parse` maps a missing closing marker to `blockEnd = lines.length`, and `text()` unconditionally
re-emits a closing `---`. Failure scenario: `tk status <id> in_progress` on a hand-edited ticket whose
frontmatter lost its terminator silently restructures the file (and adds a stray blank line inside the
block), where bash's `sed` would only rewrite the one field. Adding the missing terminator may well be
the behavior you want — but then it is an intentional repair, not a byte-exact round trip. Either
preserve the unterminated state, or keep the repair, fix the blank-line artifact, correct both doc
comments, add it to the divergence list, and pin it with a test. Right now naming does not match
behavior (POLS / EARN_TRUST).

### SF-3 — three more real divergences are missing from the divergence list

The write-up lists 7; I found 3 more. All are strict improvements over bash, so the ask is honesty
and completeness of the list, not code changes:

1. **Empty ID resolution** (`src/core/id.ts:72-78`) — a *behavior* change on a path users hit, in the
   same class the write-up flagged as needing review for divergence 6. Verified live: with exactly
   ONE ticket present, bash `tk show ""` **succeeds and shows that ticket** (gawk `index(s,"")==1`);
   with more than one it reports "ambiguous". TS returns `not-found`. Failure scenario: a script doing
   `tk close "$MAYBE_UNSET"` against a single-ticket repo closes the ticket under bash and errors
   under TS. TS is clearly the better behavior — but this belongs in the list (and arguably in the
   T4 ticket's acceptance criteria) rather than only in a `WHY guarded` code comment.
   No BDD scenario covers it, so nothing breaks.
2. **Colon-less letter-initial frontmatter line** — bash emits `"colonless line here":""` and counts
   it toward `field_count`; TS drops it, which can also flip `hasFrontmatterFields` (i.e. `query`
   emits a line where TS emits none). Same family as documented divergences 2/3.
3. **Duplicate frontmatter key** — bash emits both (`"status":"open","status":"closed"`); TS collapses
   to last-wins at the first key position. Relatedly, `withField`/`withoutField` touch only the FIRST
   occurrence while bash `s/^k:.*/…/` and `/^k:/d` hit **all** of them. Worth one line in the
   `Frontmatter` doc so a future reader does not assume set-semantics parity.

## 💡 Suggestions (NICE-TO-HAVE)

- `test/ticket-store.test.ts:159` — "terminates on a symlink loop" asserts only `length > 0`. The
  property under test is termination; consider asserting the exact expected file list so a future
  change to the ancestor-set logic (e.g. someone "simplifying" it to a global visited set, which the
  code comment explicitly warns against) actually fails a test.
- `test/ticket-store.test.ts:206` — `TicketsDirectory.resolve({}, tmpdir())` expecting `no-git-repo`
  depends on `/tmp` not being inside a git repo. Cheap hardening: create the dir under a
  `mkdtempSync` root you control and assert on that, or skip if `git rev-parse` succeeds there.
- `src/core/frontmatter.ts:232` — `withBodyAppended`'s comment says "keeping exactly one trailing
  newline"; the implementation just concatenates. Drop or correct the comment.
- `src/core/id.ts:32` `TicketId.isWellFormed` has no production caller and is used only by its own
  test. Either use it (e.g. validating `--id` input in T4/T5) or drop it; unlike the other
  no-caller-yet API items listed in the write-up, this one has no named consumer.
- `src/core/dep-graph.ts` — `CycleFinder.visit`, `TreeLayout.measureDepths` and
  `measureSubtreeDepths` are recursive; bash used explicit stacks. Fine for real ticket sets, but a
  pathological chain could blow the JS stack where bash would not. Not worth fixing now; worth
  knowing.
- `TicketOrder.comparePriority` uses `Number()`, which accepts forms awk's strnum does not
  (`0x1F` → 31 in JS, a string in awk). Unreachable in practice; no action.
- Parity today rests on a harness that lives only in `.ai_out/`. Ticket
  `nid_mgfn04pyn3byxj72xxq0mggw5_e` correctly owns promoting it — please keep it ahead of T4 in
  practice, since it is the only thing that would catch a `dep tree` ordering regression before
  cutover (the in-repo tree tests are TS-vs-TS).

## Documentation Updates Needed

- CLAUDE.md diff is accurate against the code (module map, `make unit-test`, no-vitest rule). No
  correction needed.
- CHANGELOG.md correctly untouched (nothing user-facing changed). The write-up's observation that
  `[Unreleased]` has two `### Changed` headings is real — fold it in on the next CHANGELOG edit.
- Divergence list: add SF-3's three items; fix the two `TicketDocument` doc comments per SF-2.

## Verdict

**NOT-READY as-is; READY once SF-1 and SF-2 are addressed** (both are small and both live in files
this ticket owns). SF-3 is a documentation-completeness ask that should land in the same pass.
Everything else is optional.

No `#QUESTION_FOR_HUMAN` from me on the `dep cycle` divergence — I reproduced the bash bug
independently and it is a clear bug with zero BDD blast radius. The one item a human may want to
confirm is SF-3.1 (empty-ID resolution now failing where bash could succeed), which is the same
category of intentional error-path change the implementer already flagged as divergence 6.

---

# Round 1 re-review — commit `38ea6b0` (sign-off pass)

Both gating findings are genuinely fixed, not papered over. I re-ran everything and
re-measured the two behaviors I originally caught. **READY.**

## Test results (I re-ran these; they match the implementer's claim exactly)

| Command | Result |
|---|---|
| `npx tsc --noEmit` | exit 0, clean |
| `npm test` / `make unit-test` | **167 tests, 24 suites, 167 pass, 0 fail, 0 skipped** (was 154) |
| `make test` | **12 features, 180 scenarios, 1205 steps, 0 failed**, exit 0 |

## Nothing regressed elsewhere

`git diff --stat cd5b657..38ea6b0 -- ticket features/ CHANGELOG.md` → **empty**.
`TS_COMMANDS="help --help -h"` unchanged (`ticket:1572`). The diff touches only
`src/core/{frontmatter,id,ticket-store}.ts`, the three matching test files, `_tickets/*` and
`.ai_out/*`. No new files, no new dependencies, no build/make changes.

## SF-1 (atomic save) — VERIFIED FIXED

`save()` writes `${ticket.path}.tmp.${process.pid}` then `renameSync`. Checked each thing
you asked about:

- **Scratch naming**: same construction as bash `${file}.tmp.$$` (`ticket:61`) and it does
  **not** end in `.md`, so a crash between write and rename leaves a file `collectFiles`
  will not report as a ticket. A named constant plus a doc comment state exactly that, and
  the test mirrors the suffix.
- **Failure path**: `catch { discardScratch(tempPath); throw error; }` — the ORIGINAL error
  propagates. `discardScratch`'s own `catch {}` cannot mask it, and the doc comment says so.
- **Test strength**: the failure-injection test squats a *directory* on the scratch path, so
  the write really fails, then asserts the previous content is still readable and no extra
  `.md` appeared. That fails against the old truncating `writeFileSync`.
- Symlinked ticket files behave as bash does (both replace the link with a regular file).

Non-blocking observation: `rmSync(path, { force: true, recursive: true })` — `recursive` is
broader than a scratch *file* needs and would delete a directory `save` did not create. The
test still passes without it. Worth dropping next time the file is touched; not worth a
round trip now.

## SF-2 (unterminated frontmatter) — VERIFIED FIXED, and preserve is the right choice

I re-measured with my own harness rather than trusting the tests. Byte-exact round trip now
holds for **all** shapes, including one the tests do not cover (prologue + unterminated):

```
"---\nid: x\nstatus: open"            -> identical
"---\nid: x\nstatus: open\n"          -> identical   (no more injected blank line + ---)
"prologue\n---\nid: x\nstatus: open"  -> identical
"---\nid: x\n---\nbody\n"             -> identical
"no frontmatter\n"                    -> identical
```

Field edit on an unterminated block → `"---\nid: x\nstatus: closed\n"`, i.e. no
restructuring. **Preserve-not-repair is correct**: bash's `sed` rewrites one line and never
adds a terminator, so preserving is the parity-faithful option *and* the least surprising —
a tool asked to change one field should not rewrite the file's structure. The `BlockShape`
union makes the three cases explicit at the type level, which is better than the boolean it
replaced. The new tests pin the exact two inputs I originally measured, so reverting the fix
fails them.

Non-blocking, T5-relevant: `withBodyAppended` routes through `TicketDocument.of`, which
hardcodes `"terminated"`, so appending to an unterminated doc still restructures it —
`"---\nid: x\nstatus: open\n\n---\n\n## Note\n"`, where bash `add-note` would append with no
injected `---`. That slightly overreaches the new class-doc claim ("a malformed file is
edited, never silently repaired"). Only reachable once T5 ports `add-note`; flagging so T5
either preserves the shape or lists it as divergence 11.

## SF-3 (divergence list, now 10) — spot-checks accurate

I re-verified two entries I had not personally surfaced in round 0:

- **Divergence 4** (`deps: [a, , b]`): real `_file_to_jsonl` emits `{"deps":["a",,"b"]}` —
  invalid JSON; core emits `["a","b"]`. **Listed accurately.**
- **Divergence 3** (`id:foo`, no space): `substr($0,5)` of `id:foo` is `oo` in `ticket_path`,
  while the separate `_file_to_jsonl` path yields the key `"id:foo"` (divergence 2). The two
  bash code paths are correctly listed as two separate entries. **Listed accurately.**

Divergences 8 and 9 are the ones I surfaced; both now carry code docs and tests. Deleting
`TicketId.isWellFormed` and replacing its test with `assert.match(/^nid_[a-z0-9]{25}_e$/)`
plus an alphabet-coverage test keeps the shape pinned without dead API — a better outcome
than what I asked for.

I also note, in the implementer's favour, that the disposition table self-corrects its own
round-0 error (it had claimed the empty-search guard "matched bash"; `awk index(s,"")` is 1,
not 0) and labels it plainly instead of quietly editing it. That materially raises my
confidence in the rest of the write-up.

## Empty-ID: deferring to a human at cutover is the RIGHT call

Keeping the TS behavior and raising `decide` ticket `nid_5g3eta9cf7yi6iukmscxma6wc_e` is
correct, and the ticket is well built (both id-resolution divergences, the live evidence, a
per-decision acceptance criterion, `decide` tag, `priority: 1`, and the ticket ID is named
in the `src/core/id.ts` comment). Deferring is right because **nothing user-visible has
changed**: no command is flipped, so there is no behavior to decide about until T3/T4/T5.
Settling it now would mean blocking a zero-user-impact library commit on a human round trip.
I also agree with the recommendation itself — bash letting `tk close "$UNSET_VAR"` mutate the
sole ticket in a repo is a bug, not a contract worth porting.

**One follow-through (not a gate on T2):** the decide ticket is not in the `deps` of T3/T4/T5
(T3=[T2], T4=[T2, harness], T5=[T2, T4]), so the "confirm before flipping" gate exists in
prose but not in structure — exactly the weakness the implementer correctly *fixed* for S-7
by making the harness dependency structural. Adding `nid_5g3eta9cf7yi6iukmscxma6wc_e` to T4
and T5 `deps` is a one-line frontmatter edit and would close the loop.

## The two rejections — both ACCEPTED on the merits

- **S-5 (recursion → explicit stack machine): accept the rejection.** Recursion depth is
  bounded by dependency-chain length; a chain deep enough to exhaust the JS stack is not a
  real ticket graph, and converting three readable recursions into bash-shaped stack
  machines would spend exactly the readability this port exists to buy. I flagged it as
  "not worth fixing now" and stand by that.
- **S-6 (`Number()` accepts strnum forms awk does not, e.g. `0x1F`): accept the rejection.**
  Unreachable — priority is 0–4 and written by `create`. Hand-rolling a numeric parser for
  an input no user produces is anti-KISS. I marked it "no action" in round 0.

Both rejections represent my round-0 position accurately. **No disagreement; nothing to
escalate.**

## Verdict

**READY.** No BLOCKING and no SHOULD-FIX items remain. Both gating findings are fixed with
regression tests that genuinely fail against the old code, verified independently by me;
tsc clean; 167/167 unit; 180 scenarios / 1205 steps green; `ticket`, `features/`,
`CHANGELOG.md` and `TS_COMMANDS` untouched. Sign-off granted.

Carry-forwards for the coordinator (none block this ticket):
1. Add `nid_5g3eta9cf7yi6iukmscxma6wc_e` to T4 and T5 `deps` so the human ID-resolution
   decision structurally gates the cutover.
2. T5: `withBodyAppended` restructures an unterminated block — preserve the shape or list it
   as divergence 11.
3. Whenever `ticket-store.ts` is next touched: drop `recursive: true` from `discardScratch`.

No `#QUESTION_FOR_HUMAN` from me. The one human decision this ticket produces
(ID-resolution error paths, divergences 6 and 10) is correctly captured as a `decide`-tagged
ticket rather than blocking T2.
