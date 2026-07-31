# IMPLEMENTATION REVIEW — PHASE_B (packaging + docs), commit `132df86`

Reviewer: IMPLEMENTATION_REVIEWER. Read-only for code; every mutation below was reverted and
`git status` is clean.

## Summary

PHASE_B repackages the tool for the post-bash world and rewrites the docs. The core finding
the implementer reports — build-on-first-run cannot work from a root-owned prefix — is
**correct**, and the resolution (build in the package's own build phase, install the bundle,
`touch` it last) is **correct and stays inside the owner's build-from-source decision**:
nothing prebuilt is committed or attached to a release.

I re-verified the install layout independently rather than trusting the report:

| Verification | Result |
|---|---|
| Replayed the PKGBUILD's exact `package()` loop (`git archive` → `npm run build` → `while read` over the manifest → `install -Dm644` → `touch` → `ln -s`) into a scratch `pkgdir`, then a `chmod -R a-w` prefix | Tree is `usr/share/ticket-core/{ticket,package.json,package-lock.json,tsconfig.json,src,dist}` + `usr/bin/tk` symlink, no `node_modules` |
| `tk help` / `create` / `ls` / `show` / `query \| jq` through the **absolute** symlink on a read-only prefix | all rc 0, stderr **empty**, program name resolves to `tk`, stdout byte-clean through `jq` |
| Second invocation | no rebuild attempt (stderr empty) |
| mtime reasoning | bundle is the newest file by ~140 s; `find src -newer dist/ticket.mjs -print -quit` is empty. Robust even under makepkg's reproducible-build mtime clamping, because `-newer` is *strict* — equal mtimes are not stale |
| **Homebrew layout**, replicated exactly: `libexec` tree, `bin/tk -> ../libexec/ticket` (relative), then the prefix link `bin/tk -> ../Cellar/.../bin/tk` (**symlink to a symlink**), Cellar `chmod -R a-w` | `help`/`create`/`ls` all rc 0, stderr empty, no rebuild. The double-hop resolves correctly through the launcher's `_script_dir` loop |
| Rendered the real formula by running `publish-homebrew.sh` with clone/push stubbed | manifest interpolates to `libexec.install "ticket", "package.json", "package-lock.json", "tsconfig.json", "src"`; heredoc escaping is correct (all backticks escaped, no stray `$` expansion); Ruby/Homebrew DSL reads valid (`touch`/`chmod` come from `FileUtils`, which `Formula` includes; `install_symlink` and `shell_output` used correctly). *Ruby was not installed in this container, so this is a careful read, not a parse.* |
| `bash -n` + `source` of the PKGBUILD | parses; `depends`/`makedepends`/`optdepends` arrays are exactly as intended, backticks inside the single-quoted `optdepends` stay literal |
| Divergence whitelist | entries **1–20 present, in order**. Diffed #1–#19 against `git show 42ccf92^:scripts/parity/README.md`: **verbatim**, except two now-false sentences removed from #1 and #3 ("stays until T6" / "Remove this whitelist at T6") — correct, not a defect |
| ~14 by-number citations | every `divergence #N` comment in `src/`, `test/` now points at `docs-internal/migration-to-ts-high-level.md`; no dangling `scripts/parity/README.md` reference |
| `git grep -in 'parity\|TS_COMMANDS\|TS_DEP_SUBCOMMANDS'` | only historical narrative inside the migration doc (which carries a `STATUS: COMPLETE` banner) and "bash parity" prose in code comments. No doc claims the harness exists |
| ORIGINAL_README usage block | **byte-identical** to `TICKET_INVOKED_AS=tk node dist/ticket.mjs help` |
| THIRD_PARTY_LICENSES judgement | **correct**. The only non-relative imports in `src/` are `node:child_process`, `node:crypto`, `node:fs`, `node:os`, `node:path`; nothing third-party lands in the bundle, and `node_modules/` is not shipped |
| `make test` | 13 features, **261 scenarios / 1729 steps, 0 failed** |
| BDD manifest mutation (mine, not the report's) | dropping `package.json` from `pkg/install-manifest.txt` ⇒ 2 wrapper scenarios RED. Non-vacuous. Restored |

**Verdict: APPROVE with should-fixes.** No blocking defects. Three IMPORTANT items and one
question for the owner.

---

## 🚨 CRITICAL / BLOCKING

None.

---

## ⚠️ IMPORTANT (should fix)

### B1. The two bash manifest parsers silently drop the LAST entry if the file loses its trailing newline — and the BDD cannot catch it

`pkg/aur/ticket-core/PKGBUILD` and `scripts/publish-homebrew.sh` both use the bare form:

```bash
while read -r entry; do ... done < pkg/install-manifest.txt
```

`read` returns non-zero on a final line with no `\n`, so that line never enters the loop.
Measured, on a copy of the real manifest with the trailing newline stripped:

- bash consumers → `ticket, package.json, package-lock.json, tsconfig.json` (**`src` lost**)
- `features/steps/ticket_steps.py`'s `splitlines()` → all five, including `src`

So the failure is *asymmetric*: an editor or a future append that eats the final newline
produces packages with **no `src/`**, which the launcher then rejects at runtime with
`Error: no sources at [...]; this is not a complete install of the tool` — while `make test`
stays green, because the Python consumer keeps the entry. That is precisely the
silent-drift-with-no-signal failure the manifest was introduced to eliminate, reintroduced one
layer down.

Fix (both files):
```bash
while read -r entry || [[ -n "$entry" ]]; do
```

### B2. Nothing verifies the PACKAGED install layout — the class of bug that just shipped

The pre-existing formula did `bin.install "ticket" => "tk"` and was **dead on arrival** once the
launcher needed its sources; it went unnoticed because nothing exercises the install path. The
new layout is verified only by the implementer's manual simulation and mine — neither is in the
repo, so the next edit to the PKGBUILD or the formula has the same blind spot.

CI's existing smoke step covers the **checkout** path (symlink into a checkout, cold build),
which is a different shape from the packaged one (read-only prefix, prebuilt bundle, sources
installed but never rebuilt).

Suggested 80/20 fix: a `make package-smoke` target (or a step in `test.yml`) that replays the
PKGBUILD sequence into `.tmp/`, `chmod -R a-w`s the prefix, symlinks `tk`, and asserts
`tk help` + `tk create` + `tk ls` succeed with **empty stderr** and that a second run does not
rebuild. That is ~20 lines of shell and it is exactly the check I ran by hand; it also makes the
manifest genuinely single-source-of-truth for the packaging consumers, not just the BDD one.

### B3. `cp -a` in `package()` propagates the BUILD USER's ownership into the package

```bash
cp -a "$entry" "$pkgdir/$_installdir/"
```

`package()` runs under `fakeroot`. Files under `$srcdir` are owned by the build user, and
`cp -a` implies `--preserve=ownership`, so the recorded ownership in the resulting package is
the builder's uid/gid rather than `root:root` (this is the standard reason Arch guidelines
prefer `install`/`cp -r` over `cp -a` in `package()`; namcap flags it). I could not confirm
empirically — `fakeroot` is not available in this container — so please treat this as
"verify with `makepkg` + `namcap` before the next tag", but the fix is cheap and free of
downside:

