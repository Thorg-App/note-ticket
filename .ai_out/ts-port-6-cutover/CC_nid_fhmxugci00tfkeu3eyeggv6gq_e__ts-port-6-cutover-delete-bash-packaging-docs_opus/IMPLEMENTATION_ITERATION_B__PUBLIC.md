# TS port 6 — ITERATION_B (acting on the PHASE_B review)

Ticket `nid_fhmxugci00tfkeu3eyeggv6gq_e`. Scope: packaging + docs + one new make target.
**No `src/`, no `ticket`, no feature file, no step definition was touched** — PHASE_A's code
decisions were not reopened.

Working tree dirty and uncommitted. No `change_log` entry. Ticket not closed.

`make test` **13 features / 261 scenarios / 1729 steps, 0 failed**; `make typecheck` rc 0;
`make package-smoke` **OK** — the same suite numbers PHASE_B finished on.

---

## 1. Incorporated / rejected — every review item

| # | Review item | Disposition |
|---|---|---|
| **B1** | Bash manifest parsers drop the last entry with no trailing newline | **INCORPORATED** — `while read -r entry \|\| [[ -n "$entry" ]]` in both `pkg/aur/ticket-core/PKGBUILD` and `scripts/publish-homebrew.sh`, each with a WHY comment. Proven §3.1 |
| **B2** | Nothing verifies the packaged layout | **INCORPORATED** — new `scripts/package-smoke.sh` + `make package-smoke`, wired into `.github/workflows/test.yml`. Mutation results (incl. one honest negative) in §3.2 |
| **B3a** | `cp -a` records the build user's uid/gid under fakeroot | **INCORPORATED, UNVERIFIED** — `cp -a --no-preserve=ownership`. `fakeroot`/`makepkg` are not available here, so this rests on the Arch convention the reviewer cited, exactly as instructed. What I *did* verify: the flag is accepted by this coreutils and the install still produces the full tree (§3.1) |
| **B3b** | `cp -a`'s comment falsely claims mtime preservation "matters" | **INCORPORATED** — comment rewritten; it now says the timestamps are *not* load-bearing because the bundle is touched afterwards, and explains the two flags instead |
| **Doc** | README "needs nothing but node afterwards" — `git` is required at runtime | **INCORPORATED** — now "those installs need npm and network *then*, and never again; node and git are still required to run the tool." Re-scan of the same class: §4 |
| S1 | Manifest header: "every consumer builds it after materializing this set" is wrong for both packages | **INCORPORATED** — header now states the real ordering (build precedes install for both packages; the BDD copy is the one that builds afterwards) |
| S2 | Manifest conflates "run" and "rebuild" lists | **INCORPORATED** — header retitled "What a tree needs to RUN and REBUILD", with a paragraph saying the npm manifests are inert in a packaged install. File not split (5 lines) — matching the reviewer's own recommendation |
| S3 | Homebrew formula installs no licence file | **INCORPORATED** — `prefix.install "LICENSE.md"`; confirmed present in the rendered formula (§3.3) |
| S4 | `depends=('bash' 'coreutils' 'findutils' ...)` are in Arch `base` | **REJECTED** — the reviewer's own recommendation was to leave it; the explanatory comment is worth more than guideline purity, and an explicit dep is never wrong at install time |
| S5 | CHANGELOG should mention npm+network at install time | **REJECTED as already satisfied** — the existing entry reads "`npm` and network are needed for the build (once from a checkout, **at install time for a package**)". Verbatim in `CHANGELOG.md` today; nothing to add |
| S6 | `tk help` omits the `-a` default (`git user.name`) | **DEFERRED to a ticket**, as the reviewer suggested: `nid_7qxhyhxhwbxi7yh0f8j7n79et_e` (chore, p3), naming `src/cli/commands/help.ts` and the ORIGINAL_README block that must be regenerated with it |
| S7 | CLAUDE.md "updates all formulas in tap" — there is one | **INCORPORATED** — both CI-publishing bullets now name `ticket-core` singular |

### One defect I found while verifying, not in the review

Rendering the formula from a copy of `publish-homebrew.sh` placed outside the repo emitted a
bare **`libexec.install`** — syntactically valid Ruby that installs *nothing*, published
silently. Cause: the `done < "$manifest"` redirect failure does not fail `install_list_ruby`,
because the function's last command is a successful `echo`. Same failure class as B1 (a
formula that looks fine and yields a broken install), so I closed it: the function now refuses
an unreadable manifest and an empty rendered list. Both arms exercised — §3.3.

