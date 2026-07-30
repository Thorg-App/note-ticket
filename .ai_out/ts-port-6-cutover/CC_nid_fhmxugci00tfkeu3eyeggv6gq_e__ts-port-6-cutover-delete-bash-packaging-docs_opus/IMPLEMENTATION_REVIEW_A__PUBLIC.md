# IMPLEMENTATION REVIEW — PHASE_A (`42ccf92`), ticket `nid_fhmxugci00tfkeu3eyeggv6gq_e`

Reviewer: IMPLEMENTATION_REVIEWER. Read-only for code; all mutations below were reverted and
`git status` is clean.

## Summary

The cutover is real and the quality is high. `./ticket` is 82 lines of launcher with zero
ticket logic, all bash implementation and both delegation lists are gone, `scripts/parity/`
is deleted per its own "Lifetime" list, the Makefile target / npm script / gitignore entry /
CI step went with it, and no code or CI file still references the harness (`git grep -in
parity` leaves hits only in `CLAUDE.md`, `docs-internal/`, `CHANGELOG.md`, all explicitly
PHASE_B). `git grep -nE 'cmd_[a-z_]+\(\)'` outside the `.ai_out`/`_change_log`/`_tickets`
archives: none.

Verified myself, not taken on faith:

- `make test` — 13 features, **257 scenarios**, 1708 steps, 0 failed. `npm test` — 427 unit
  tests, 0 failed. `make typecheck` clean. No `sanity_check.sh` in this repo.
- **Mutation spot-checks (4 of the 8 claimed), each reverted:**
  | Claimed | I ran | Result |
  |---|---|---|
  | M1 `_bundle_is_stale` ignores `find` | `return 1` in place of the `find` test | RED, and ONLY `ticket_wrapper.feature:17 A bundle older than the sources is rebuilt` |
  | M2 launcher chatter to stdout | `_log` without `>&2`, build subshell without `>&2` | RED, and ONLY `ticket_wrapper.feature:6 A missing bundle is built on the first invocation` |
  | M4 `BrokenPipe` does not set the exit code | dropped `process.exitCode = ExitCode.BROKEN_PIPE` | RED, and ONLY `ticket_listing.feature:375 A large listing into a short reader exits 141` |
  | M7 `topLevelFileExists` back to file-only semantics | `statSync(...).isFile()` | RED, and ONLY `create-command.test.ts "suffixes the filename when the slug is taken by a DIRECTORY"` (EISDIR) |
  The mutation table is credible. These are genuinely discriminating tests, not enumeration
  accidents.
- **Cold start, empirically** (fresh copy: wrapper + manifests + `src/` only; no `dist/`, no
  `node_modules/`; `tk` a symlink from a separate bin dir; real `git init`ed repo):
  `tk create` → rc 0, stdout is the JSON line **byte-clean under `od -c`**, all `npm install`
  + esbuild chatter on stderr. `tk query | jq -c .` → clean JSON, rc 0. `tk ls | head -1`
  clean. `printf 'note\n' | tk add-note <id>` on a **cold** tree recorded the piped note
  correctly — the build subprocesses do not eat the caller's stdin. `tk` with no args → help,
  rc 0, program name `tk` resolved from the symlink. Second run: no rebuild, stderr empty.
