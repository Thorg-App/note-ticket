# IMPLEMENTATION_REVIEWER — private rehydration memory (T2 core data-model)

Review target: commit `cd5b657` on branch `CC_nid_ropjwdm792a5qqyu2u0zeuna1_e__...`.
Review round: 1. Verdict written to `IMPLEMENTATION_REVIEW__PUBLIC.md`.

## Commands actually run (outputs in ./.tmp/)

| Command | Result | Log |
|---|---|---|
| `npx tsc --noEmit` | exit 0, clean | `.tmp/rev_tsc.txt` |
| `npm test` | 154 tests / 23 suites / **154 pass, 0 fail**, exit 0 | `.tmp/rev_npmtest.txt` |
| `make test` | build + unit + behave: **12 features, 180 scenarios, 1205 steps, 0 failed**, exit 0 | `.tmp/rev_maketest.txt` |
| `sanity_check.sh` | does not exist in this repo | — |

## HARD RULE (zero CLI knowledge)
`grep -rn "process\.argv|console\.|process\.exit|stdout|stderr|process\.env" src/core/` → exactly ONE hit:
`src/core/ticket-store.ts:25` `resolve(env = process.env, cwd = process.cwd())` — injectable defaults, tests
pass `{}` explicitly. Judged compliant (data-source resolution, not CLI). No console, no argv, no exit.

## Parity work I did MYSELF (not taken on faith)

Scratch helpers I wrote (kept): `.tmp/rev_parity.ts|.mjs` (collectFiles + slug),
`.tmp/rev_jsonl.ts|.mjs` (toJsonRecord), `.tmp/rev_rt.ts|.mjs` (round trip),
`.tmp/rev_slug.sh` (verbatim copy of bash `title_to_filename` lines 80-88),
`.tmp/rev_fj.sh` (`sed -n '219,271p' ticket` + call = real `_file_to_jsonl`).
Throwaway dirs under the session scratchpad (`revbohJ`, `revsym`, `revemp`).

1. **`dep cycle` bash bug — CONFIRMED independently.** Graph a->b, b->c, c->b: bash prints
   `Cycle 1: c -> b -> c` (real) AND `Cycle 2: a -> b` (NOT a cycle, single member listed).
   Second repro: two disjoint 2-cycles + bridge `z -> a, c` → bash prints a bogus `Cycle 3: z -> a`.
   Root cause read in `ticket:652-676`: on a back edge `dfs` returns the cycle string and every
   caller returns immediately WITHOUT setting `state[node]=2`, leaving the whole path gray forever;
   a later root walking into a gray node hits `state==1` and the extraction loop never finds the
   node in `path`, so it prepends the entire path. Also aborts → misses other cycles.
   TS `CycleFinder` is correct. **Divergence justified.**
2. **BDD blast radius of that divergence: none.** Only dep-cycle scenario is
   `features/nested_folders.feature:162-171` (a real 2-cycle, asserts `contains "Cycle 1:"`). No
   scenario pins bogus output or a "no cycles" case. Verified by grep.
3. **Byte-wise discovery order — CONFIRMED.** Built a tree with `a\xEF\xBF\xBD.md` (U+FFFD) and
   `a\xF0\x90\x80\x80.md` (U+10000), `.hidden/visible/h.md`, `.dotfile.md`, `sub/s.md`. bash
   `find -L … -name '.*' -type d -prune … | LC_ALL=C sort -z` and `TicketStore.collectFiles()`
   produced **identical** lists including U+FFFD before the astral char (naive JS sort reverses it).
4. **Symlinks — CONFIRMED.** real/inner.md + linked-dir→real + linked.md + dangling + loop
   (real/loop→root): same file SET as bash. Difference: bash prints "File system loop detected"
   diagnostics on stderr, TS is silent. Trivial.
5. **Slug — CONFIRMED** for 11 titles vs the real bash pipeline, incl. `İstanbul`→`stanbul`,
   `ǅuvo`→`uvo`, `ẛ`→`untitled`, tabs stripped (not hyphenated), 195+space+8 truncation. All OK.
6. **JSONL — CONFIRMED byte-exact** for quote+backslash title, `"Colon: inside"`, `deps: [a, b]`,
   `assignee: John Doe`, `tags: []` against real `_file_to_jsonl`.

## Divergences I found that the implementer did NOT list (all verified)