---

## 2. What changed

- `pkg/aur/ticket-core/PKGBUILD` — robust `read`; `cp -a --no-preserve=ownership`; comment
  corrected.
- `scripts/publish-homebrew.sh` — robust `read`; manifest-readable and non-empty-list guards;
  `prefix.install "LICENSE.md"`.
- `pkg/install-manifest.txt` — header only (title, ordering, the run-vs-rebuild distinction,
  and the trailing-newline requirement on shell consumers). **The five data lines are byte-
  unchanged**, so no consumer's behavior moved.
- `scripts/package-smoke.sh` (new, executable) + `package-smoke` target in `Makefile` +
  a CI step in `.github/workflows/test.yml`.
- `README.md` — the runtime-requirements falsehood.
- `CLAUDE.md` — `make package-smoke` documented under "Releases & Packaging" with its WHY and
  its explicit limit ("does NOT run brew/makepkg"); the "all formulas" plural.
- Auto-memory — the trailing-newline rule, the smoke target, the honest note that `touch` is
  belt-and-braces, and the `tk`-shell-function trap below.

### On `make package-smoke`'s design

It replays the install steps the two packages *share*, reading the same
`pkg/install-manifest.txt` they read, into `$REPO/.tmp/package-smoke` (never the system temp
dir — it is `noexec` here and the installed `ticket` is executed), `chmod -R a-w`s the prefix,
and drives `tk` through the installed symlink asserting rc 0, **empty stderr** (any launcher
chatter = a rebuild attempt) and expected stdout, twice. It is deliberately NOT a package
manager emulator: it reuses the repo's already-built bundle rather than running a clean
`npm install`, and it does not run `brew`/`makepkg`. The script header says all of this.

**Dev-environment trap worth recording:** the first run failed with the program name resolving
to `ticket`, not `tk`. This shell **exports a `tk` function** (`tk () { ticket "$@"; }`), which
bash inherits, so the test was driving the developer's installed tool rather than the staged
one. Fixed with `command tk`. A CI-only check would never have surfaced it.

---

## 3. Verification — everything below was run

### 3.1 B1 and B3a, on the real files

Made a copy of the real manifest with its trailing newline stripped
(`printf '%s' "$(cat …)"`), then ran **both consumers, before my fix (`git show HEAD:…`) and
after**:

| Consumer | HEAD (bare `read`) | After fix |
|---|---|---|
| `publish-homebrew.sh` → rendered formula | `libexec.install "ticket", "package.json", "package-lock.json", "tsconfig.json"` — **`src` lost** | `… "tsconfig.json", "src"` |
| `PKGBUILD` `package()` (sourced, real `pkgdir`) → installed tree | `dist package-lock.json package.json ticket tsconfig.json` — **no `src`** | `dist package-lock.json package.json src ticket tsconfig.json` |

The bug reproduces exactly as the reviewer measured, and the fix closes it in both. The
PKGBUILD run also exercised `cp -a --no-preserve=ownership` end to end (accepted, full tree
installed). `pkg/install-manifest.txt` in the repo still ends in `\n` (`od -c`: `s r c \n`).

### 3.2 B2 — the smoke target, mutation-tested

| Mutation | Expected | Measured |
|---|---|---|
| Manifest loses `src` | RED | **RED** — `FAIL: tk help exited 1; stderr: Error: no sources at [...]; this is not a complete install of the tool` |
| A source file newer than the bundle in the prefix | RED | **RED** — `FAIL: installed file is newer than the bundle: [.../src/cli/main.ts]` |
| `touch "$BUNDLE"` removed | RED (per brief) | **GREEN — see below** |

**Honest negative, not papered over.** I could not make "the bundle is not touched last" go
red without a contrived fixture, because in *every faithful* install ordering the bundle is
already the newest file: `cp -a`/`libexec.install` preserve the sources' (older, tarball or
checkout) mtimes while the bundle is produced by the build phase that just ran, and `install`
does not preserve mtime either. Under makepkg's `SOURCE_DATE_EPOCH` clamping all mtimes become
*equal*, and `find -newer` is strict, so that is not stale either. **The `touch` is
belt-and-braces, not load-bearing** — I kept it (cheap insurance against a future reordering)
and corrected the PKGBUILD comment so nobody reads it as load-bearing. What the smoke test
asserts instead is the *invariant the touch exists to guarantee* — no installed file is newer
than the bundle, over the whole tree, not just `src/` — and mutation 2 proves that assertion is
non-vacuous. Manufacturing a fixture that only exists to kill mutation 3 would have been a
test that lies about the system, so I did not write one.