- **Staleness edges:** a DELETED source file with realistic mtimes IS caught (the parent
  directory's mtime moves) — I confirmed the rebuild fires and the resulting esbuild failure
  exits 1 with `Error: failed to build [...]` on stderr and nothing on stdout. A source file
  with a FUTURE mtime makes the wrapper rebuild on **every** invocation, forever (confirmed).

The one thing the report gets wrong is the completeness claim on the divergence folding; see
BLOCKING below.

---

## 🚨 BLOCKING

### B1. Divergence #7 was folded only HALF-way, and the report states otherwise

The whitelist entry #7 names **two** pins: `check_graph._check_broken_pipe_exit_code`
(`tk ls | head -1`) **and** `check_query._check_query_broken_pipe` — "the `jq` case, where
the child really is signalled and both sides say 141".

Only the `ls` half was folded. `features/ticket_listing.feature` gained the two `ls | head -1`
scenarios (large ⇒ 141, small ⇒ 0), and `git grep 'piped into'` over `features/` returns
**those two lines and nothing else**. There is no `tk query '<filter>' | head -1` scenario.

That second half is a *different code path*: it is not `BrokenPipe`'s EPIPE listener, it is
`ChildExit.toExitCode()` adopting a spawned child's death as `128 + signal`
(`src/cli/child-exit.ts:29`, `src/cli/spawned-child.ts`). What backs it today is
`test/list-commands.test.ts:432`:

```ts
assert.equal(ExitCode.forSignal("SIGPIPE"), 141);
assert.equal(ExitCode.BROKEN_PIPE, 141);
```

— a constant assertion that never spawns anything. That is precisely the shape the report
itself (correctly) called "was unpinned end to end" when justifying the new `ls` scenarios.
Deleting the harness therefore removed the only end-to-end check that a signalled `jq` child
surfaces as 141 rather than 1 or 0, and the report's line "**Nothing in the whitelist is now
unpinned**" is not accurate.

**Fix (small):** one scenario, reusing the machinery already added in this commit —

```gherkin
  Scenario: A large filtered query into a short reader adopts jq's signal death
    Given 3000 tickets exist
    When I run "ticket query '.id'" piped into "head -1"
    Then the exit code should be 141
```

and prove it non-vacuous by mutating `ChildExit.toExitCode` to ignore `outcome.signal`.
Then correct the folding table's #7 row. (This step is exactly the check the harness's
`check_query` performed; the deletion should not land without it.)

---

## ⚠️ IMPORTANT (should fix)

### I1. Requirement 1's `npm`-missing and build-failure arms are untested