- **Empty-ID resolution (behavior change, error path).** bash `tk show ""` with exactly ONE ticket
  SUCCEEDS (gawk `index(s,"")==1`); with >1 it says "ambiguous". TS `IdResolver.resolve("")` →
  `not-found`. Verified live. TS is better; undeclared. No BDD scenario covers it.
- **Colon-less letter-initial frontmatter line.** bash emits `"colonless line here":""`; TS drops
  the line (and therefore also `hasFrontmatterFields` can flip). Same family as documented
  divergence 2/3 (malformed input, bash emits garbage).
- **Duplicate frontmatter key.** bash emits `"status":"open","status":"closed"` (both);
  TS collapses last-wins at the FIRST position. Also `withField`/`withoutField` touch only the
  first occurrence whereas bash sed `s/^k:.*/` and `/^k:/d` hit ALL occurrences.
- **Unterminated frontmatter block is NOT round-tripped.** `TicketDocument.parse("---\nid: x\nstatus: open").text()`
  → adds `\n---`; with a trailing newline it adds a blank line then `---`. Contradicts the explicit
  doc claim on `frontmatter.ts:236` / class doc line 187.

## Other real findings
- `TicketStore.save` (`ticket-store.ts:101`) = plain `writeFileSync` truncating in place. bash
  `_sed_i` (`ticket:58-63`) writes `${file}.tmp.$$` then `mv` = atomic. Durability regression on the
  write path; matters at T4/T5.
- Note for the fix: bash's temp name is `*.md.tmp.$$` which does NOT end in `.md`, so it is invisible
  to `_collect_ticket_files`. Any TS temp file must keep that property.

## Parity checks I did NOT redo (accepted from the implementer's harness)
`dep tree` / `dep tree --full` sibling ordering over 128 generated graphs. I read both algorithms
side by side instead (`ticket:482-615` vs `TreeLayout`) and agree they correspond, including the
snapshot-before-recurse in `measureSubtreeDepths` (= bash pushing all `!(child in subtree_depth)`
children at once, `ticket:522-530`) and the bug-for-bug connector behavior (a `└──` can land on a
row that is then skipped, leaving the visually-last row with `├──`).

## Verdicts
- Tests: genuinely behavior-capturing, no tautologies found. Weakest: "terminates on a symlink loop"
  asserts only `length > 0`; `TicketsDirectory.resolve({}, tmpdir())` expecting `no-git-repo` is
  environment-dependent.
- Design: SRP/DRY/immutability/strict typing all good. `TicketId.isWellFormed` is test-only.
- Docs: CLAUDE.md diff is accurate. CHANGELOG correctly untouched. Both follow-up tickets exist,
  are well written, tagged `ts-port`, with correct `deps`.
- Overall: READY once SF-1 (atomic save) and SF-2 (unterminated-block honesty) are handled;
  everything else is NICE-TO-HAVE.

---

# Round 1 re-review (commit `38ea6b0` on top of `cd5b657`) — SIGNED OFF READY

## Commands re-run by me
- `npx tsc --noEmit` → exit 0 clean (`.tmp/rev2_tsc.txt`)
- `make test` → `ℹ tests 167 / suites 24 / pass 167 / fail 0 / skipped 0`, then
  `12 features passed, 180 scenarios passed, 1205 steps passed, 0 failed`, exit 0
  (`.tmp/rev2_maketest.txt`). **Matches the implementer's claim exactly.**
- `git diff --stat cd5b657..38ea6b0 -- ticket features/ CHANGELOG.md` → EMPTY (untouched).
- `grep -n '^TS_COMMANDS' ticket` → `TS_COMMANDS="help --help -h"` unchanged.
- Diff touches only `src/core/{frontmatter,id,ticket-store}.ts`,
  `test/{frontmatter,id,ticket-store}.test.ts`, `_tickets/*`, `.ai_out/*`. No new deps.

