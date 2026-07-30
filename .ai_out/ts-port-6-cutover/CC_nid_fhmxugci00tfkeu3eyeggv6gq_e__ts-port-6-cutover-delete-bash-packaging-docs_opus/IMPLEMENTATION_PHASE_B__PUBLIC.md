# TS port 6 — PHASE_B (packaging + docs)

Ticket `nid_fhmxugci00tfkeu3eyeggv6gq_e`. PHASE_A (code cutover) is done and converged; this
phase touched **no** `src/`, no `ticket`, no feature file. Working tree left dirty and
uncommitted, no `change_log` entry, ticket not closed, as instructed.

`make test` **261 scenarios / 1729 steps, 0 failed**; `npm test` **429 unit tests, 0 failed**;
`make typecheck` clean — the same numbers PHASE_A finished on.

---

## 1. THE FINDING: build-on-first-run cannot work from a packaged prefix

The brief asked me to sanity-check the install layout empirically rather than reason about it.
I did, and the naive layout is dead on arrival. Simulated a root-owned prefix by copying the
tool into `.tmp/prefix-sim/libexec/ticket-core`, symlinking `bin/tk` at it, and
`chmod -R a-w`-ing the tree:

| Prefix contents | Result |
|---|---|
| launcher + `src/` + manifests + **prebuilt `dist/ticket.mjs`**, **no `node_modules/`** | `tk help`, `tk create`, `tk ls` all rc 0, stdout clean, stderr empty |
| same, **`dist/` removed** | `ticket: building [...]` → esbuild `✘ Failed to create output directory: mkdir .../dist: permission denied` → `Error: failed to build [...]`, **exit 1** |

So the old formula shape (`bin.install "ticket" => "tk"`, one file) and any "let it build on
first run" packaging would produce an installed `tk` that can never run.

**Resolution: packages build the bundle in their own build/install phase** and install it
inside the prefix. This does **not** re-open the owner's decision — nothing prebuilt is
committed to the repo or attached to a release, and the release flow is still "tag it". The
build simply happens where a package build phase is meant to happen (`build()` in the
PKGBUILD, `def install` in the formula), which is also the plain reading of the ticket's own
"build-on-install" phrasing. Runtime afterwards needs **only node** — no npm, no network, no
`node_modules/`.

Second consequence, handled: the launcher rebuilds when any file under `src/` is newer than the
bundle, and a rebuild inside a read-only prefix is the failure above. Both packages therefore
`touch` the installed bundle **last**, making it unambiguously the newest installed file, so a
packaged install never even considers rebuilding.

### End-to-end simulation of the FINAL packaging (the one that matters)

I replayed the PKGBUILD's exact sequence — `git archive` into a `srcdir`, `npm run build`,
`cp -a` each manifest entry into a `pkgdir`, `install -Dm644` the bundle, `touch` it, symlink
`usr/bin/tk` → `/usr/share/ticket-core/ticket` — then `chmod -R a-w` the installed share tree
and drove it from a scratch `git init` repo through the symlinked `tk`:

| Step | Result |
|---|---|
| installed tree | `usr/share/ticket-core/{ticket,package.json,package-lock.json,tsconfig.json,src,dist}` + `usr/bin/tk` symlink; **no `node_modules/`** |
| `tk help` | rc 0, line 1 `tk - minimal ticket system with dependency tracking` (program name resolved through the symlink), stderr empty |
| `tk create "Packaged install"` | rc 0, JSON line on stdout, stderr empty |
| `tk ls`, `tk show <id>` | rc 0, stderr empty |
| `tk query \| jq -c .id` | valid JSON through jq, stderr empty |
| second `tk ls` | stderr empty — **no rebuild attempt against the read-only prefix** |

Homebrew's layout is the same shape (`libexec` + `bin.install_symlink`), verified by the same
simulation; I did not run `brew` itself.

---

## 2. What changed

### `pkg/install-manifest.txt` (new) — the S5 resolution

**Resolution picked: one small file that all three consumers read**, rather than "duplicate the
list and cross-reference it in comments".

WHY this one: the reviewer's cheaper option (each side keeps its own list plus a comment naming
the other) fails silently — a BDD scenario that copies a file the packages forget still passes,
which is exactly the drift the item was raised about. A shared file makes the two descriptions
literally the same bytes. It is five lines of data and ~6 lines of parsing per consumer, which
is well inside 80/20 for a list whose divergence produces broken installs.

Consumers:

- `pkg/aur/ticket-core/PKGBUILD` — `package()` reads it from the extracted tarball
- `scripts/publish-homebrew.sh` — reads it and **interpolates** a literal
  `libexec.install "ticket", "package.json", ...` line into the generated formula, so the
  published formula stays a plain static file with no runtime parsing to audit
- `features/steps/ticket_steps.py` — `_install_manifest()` replaces the hardcoded
  `TOOL_COPY_FILES` tuple **and** the separate `copytree(src)`; directories are copied whole