```bash
cp -a --no-preserve=ownership "$entry" "$pkgdir/$_installdir/"
```

Related, and worth correcting in the same edit: the comment above that line says `cp -a`
preserves mtimes "**which matters**: the launcher rebuilds when any source file is newer than
the bundle". It does not actually matter — the bundle is `touch`ed *after* the copy, so it is
newest whether or not the sources kept their tarball mtimes. Stating a false load-bearing
reason invites a future maintainer to preserve the wrong property.

---

## 💡 Suggestions (non-blocking)

- **`README.md` overstates the packaged runtime.** "Installing from Homebrew or the AUR builds
  the bundle at install time instead, and **needs nothing but node afterwards**" is false —
  `git` is required at runtime for repo-root resolution (the same paragraph correctly lists
  node **and** git two sentences earlier), as are bash/`readlink`/`find` for the launcher.
  Suggest "…and needs no npm or network afterwards".
- **`pkg/install-manifest.txt`'s header says "every consumer builds it after materializing this
  set"** — true only for the BDD copy. Both packages build *before* installing the set
  (`build()` precedes `package()`; the formula's `npm run build` precedes `libexec.install`).
  The substance ("`dist/ticket.mjs` is built, not copied") is right; the ordering clause is not.
- **Manifest conflates two different lists.** For a *packaged* install, `package.json`,
  `package-lock.json` and `tsconfig.json` are dead weight — the bundle is prebuilt and the
  prefix is read-only, so they can never be used. They are needed only by the BDD copy, which
  really does rebuild. Not worth splitting the file today (it is 5 lines), but the header
  should say the list is "what a tree needs to *run and rebuild*", so the next reader does not
  conclude a package needs a build toolchain on disk.
- **The Homebrew formula installs no licence file** while the PKGBUILD installs `LICENSE.md`.
  Add `prefix.install "LICENSE.md"` for symmetry.
- **`depends=('bash' 'coreutils' 'findutils' ...)`** — all three are in Arch's `base` meta
  package; guidelines say not to list them. Harmless, and the explanatory comment is genuinely
  useful, so I would leave it.
- **CHANGELOG**: the cutover entry does cover the user-visible headline ("Copying the `ticket`
  file alone to your PATH no longer works"), which was the item I was asked to check — good.
  Not covered: that `brew install` / `makepkg` now need npm + network at install time. One
  sentence in the same bullet would close it.
- **Pre-existing, noted not filed**: `tk help`'s `-a, --assignee   Assignee` omits the real
  default (`git user.name` — confirmed live: a packaged `tk create` recorded the git user).
  Bash's help omitted it too, so the regenerated README block is faithful and PHASE_B is not
  at fault; but the help text itself is under-informative. Worth a follow-up ticket, not a
  change here.
- CLAUDE.md's "CI Publishing" still says "updates **all formulas** in tap"; there is one.

---

## Documentation truthfulness — spot-check results

Everything I checked in the rewritten docs is **true**, with the single exception of the
README's "nothing but node" above:

- CLAUDE.md "`./ticket` is a ~90-line bash launcher" → 89 lines. ✅
- CLAUDE.md's `src/core`/`src/cli` inventory → every named module exists. ✅
- "Everything it prints goes to stderr, so `tk query | jq` stays byte-clean" → verified on a
  cold build and on a packaged install. ✅
- "Packages build at PACKAGE time … `touch` it last" → matches both packages. ✅
- ORIGINAL_README install stanzas (`brew install ticket-core`, `yay -S ticket-core`) → match
  `pkgname` and the generated `ticket-core.rb`. ✅
- ripgrep removal → `git grep -in ripgrep` and `git grep -nw rg` are empty across the tree. ✅
- Divergence preamble's claim that #1–#19 are verbatim → confirmed by diff. ✅

---

## `#QUESTION_FOR_HUMAN:` — one item

**`#QUESTION_FOR_HUMAN:` The ticket says packaged installs would "need `nodejs` + `npm` +
network on FIRST run" and lists `npm` in `depends`. PHASE_B instead builds at package time
(`makedepends=('npm')`, `def install` runs `npm run build`), because build-on-first-run is
provably impossible from a root-owned prefix (I reproduced the `mkdir dist: permission denied`
failure mode by construction, and the working alternative end to end).**

I judge this a *correct* reading of the owner's build-from-source decision — nothing prebuilt is
committed or attached, and the release flow is still "tag it" — but it does contradict the
ticket's literal text, so it deserves an explicit ack rather than being absorbed silently.
Consequence to confirm: `brew install ticket-core` / `makepkg` now require **npm and network at
install time**, and drag esbuild+typescript devDeps onto the machine for the duration of the
build. Both packages call this out in comments and CLAUDE.md records it as accepted-for-now.

**Residual risk the implementer flagged and I could not close either:** neither `brew` nor
`makepkg` exists in this container, so Homebrew/pacman-specific semantics (notably whether
Homebrew's install sandbox lets `npm install` reach the network) remain unverified. One real
`brew install --build-from-source` and one `makepkg` + `namcap` run before the next release tag
would close B3 and this together.

---

# ROUND 2 — convergence verification of `375ab65`

A fresh implementer acted on the round-1 review. I re-ran every claim myself rather than
reading the report. All mutations reverted; `git status` clean.

## Verdict: **CONVERGED.** Nothing blocks. No new IMPORTANT items.

## 1. B1 — trailing newline. Fixed, verified BOTH directions on the real files

| Consumer | old code (`HEAD~1`) + manifest with no trailing `\n` | new code, same manifest |
|---|---|---|
| `publish-homebrew.sh` → rendered formula | `libexec.install "ticket", "package.json", "package-lock.json", "tsconfig.json"` — **`src` lost** | `… "tsconfig.json", "src"` ✅ |
| raw parser loop, both forms | last entry dropped | last entry kept ✅ |

`|| [[ -n "$entry" ]]` is present in **all three** shell consumers — `PKGBUILD:49`,
`publish-homebrew.sh:27`, and the new `package-smoke.sh:42`. The repo's manifest still ends in
`\n` (`od -c` → `s r c \n`), and the manifest header now states the tolerance requirement as a
rule for future consumers. Data lines byte-unchanged.

## 2. B2 — `make package-smoke`. Real, honest, and mutation-proven

Clean run: `package-smoke: OK`, rc 0. I ran four mutations, including one the implementer did
not:

| Mutation | Result |
|---|---|
| manifest without `src` | **RED** — `FAIL: tk help exited 1; stderr: Error: no sources at [...]` |
| a source file newer than the bundle in the prefix | **RED** — `FAIL: installed file is newer than the bundle: [.../src/cli/main.ts]` |
| `touch "$BUNDLE"` removed | **GREEN** — reproduces the implementer's honest negative exactly (analysis in §4) |
| **mine:** `ln -s` replaced with `cp` of the launcher into `bin/` — i.e. the original `bin.install "ticket" => "tk"` breakage | **RED** — `FAIL: tk help exited 1; stderr: Error: no sources at [.../prefix/bin/src]` |

That last one answers the coordinator's question directly: **yes, the smoke test would have
caught the bug that motivated it.** The launcher itself is the oracle, so any layout in which
`tk` cannot reach its sources fails.

**Is it honest?** Yes. It drives `$PREFIX/bin/tk` via `command tk` with the staged prefix first
on `PATH` — and the mutation failures name the *staged* paths, which is proof it is not touching
the developer's installed tool. (The implementer's note that this shell exports a `tk` function
shadowing PATH is real; I hit the same thing in round 1. `command` is the right fix.) It also
holds stderr to empty, asserts no `node_modules` leaked, runs `ls` twice to catch a second-run
rebuild, and `chmod -R a-w`s the prefix so a rebuild attempt cannot silently succeed. The
header is candid about the two things it does not do (no `brew`/`makepkg`, reuses the built
bundle).

**Residual scope limit, stated for the record, not a defect:** the script *replays* the shared
install steps rather than deriving them from the formula/PKGBUILD bodies. It cannot catch a
hand-edit confined to the formula's `def install` that the script does not mirror. What it does
cover is the two decisions that actually broke before — *what* gets installed (read from the
same manifest all three consumers read) and *how* `tk` reaches it — and both are mutation-proven
above. For an 80/20 guard with no `brew`/`makepkg` in CI, that is the right line.

Wiring checked: `package-smoke: build` in the Makefile, and the CI step is placed **after**
`make test` — necessarily, since the earlier cold-start smoke step asserts `test ! -e dist/ticket.mjs`.

## 3. The extra defect it found on its own — confirmed, and I hit it independently

While rendering the formula from a copy of the script placed outside the repo, I reproduced the
bug before reading their report: the old script emitted a bare **`libexec.install`** — valid Ruby
that installs nothing — and went on to commit and push it. Cause is as they diagnose: the failed
`done < "$manifest"` redirect does not fail the function, because the trailing `echo` succeeds.

Both new guard arms verified:

| Arm | Result |
|---|---|
| manifest unreadable (`chmod 000`) | **rc 1**, `cannot read …/pkg/install-manifest.txt`, **no formula written** |
| manifest with comments only (no entries) | **rc 1**, `… lists no install entries`, no formula written |
| old script, manifest unreadable | renders `libexec.install ` and proceeds — the bug ✅ reproduced |

The `exit 1` inside `install_list_ruby` works despite running in a command substitution, because
`install_list="$(install_list_ruby)"` is a bare assignment under `set -e`. Verified empirically,
not assumed. Good catch by the implementer; it is the same failure class as B1 and closing it
was right.

## 4. The honest negative (`touch` mutation stays GREEN) — I pressure-tested it; the reasoning HOLDS

I tried to construct a faithful ordering in which the `touch` is load-bearing and could not:

- **AUR:** `cp -a` preserves the srcdir mtimes (tarball time, or `npm install`'s
  `package-lock.json` rewrite at T1); `install -Dm644` does **not** preserve mtime, so the bundle
  lands at *now* — newest even with the `touch` deleted.
- **Homebrew:** `libexec.install` is a `mv`, preserving mtimes; `npm run build` (T2) is the last
  write before any install, and T2 > T1 > tarball. Bundle is newest without the `touch`.
- **makepkg reproducible builds:** `SOURCE_DATE_EPOCH` clamping makes every mtime *equal*, and
  `find -newer` is strict, so equal is not stale either.
- **Bottle pour / `pacman -U`:** tar preserves the recorded ordering.

The only way to make it load-bearing is a *future* step that rewrites a file **under `src/`**
after the build — and note the launcher only scans `src/`, so even a post-`touch`
`inreplace libexec/"ticket"` would not matter. So: **belt-and-braces, correctly characterised.**

Keeping the `touch` while asserting the *invariant* rather than the *mechanism* — "no installed
file is newer than the bundle" — is the right call, and mutation 2 proves that assertion is live.
Manufacturing a fixture whose only purpose is to kill mutation 3 would have been a test that
lies about the system. I endorse the decision and the decision to write it down rather than
quietly ship a green board.

## 5. Rejections and the deferral — all reasonable

- **S4 (`bash`/`coreutils`/`findutils` are in Arch `base`)** — rejected, correctly: my own
  round-1 text recommended leaving it.
- **S5 (CHANGELOG should mention npm+network at install time)** — rejected as already satisfied.
  **They are right and I was wrong**: `CHANGELOG.md` already reads "`npm` and network are needed
  for the build (once from a checkout, **at install time for a package**)". Nothing dropped.
- **S6 (`tk help` omits the `-a` default)** — deferred to `nid_7qxhyhxhwbxi7yh0f8j7n79et_e`
  (chore, p3). The ticket exists, diagnoses it correctly, names both files that must change
  together (`src/cli/commands/help.ts` **and** the ORIGINAL_README block that is a verbatim copy
  of `help`), and records that it is pre-existing rather than a port regression. Exactly the
  right disposition — this is a behavior/text change in `src/`, which was out of scope here.

## 6. Formula re-rendered after the edits — still sound

`libexec.install "ticket", "package.json", "package-lock.json", "tsconfig.json", "src"` →
`(libexec/"dist").install "dist/ticket.mjs"` → `touch` → `chmod 0755` →
`bin.install_symlink libexec/"ticket" => "tk"` → `prefix.install "LICENSE.md"`. Heredoc escaping
still correct (all backticks escaped, no stray `$` expansion). `LICENSE.md` lands in `prefix`,
outside `libexec`, so its post-`touch` position cannot affect the launcher's staleness scan.
(Ruby still not parsed — no `ruby` in this container, same limit as round 1.)

## 7. Gates, re-run by me

`make typecheck` rc 0 · `make test` **13 features / 261 scenarios / 1729 steps, 0 failed** ·
`make package-smoke` OK · `bash -n` clean on all three scripts and the PKGBUILD.

## Nitpicks (do not gate the close)

- The **formula's** `touch` comment still reads "Make the bundle the newest file installed so a
  packaged install never tries to write into the Cellar" — the PKGBUILD's twin was corrected to
  say the timestamps are not load-bearing, the formula's was not. Same nuance, two places, now
  inconsistent.
- `package-smoke.sh`'s `trap _discard_scratch EXIT` wipes the prefix on **failure** too, so a red
  CI run leaves nothing to inspect. The `_fail` messages embed stderr, so this is mostly covered;
  a `KEEP_SCRATCH=1` escape hatch would be cheap.
- The smoke test's staleness assertion scans the whole `$SHARE` tree while the launcher scans only
  `src/`. Deliberate and stated in the comment; just be aware it can go red on a change that the
  launcher would not actually care about.

## Carried forward (unchanged from round 1, correctly recorded in the report)

`cp -a --no-preserve=ownership` under a real `fakeroot`, and one real
`brew install --build-from-source` / `makepkg` + `namcap` run before the next release tag.
Neither toolchain exists in this container. `make package-smoke` narrows the gap to
package-manager-*specific* semantics; it does not close them.