### 3.3 Formula render + the extra defect

Rendered with the **real** `publish-homebrew.sh` (only `git clone`/`git push` stubbed):

- `libexec.install "ticket", "package.json", "package-lock.json", "tsconfig.json", "src"`
- `(libexec/"dist").install "dist/ticket.mjs"`, `touch`, `chmod 0755`,
  `bin.install_symlink libexec/"ticket" => "tk"`, `prefix.install "LICENSE.md"` — all present,
  in that order; heredoc escaping still correct (backticks escaped, no stray `$` expansion).
- Missing-manifest arm: aborts with `cannot read …/pkg/install-manifest.txt`, **rc 1** (it used
  to render the do-nothing `libexec.install` and push it).

Ruby was **not** parsed — no ruby in this container, same limit the reviewer recorded.

### 3.4 Gates

| Gate | Result | Log |
|---|---|---|
| `make typecheck` | rc 0 | `.tmp/typecheck.log` |
| `make test` | 13 features / 261 scenarios / 1729 steps, **0 failed** | `.tmp/test.log` |
| `make package-smoke` | `package-smoke: OK` | `.tmp/package-smoke.log` |
| `bash -n` on `scripts/package-smoke.sh`, `scripts/publish-homebrew.sh`, `scripts/publish-aur.sh`, `pkg/aur/ticket-core/PKGBUILD` | clean | — |

`scripts/publish-aur.sh` was re-checked and still needs no change: my PKGBUILD edits are inside
`package()`, and its three `^`-anchored `sed` targets (`pkgver`, `pkgrel`, `sha256sums`) are
untouched single lines.

---

## 4. Re-scan for the README's error class ("what does an installed tool still need?")

Grepped every runtime-requirement claim in `README.md`, `ORIGINAL_README.md`, `CLAUDE.md`,
`CHANGELOG.md` and checked each against the code:

| Claim | Verdict |
|---|---|
| README "You need **node**, **git** and a POSIX shell (`bash`, `readlink`, `find`)" | true |
| README "…builds the bundle at install time instead, and needs nothing but node afterwards" | **FALSE — fixed** |
| ORIGINAL_README §Requirements + "Homebrew and AUR packages build the bundle at install time — `npm` and network are needed then, not afterwards" | true, already correct — the phrasing scopes the "not afterwards" to npm/network, which is the accurate claim |
| CHANGELOG "`npm` and network are needed for the build (once from a checkout, at install time for a package)" | true |
| PKGBUILD `depends`/`makedepends` comments | true (`nodejs git bash coreutils findutils`; npm build-only) |
| Formula `depends_on` comment ("jq only for `tk query <jq-filter>`") | true |

---

## Open items / State

- **Uncommitted.** Modified: `.github/workflows/test.yml`, `CLAUDE.md`, `Makefile`,
  `README.md`, `pkg/aur/ticket-core/PKGBUILD`, `pkg/install-manifest.txt`,
  `scripts/publish-homebrew.sh`. New: `scripts/package-smoke.sh` (mode 755),
  `_tickets/help-text-omits-the-a-assignee-default-git-username.md` (the S6 follow-up ticket).
  Auto-memory updated outside the repo.
- **Unverified, carried forward:** `cp -a --no-preserve=ownership` under a real `fakeroot`
  (B3a), and one real `brew install --build-from-source` / `makepkg` + `namcap` run. Neither
  toolchain exists in this container. `make package-smoke` narrows the gap to
  package-manager-*specific* semantics (notably whether Homebrew's sandbox lets `npm install`
  reach the network); it does not close them. Still worth one real run before the next tag.
- **`touch`-last is defensive, not load-bearing** (§3.2). Recorded here and in the auto-memory
  so a future maintainer does not mistake the smoke test's silence for coverage of it.
- No `#QUESTION_FOR_HUMAN:` from me. The reviewer's outstanding question (build at package time
  vs first run) is already with the owner and I did not re-raise it.