## SF-1 verdict: genuinely fixed
`save()` = `writeFileSync(tempPath)` → `renameSync(tempPath, ticket.path)`, temp =
`${ticket.path}.tmp.${process.pid}` — same construction as bash `${file}.tmp.$$`
(`ticket:61`) and does NOT end in `.md`, so `collectFiles` cannot pick up a crash leftover.
`catch` calls `discardScratch` then `throw error` → original error reaches the caller;
`discardScratch`'s own `catch {}` cannot mask it. Failure-injection test (a directory
squatting the scratch path) asserts old content still readable + no extra `.md`. Real test,
would fail against the old truncating write. Symlinked-ticket behavior matches bash (both
replace the symlink with a regular file on rename/mv).
Residual nit (NOT raised as a fix): `rmSync(path, {force:true, recursive:true})` — the
`recursive` is broader than a scratch *file* needs and would delete a directory `save` did
not create. Test passes without it. Non-blocking, mentioned in PUBLIC as an observation.

## SF-2 verdict: genuinely fixed; preserve-not-repair is the right choice
`BlockShape = "none" | "unterminated" | "terminated"`. Measured myself (`.tmp/rev2_rt.ts`):
byte-exact round trip for `"---\nid: x\nstatus: open"`, the trailing-newline variant,
`"no frontmatter\n"`, a normal terminated doc, AND `"prologue\n---\nid: x\nstatus: open"`.
Field edit on an unterminated block → `"---\nid: x\nstatus: closed\n"` (no restructure), which
is exactly what bash `sed 's/^status:.*/…/'` would produce. New tests assert the exact two
inputs I originally measured → they fail if the fix is reverted. Preserve is correct: bash
is line-oriented and never adds a terminator.
Residual (non-blocking, T5-relevant): `withBodyAppended` routes through `TicketDocument.of`,
which hardcodes `"terminated"`, so appending to an unterminated doc DOES restructure:
`"---\nid: x\nstatus: open\n\n---\n\n## Note\n"` where bash `add-note` would append with no
injected `---`. Slightly overreaches the new class doc ("never silently repaired").
Malformed-input-only, unreachable until T5 ports `add-note`.

## SF-3 verdict: incorporated and accurate
List is now 10. Spot-checked two entries I had not personally surfaced:
- **Divergence 4** (`deps: [a, , b]`): bash → `{"deps":["a",,"b"]}` (invalid JSON), TS → `["a","b"]`. **Accurate.**
- **Divergence 3** (`id:foo` no space): `substr($0,5)` of `id:foo` = `oo` in `ticket_path`;
  the `_file_to_jsonl` path separately yields the key `"id:foo"` (= divergence 2). Both
  listed as separate entries for separate bash code paths. **Accurate.**
Divergences 8/9 are the ones I surfaced; verified in round 0. `isWellFormed` deleted and
replaced by `assert.match(/^nid_[a-z0-9]{25}_e$/)` + an alphabet-coverage test — shape still
pinned, no dead API.

## Empty-ID deferral (item 3): deferring is the RIGHT call, with one gap
Right call because: nothing user-visible has changed (no command flipped, `TS_COMMANDS`
untouched), so there is no live behavior to decide about yet; the ticket
`nid_5g3eta9cf7yi6iukmscxma6wc_e` is `decide`-tagged, `priority: 1`, states both decisions
with the live evidence and a per-decision acceptance criterion, and `src/core/id.ts` names
the ticket ID in the code comment. Forcing a human round-trip now would block a
zero-user-impact library commit.
GAP: the decide ticket is NOT in the `deps` of T3/T4/T5 (T3 deps=[T2], T4=[T2, harness],
T5=[T2, T4]), even though its body says a human must confirm "before T3/T4/T5 flip". The
gate is prose, not structure — contrast S-7, which the implementer correctly MADE structural.
One-line frontmatter fix. Flagged in PUBLIC as follow-through, not a gate on T2.

## Rejections (item 4): both ACCEPTED, no disagreement
- **S-5 recursion→stack machine**: accept. Depth is bounded by dependency-chain length;
  ~10⁴ frames is not a real ticket graph, and three readable recursions are worth more than
  bash-shaped stack machines. The table quotes my position ("not worth fixing now") accurately.
- **S-6 `Number()` strnum edge (`0x1F`)**: accept. I wrote "no action" in round 0. Unreachable.
No convergence problem — nothing to escalate to the human on these.

## Honesty note (positive)
The disposition table self-corrects the implementer's own round-0 error (it had claimed the
empty-search guard "matched bash"; `awk index(s,"")` is 1, not 0) and labels it plainly.
That is the EARN_TRUST behavior I want to see and it raises my confidence in the rest of
the write-up.

## Final: READY. No BLOCKING items. Two non-blocking observations + one ticket-deps
follow-through recorded in PUBLIC.
