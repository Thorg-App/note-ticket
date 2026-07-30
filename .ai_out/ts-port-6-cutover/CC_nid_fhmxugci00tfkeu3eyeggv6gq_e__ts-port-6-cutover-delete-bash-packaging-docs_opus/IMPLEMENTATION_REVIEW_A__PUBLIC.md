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