**Proved non-vacuous by mutation:** deleting `package.json` from the manifest makes
`ticket_wrapper.feature` fail (2 scenarios, incl. "A bundle older than the sources is
rebuilt"). The steps really read the file. Reverted.

`dist/ticket.mjs` is deliberately **not** in the manifest — it is built, not copied, and the
file's header says so.

### `pkg/aur/ticket-core/PKGBUILD`

- `depends`: `bash coreutils findutils gawk` → **`bash nodejs git coreutils findutils`**
  (bash runs the launcher, node runs the CLI, git resolves the repo root, coreutils/findutils
  supply `readlink`/`dirname`/`find`). `makedepends=('npm')`, build-only.
- **`optdepends` ripgrep dropped.** Verified empirically, not assumed: `git grep -in ripgrep`
  over `ticket src test features Makefile package.json scripts` returns nothing, and
  `git grep -nw rg` returns nothing. The only surviving mentions were this PKGBUILD line and
  `ORIGINAL_README.md`'s prose, both fixed. Replaced with
  `optdepends=('jq: filtering for the `query` command')`, which is real.
- New `build()` running `npm install && npm run build`.
- `package()` installs the manifest set with `cp -a` into `/usr/share/ticket-core`, installs +
  `touch`es the bundle, and symlinks `/usr/bin/tk`. `pkgdesc` no longer says "in bash".
- Fixed an inherited bug: it installed `LICENSE`, which does not exist in this repo
  (`LICENSE.md` does), so the licence file was silently missing from the package.

### `scripts/publish-homebrew.sh`

- `depends_on "node"` (per the brief) **and** `depends_on "git"`.
- `desc` no longer says "in bash".
- `def install` now builds, installs the manifest set + `dist/ticket.mjs` into `libexec`,
  `touch`es the bundle, and does `bin.install_symlink libexec/"ticket" => "tk"`. **This was the
  trap the brief flagged and it is fixed.** `node_modules/` is deliberately not installed.
- `test do` now also `git init`s a scratch repo and asserts `tk create` prints `full_path`, so
  `brew test` covers more than the one command that needs no tickets directory.
- Verified by rendering the formula with the real script (clone/push stubbed) and eyeballing
  the output; `bash -n` clean on both publish scripts and on the PKGBUILD.

### `scripts/publish-aur.sh` — still applies, unchanged

It only rewrites `pkgver`/`sha256sums`/`pkgrel` with `sed` on `^`-anchored lines, then copies
the PKGBUILD and generates `.SRCINFO` in an Arch container. All three anchors still exist and
are still single lines. `makepkg --printsrcinfo` reads the new `makedepends`/`optdepends`
fine. No change needed.

### Docs

- **`CLAUDE.md`** — Architecture section rewritten: the bash/awk internals, the `cmd_*` key
  functions, `TS_COMMANDS`/`TS_DEP_SUBCOMMANDS`, the parity-harness paragraph and the
  "reports a missing tickets dir BEFORE the help — pinned behavior" sentence are all gone.
  Replaced by two short paragraphs (the TS CLI, the launcher). The `src/core`/`src/cli` module
  inventory is KEPT — it is stable knowledge and the most useful part of the file. Dependencies
  line corrected. "Releases & Packaging" gained the manifest rule, the build-at-package-time
  rule with its WHY-NOT, and the multi-user callout.
- **`README.md`** — new "Requirements" section: node/git/POSIX shell, jq only for
  `query <filter>`, npm+network for the build, build-on-demand from a checkout vs at install
  time for packages, and the symlink install line.
- **`ORIGINAL_README.md`** — Requirements section rewritten (the old text claimed "a portable
  bash script requiring only coreutils" and ripgrep). Added the warning that copying the
  `ticket` file **alone** no longer works. Install stanzas corrected to the real package name
  `ticket-core`. Testing section now mentions node/npm and the unit tests.
  **The Usage block was stale independently of this ticket** — it was missing several help
  lines and had a wrong `-a` default. Regenerated verbatim from
  `TICKET_INVOKED_AS=tk node dist/ticket.mjs help`, so it is now byte-true.
- **`docs-internal/migration-to-ts-high-level.md`** — see §3.
- **`CHANGELOG.md`** — the TS-port entry rewritten (bash deleted, node required, copying the
  single file no longer works), plus the two behavior changes PHASE_A handed over: the
  owner-approved `Unknown command` change, and symlink resolution as **new** behavior with the
  reason it matters.
- **`THIRD_PARTY_LICENSES.md`** — judged honestly: **no new licences are required.** The bundle
  contains only `src/` plus the Node stdlib (zero runtime deps), and packaged installs do not
  ship `node_modules/`, so esbuild/typescript/@types/node are never redistributed. I added four
  lines recording that finding and the trigger for revisiting it, rather than padding the file
  with licences for code nobody receives.
- **Auto-memory** (`~/.claude/projects/.../memory/MEMORY.md`) — rewritten to post-cutover
  reality: architecture, the packaging constraint above, the manifest, testing, and the
  hard-won mutation-testing lessons (kept; they are the most valuable entries). The bash/awk
  gotchas section was dropped — there is no bash left to trip over. Repo-side `.claude-memory/`
  holds only the generated README explaining the symlink scheme; there is no second copy to
  update here.

---

## 3. The divergence whitelist (PHASE_A item I3 — the blocking doc dependency)

`docs-internal/migration-to-ts-high-level.md` now carries **"Deliberate divergences from bash"**
with entries **1–20, numbering verified in order**. #1–#19 are the text of
`git show 42ccf92^:scripts/parity/README.md`, reproduced **verbatim** (numbering preserved —
9 live comments in `src/`/`test/` cite `#1`, `#3`, `#4`, `#8`, `#9`, `#11`, `#12` by number).

Added per the spec:

- a **preamble** stating the harness is deleted and re-pointing each entry's now-dead "pinned by
  `check_*`" clause at `IMPLEMENTATION_PHASE_A__PUBLIC.md` §2, the folding table;
- **#20**, the unknown-command change, with the owner approval id
  (`nid_fhmxugci00tfkeu3eyeggv6gq_e`) recorded in the whitelist's own sign-off convention —
  closing the reviewer's round-2 carry-forward item 2;
- the approval roster updated to include #20.

The rest of the doc: a STATUS banner at the top (complete; kept for the divergences and the
distribution decision), the "State after T5" section replaced by "State after T6", the parity
paragraph rewritten as a contract summary, dead `TS_DEP_SUBCOMMANDS` text removed, and every
`scripts/parity/README.md` cross-reference retargeted.

**Distribution section rewritten** per the owner decision: build from source, no committed or
attached bundle, explicitly marked as **superseding** the old "commit `dist/ticket.mjs` at
release time" recommendation; the checkout path and the package path spelled out as two
different things; the read-only-prefix evidence recorded as the WHY-NOT; and the
network/devDeps-on-an-end-user-box callout written down where a packager will read it, with the
instruction to file a follow-up ticket rather than quietly re-adding a prebuilt artifact.

---

## 4. Verification, and how

| What | How |
|---|---|
| `make test` | 261 scenarios / 1729 steps, 0 failed (`.tmp/test.log`) — unchanged from PHASE_A |
| `npm test` | 429 tests, 429 pass, 0 fail |
| `make typecheck` | rc 0 |
| BDD steps still read the right files | mutation: dropped `package.json` from the manifest ⇒ 2 wrapper scenarios RED; restored |
| shell syntax | `bash -n scripts/publish-homebrew.sh scripts/publish-aur.sh pkg/aur/ticket-core/PKGBUILD` — all clean |
| generated formula | rendered by running the real `publish-homebrew.sh` with clone/push stubbed; install list interpolated correctly, Ruby eyeballed |
| install layout | full PKGBUILD-sequence simulation on a `chmod -R a-w` prefix (table in §1); plus the negative case proving build-on-demand fails there |
| doc claims are true | `ORIGINAL_README.md` usage block regenerated from the binary's own `help`, so every documented command/flag exists by construction; ripgrep removal verified by `git grep -in ripgrep` / `git grep -nw rg` over the code, not assumed |

`.github/workflows/release.yml` mentions `awk` — checked, as the brief asked. It is the
changelog extractor running on the GitHub runner, not a dependency of the tool. Left alone.

---

## Open items / State

- Working tree **dirty and uncommitted**. Changed: `CHANGELOG.md`, `CLAUDE.md`, `README.md`,
  `ORIGINAL_README.md`, `THIRD_PARTY_LICENSES.md`, `docs-internal/migration-to-ts-high-level.md`,
  `features/steps/ticket_steps.py`, `pkg/aur/ticket-core/PKGBUILD`,
  `scripts/publish-homebrew.sh`. New: `pkg/install-manifest.txt`. No `change_log` entry, ticket
  not closed.
- **For a future packager, the three things that will bite you:** (1) the install prefix is
  read-only, so the bundle MUST be built by the package and `touch`ed last; (2) `src/` is not
  optional — the launcher `_fail`s without it; (3) the install list lives in
  `pkg/install-manifest.txt` and nowhere else.
- **Not done, deliberately:** no prebuilt-bundle release artifact. Called out in three places
  (CLAUDE.md, the migration doc, here) as the thing to revisit *via a ticket* if this ever goes
  multi-user.
- **Unverified by me:** an actual `brew install` / `makepkg` run. Neither toolchain is available
  in this container. The layout and the read-only-prefix behavior are verified by simulation;
  what is not verified is Homebrew/pacman-specific semantics (e.g. whether `brew`'s sandbox
  permits `npm install` reaching the network during `def install` — it does for other
  node-building formulae, but I could not run it here). Worth one real `brew install --build-
  from-source` before the next release tag.
- No `#QUESTION_FOR_HUMAN:` — the one decision that could have needed it (build at package time)
  is inside the owner's stated decision rather than a change to it, and the alternative was
  provably non-functional.