Requirement: "Missing `node`/`npm` or a failed build → non-zero with a clear message, never a
partial/garbled run." `ticket_wrapper.feature` covers **only** the `node` arm. I verified
both other arms behave correctly by hand (build failure ⇒ rc 1, `Error: failed to build
[...]; run 'npm install && npm run build' in [...]` on stderr, stdout empty, and the stale
bundle is NOT exec'd), but nothing pins them.

The `_path_without` step already generalizes (`with (?P<binary>[a-z]+) missing from PATH`), so
the npm arm is one scenario on an isolated copy with no bundle:

```gherkin
  Scenario: A missing npm is reported when a build is needed
    Given an isolated copy of the tool with no built bundle
    When I run "ticket help" with npm missing from PATH
    Then the command should fail
    And stderr should contain "npm is required but is not on PATH"
    And the output should be empty
```

A build-failure scenario (corrupt one file in the isolated copy's `src/`) is equally cheap and
pins the "must not reach `exec`" guard on line 72, which is currently pure inspection.

### I2. Divergence #13's non-array-scalar sub-case is pinned nowhere

The whitelist says "A NON-array scalar value is normalized the same way — TS reads `deps: foo`
as the single element `foo` and writes `deps: [foo, <id>]`". `test/ticket-relations.test.ts`
has no fixture with a scalar `deps:`/`links:` value (every `ticketOf` fixture uses `[...]` or
omits the field), and no BDD scenario writes one. On the harness this was a `diverges=True`
case, i.e. one that by construction never pinned the TS side — exactly the class the audit was
supposed to catch and did not. Nothing was *lost* here (it was never pinned), but the folding
audit's job was to close these, and the report marks #13 "already pinned".

One unit test — `DEPENDENCY.withAdded(ticketOf(["deps: foo"]), ONE)` ⇒ `[foo, t-1]` — closes it.

### I3. The 14 code comments now point at a document that does not yet contain the whitelist

`src/` and `test/` comments were re-pointed from `scripts/parity/README.md` to
`docs-internal/migration-to-ts-high-level.md`, but the whitelist text has not landed there
yet. Between this commit and PHASE_B the repo ships 14 dangling documentation pointers, and
the only copy of the text is in git history. The report flags this as a PHASE_B action, which
is fair sequencing, but it should not be allowed to slip: if PHASE_B is deferred, the
divergence rationale becomes findable only via `git show 42ccf92^:scripts/parity/README.md`.

### I4. `make typecheck` runs AFTER `make test` in CI with no `if: !cancelled()`

The deleted parity step deliberately carried `if: ${{ !cancelled() }}` so one push reported
both signals. The new `Typecheck` step has no such guard and sits last, so any BDD failure
hides every type error. Either move it before `Run tests` (it is the fastest gate) or add
`if: ${{ !cancelled() }}`.

---

## 💡 Suggestions (non-blocking)

- **S1. A future-dated source file rebuilds forever.** Confirmed empirically: `touch -d 2035
  src/core/slug.ts` makes every subsequent `tk` invocation run a full `npm run build`, with a
  `ticket: building [...]` line on stderr each time. Reachable via a tarball with skewed
  mtimes or an NFS clock skew. Cheap mitigation if you care: `touch "$BUNDLE"` after a
  successful build only moves the goalposts; a stamp file recording the newest source mtime
  seen would be the real fix. 80/20 says leave it — but it is worth a comment on
  `_bundle_is_stale` so the next maintainer does not rediscover it under a deadline.

- **S2. The `[[ -d "$SOURCE_DIR" ]] || return 1` arm is unreachable and silently permanent.**
  Distribution is build-from-source, so `src/` is always present. As written, a checkout that
  *loses* `src/` degrades silently into "the bundle can never be stale" rather than saying so.
  Either delete the arm (KISS — one fewer state) or keep it and note in the comment that it is
  a deliberate escape hatch, not a supported install shape.

- **S3. The launcher's build subshell inherits the caller's stdin.** I confirmed a cold
  `printf 'note' | tk add-note <id>` works today, so this is theoretical — but `npm`'s stdin
  behavior is not a contract you own. `( ... ) >&2 </dev/null` costs nothing and removes the
  class.

- **S4. BDD isolation is sound but rests on an unstated precondition.**
  `_isolated_tool_copy` symlinks `node_modules` into the developer's tree. If it is ever
  absent (`behave` run directly, without `make test`), the wrapper's `npm install` inside the
  copy would write **through** that symlink into the developer's real `node_modules` —
  contradicting the "nothing mutated outside `.tmp/`" claim in the step-file comment. `make
  test`'s `build` prerequisite makes this latent, not live. Worth one sentence in the comment,
  or copy an empty `node_modules` marker. Separately, `context.tool_dir` is assigned only
  after `copytree` succeeds, so a failure mid-copy leaks a directory under `.tmp/`
  (gitignored — cosmetic).

- **S5. `TOOL_COPY_FILES` is now a de-facto packaging manifest** living in a test file, and
  PHASE_B will write the same list again in `pkg/`. Flagging the DRY risk now so PHASE_B makes
  one of the two the source of truth rather than letting them drift.

- **S6. The CI smoke test exercises only `tk help`**, the one command that needs no tickets
  directory. Adding `tk create` + `tk ls` in a scratch `git init` repo would also cover the
  git-based resolution on a cold box for the price of three lines. Optional.

---

## On the `#QUESTION_FOR_HUMAN` (unknown command vs. missing tickets dir)

**My independent opinion: dropping the quirk is right, and the implementer was right to stop
and ask rather than do it silently.**

Reasoning:

1. It is a misleading diagnostic. `tk bogus` outside a repo answering "tickets directory
   '…/_tickets' does not exist" tells the user about a resource the command was never going
   to touch, and never mentions the actual problem (the name is not a command). That is a
   POLS violation; reproducing it deliberately would be an un-improvement.
2. It was an artifact, not a decision. I read the deleted dispatch
   (`git show 42ccf92^:ticket`): `init_tickets_dir` ran in a `case` arm that excluded only
   `help|--help|-h`, so an unknown name fell into `*)` by default. The comment claiming it was
   "kept deliberately" was written during T5 to describe the shim's mechanics, and nothing —
   no BDD scenario, no unit test, not even a harness case — ever pinned it.
3. Blast radius is nil. No script can reasonably depend on the *wording* of the error for a
   command name that does not exist, and the exit code (1) is unchanged.

The new scenario `ticket_directory.feature` → "An unknown command is reported without needing
a tickets directory" pins the replacement and carries a comment naming it a BEHAVIOR CHANGE
from bash. That is the right shape. **It still needs the owner's explicit yes**, per the
project rule that behavior changes carry human sign-off — the whitelist's own convention was
to record an approval ticket id per changed behavior (#6/#8/#9/#10/#11/#12/#17 all have one),
and this one has none yet.

### Anything else silently changed?

I went looking specifically for unannounced changes and found **one improvement worth
recording, and no regressions**:

- **Symlink resolution is genuinely NEW behavior, not preserved behavior.** The old
  `_exec_ts` used `script_dir=$(cd -- "$(dirname -- "${BASH_SOURCE[0]}")" && pwd -P)`, which
  resolves symlinks in the *directory* but **not** a symlinked script FILE. So under the old
  shim, `ln -s /checkout/ticket ~/bin/tk` would have looked for `~/bin/dist/ticket.mjs` and
  failed. The new `_script_dir` readlink loop fixes that. The report presents this as a
  requirement met (it is), but it is also a behavior change relative to `42ccf92^` — worth a
  line in the PHASE_B CHANGELOG entry, because it is what makes symlink installs viable.
- **`TICKET_PAGER`/`PAGER` fallback:** the old script had a top-level
  `TICKET_PAGER="${TICKET_PAGER:-${PAGER:-}}"` before dispatch. That assignment was never
  exported, so it could not have reached node anyway, and `src/cli/pager.ts:37` already does
  `TICKET_PAGER || PAGER` itself. **No regression.**
- **No-args invocation:** the old dispatch defaulted to `help` via `"${1:-help}"`; the wrapper
  now passes an empty argv to node. I ran it — help, exit 0, program name from `$0`.
  **No regression.**
- New runtime requirements (`npm` on the build path, `find` on every path) are correctly
  called out in the report for PHASE_B packaging.

---

## Code quality (`ticket`, against CLAUDE.md)

Good, and I have no substantive complaint. Comments are WHY/WHY-NOT throughout
(build-on-demand rationale with the owner-decision date, why everything goes to stderr, why
the relative-link target resolves against the link's directory, why no locking). Log values
use the project's `[${value}]` bracket convention. `set -euo pipefail`, no unguarded
expansions, `--` before every user-influenced path argument. The "a build that 'succeeded'
without producing the bundle must not reach `exec`" guard is exactly the kind of paranoia this
file should have. SRP is fine at this size — `_build_bundle` doing install-then-build-then-
verify is one responsibility ("make a usable bundle exist"), not three.

Two micro-notes, deliberately not raised as issues: `_fail` exits 1, which is also the CLI's
own error code, so a script cannot distinguish "launcher could not start" from "ticket not
found" — I do not think that is worth a distinct code. And `cd -P -- "$(dirname …)"` inside
`_script_dir` would consult an exported `CDPATH`; every reachable `dirname` result here is
either absolute or `.`, both of which bypass `CDPATH`, so this is not a live bug.

---

## Requirements checklist

| # | Requirement | Verdict |
|---|---|---|
| 1 | Thin wrapper, symlink-resolving, build-on-demand, stderr-only, clear failures | **Met** (empirically verified cold + warm + failure paths). Test gap on the npm / build-failure arms → I1 |
| 2 | All other bash deleted | **Met** |
| 3 | Harness deleted per "Lifetime", divergences folded FIRST | **Partially met** — #7's `query`-through-`jq` half not folded (B1); #13's scalar sub-case still unpinned (I2) |
| 4 | BDD for build-on-demand + stale-bundle arms | **Met**, and non-vacuous (M1/M2 reproduced) |
| 5 | CI: BDD against the wrapper + cold-checkout packaged-install smoke test | **Met**; typecheck step placement → I4 |

## Verdict

**Approve after B1.** One blocking item (a genuinely lost end-to-end pin that the report
claims is covered), four should-fixes, six suggestions. Everything else — the launcher, the
deletion, the mutation evidence, the wrapper BDD isolation — holds up under adversarial
checking, and the `#QUESTION_FOR_HUMAN` was raised correctly and should be answered "yes,
drop it" with an approval id recorded.

---
---

# ROUND 2 — convergence verification (`0ef05a5`)

Same discipline as round 1: every claim below was re-derived by running it, not read off the
report. All mutations reverted; the only working-tree change I leave behind is this review
file itself.

Baseline re-run at `0ef05a5`: `make test` **261 scenarios / 1729 steps, 0 failed**; `npm test`
**429 unit tests, 0 failed**; `make typecheck` clean. The claimed numbers are real.

## 1. B1 — VERIFIED FIXED, and the new pin is uniquely discriminating

`features/ticket_query.feature:145` "A large filtered query into a short reader adopts jq's
signal death". I mutated `ChildExit.codeOf` to drop the signal branch entirely:

```ts
    static codeOf(outcome: ChildOutcome): number | undefined {
        if (outcome.status !== null) { return outcome.status; }
-       if (outcome.signal !== null) { return ExitCode.forSignal(outcome.signal); }
        return undefined;
    }
```

rebuilt, and ran the **whole** BDD suite (not just the one feature) to check for a second
killer or a vacuous pass:

```
Failing scenarios:
  features/ticket_query.feature:145  A large filtered query into a short reader adopts jq's signal death
260 scenarios passed, 1 failed
```

Exactly one scenario in 261 catches it. That is the strongest possible outcome: it proves both
that the new scenario is non-vacuous **and** that nothing else was covering this path, i.e.
the gap I reported was real and is now the only thing standing in it. B1 is closed.

The folding table was also genuinely corrected, not just claimed: rows **7a** (`BrokenPipe`'s
EPIPE listener) and **7b** (`ChildExit.codeOf`, "a different code path", annotated "missed in
the first pass; found by review") now exist as separate rows, and the "nothing unpinned"
sentence is rewritten in place rather than quietly deleted.

## 2. I2 / #13 scalar sub-case — VERIFIED, and the implementer found more than I asked for

I asked for the read side; it added the read **and** the write side. Mutation: make
`FrontmatterValue.parseArray` return `[]` for a non-array value (the plausible wrong
implementation) —

```
✖ reads a scalar value as a single-element relation
✖ re-serializes a scalar value as an array when adding to it
```

— those two and no others, out of 429. Both non-vacuous. The report also corrected row 13 of
the folding table from "already pinned" to naming the gap and who found it, which is the
honest bookkeeping this project's CLAUDE.md asks for.

## 3. Wrapper failure arms — three of three verified by mutation

I spot-checked all three rather than the one requested, since they are cheap:

| Mutation | Result |
|---|---|
| build failure falls through instead of `_fail`ing (`) >&2 </dev/null \|\| true`) | RED, ONLY `ticket_wrapper.feature:47 A failed build is reported and the stale bundle is not run` |
| `_require_command npm` removed from `_build_bundle` | RED, ONLY `ticket_wrapper.feature:38 A missing npm is reported when a build is needed` |
| `src/`-absent arm back to the silent `return 1` | RED, ONLY `ticket_wrapper.feature:57 A copy without sources is reported, not silently served` |

Each killed by exactly one scenario. I1 is closed. Note the build-failure scenario is doing
double duty well: because the fixture is a *stale marker bundle*, asserting empty stdout is
what proves the launcher did not silently fall back to the bundle it had just judged stale —
a stronger property than "it printed an error".

## 4. S2 rejection — the implementer is right; I withdraw the suggestion

My S2 offered two options and led with the wrong one. Deleting the `[[ -d "$SOURCE_DIR" ]]`
guard would send `find` at a nonexistent directory; I confirmed what that does:

```
$ find /definitely/not/here -newer /etc/hostname -print -quit
find: '/definitely/not/here': No such file or directory
find rc=1
```

Under `[[ -n "$(find …)" ]]` that is the worst of both worlds — a raw `find:` diagnostic
sprayed at the user's stderr **and** a "not stale" answer, i.e. the silent degradation I was
objecting to, with noise added. Converting the arm to a loud `_fail` keeps the guard where the
`find` needs it, states the real problem in the user's terms ("this is not a complete install
of the tool"), and turns an unreachable branch into a reachable, tested one. That is a better
answer than either option I gave. Dropped, not re-litigated.

Same for S1: leaving the future-mtime rebuild loop as a documented, named trade with the real
fix (a newest-mtime stamp) written down is exactly the 80/20 call I signalled.

## 5. PHASE_B hand-off — concrete enough to act on

Both deferred items pass the "can PHASE_B execute this without guessing?" test.

- **I3 (doc spec, "PHASE_B must pick up" item 2)** names the target file, the exact recovery
  command (`git show 42ccf92^:scripts/parity/README.md`, section "Whitelisted divergences"),
  the required section name, the constraint that the **numbering must be preserved** because
  comments cite `#3/#4/#8/#9/#11/#12/#13` by number, the preamble re-pointing each entry's
  now-dead "pinned by `check_*`" clause at §2 of the implementation report, the new **#20**,
  and the Distribution-section rewrite. It is also correctly labelled "the one blocking doc
  dependency". Nothing to guess.
- **S5 (install manifest, item 4)** names both artifacts (`TOOL_COPY_FILES` + `src/` vs
  `pkg/`), states the failure mode (drift), and offers two concrete resolutions with a
  preference. Deferring it was the right call — pre-solving packaging inside a test file would
  have been the wrong direction, exactly as the report says.

The residual risk on I3 is unchanged and is a scheduling risk, not a defect: until PHASE_B
lands, 14 code comments cite a document that does not yet carry the text. It is recorded in
two places now (the report and this review), which is as much as PHASE_A can do.

## 6. Anything new introduced by round 2?

I looked specifically for regressions in the round-2 diff and found none.

- `_bundle_is_stale` now calls `_fail` (which `exit`s) from inside an `if` condition. `exit`
  is not suppressed by the `if` context the way `set -e` is, so this terminates the script as
  intended — confirmed by the scenario (fails, message on stderr, stdout empty).
- The `assert (project / 'node_modules').is_dir()` added to `_isolated_tool_copy` closes S4's
  write-through hazard and names `make build` in its message; `context.tool_dir` is now
  registered before the copy, so a mid-copy failure is still cleaned up.
- CI: `Typecheck` moved ahead of `Run tests`. I said `!cancelled()` **or** reorder; reordering
  is the better of the two (fastest gate first, no second failing step to scroll past). The
  smoke step now also `git init`s a scratch repo and runs `create` + `ls` with a one-row
  assertion, covering the git-based resolution S6 asked for.
- `</dev/null` on the build subshell (S3) matches what I verified by hand in round 1 and
  removes the class rather than relying on npm's current behavior.

## ROUND 2 VERDICT: **CONVERGED**

The one blocking item is fixed and the fix is proven non-vacuous by a mutation that exactly
one scenario in the whole suite catches. All four should-fixes are incorporated. Five of six
suggestions taken; the one rejection (S2) is better-reasoned than my suggestion was and I
withdraw it. The report's bookkeeping was corrected honestly, including a gap the implementer
found on its own (#13's scalar sub-case) rather than closing only what I named.

**Nothing blocks PHASE_A.** Carry forward to PHASE_B, unchanged from round 1:

1. `docs-internal/migration-to-ts-high-level.md` must gain the #1–#19 whitelist (plus #20)
   with numbering preserved — 14 live code comments depend on it.
2. Record the owner's approval id for the unknown-command behavior change, per the whitelist's
   own convention of one approval ticket per changed behavior.
