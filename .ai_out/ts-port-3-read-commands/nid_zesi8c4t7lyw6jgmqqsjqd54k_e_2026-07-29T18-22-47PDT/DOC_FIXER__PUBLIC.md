# DOC_FIXER — R1 (docs only)

Scope kept to `README.md` and `CHANGELOG.md [Unreleased]`. No code, test, or parity-harness file
touched. `scripts/parity/README.md` #7 was treated as the source of truth and is unchanged.

## README.md — conditioned (R1)

**Before**

> Piping a listing into a short reader (`tk ls | head -1`) exits 141, the usual code for a
> command killed by SIGPIPE.

**After**

> Piping a listing into a short reader (`tk ls | head -1`, `tk query ... | head -1`) exits
> 141, the usual code for SIGPIPE, only once the output is large enough that the write
> actually fails. A listing that fits in the pipe buffer is written before the reader goes
> away and exits 0, so the exit code depends on how many tickets were listed.

Qualitative, per instruction — no byte thresholds restated; the measurement table stays in the
parity README.

## CHANGELOG.md — bullet REMOVED, not conditioned (please read)

**Before** (under `### Fixed`)

> - `query <jq-filter> | head` (any short reader) now exits 141, as `ls | head` does, instead of 1

Conditioning it was not enough, because **"instead of 1" is false**: old bash `query <filter>`
is `echo "$json_output" | jq -c "select(...)"` under `set -o pipefail` (`ticket:1502`), so it
returns *jq's* code — 0 for small output, 141 for large. Across 10 sizes × 20 runs it produced
only `0` and `141`, never `1`. The `1` was an intermediate TS regression inside this same
unreleased cycle (review item **S2**), so the bullet documented a never-shipped regression as a
user-facing fix. With "instead of 1" gone, "now exits 141" under **Fixed** still implies a change
that did not happen, so the honest edit is removal. The useful fact (size-dependence, `query`
included) now lives once, in README.

This is a deviation from the reviewer's prescription ("condition the 141 statements") — calling
it out for a human. `git show` restores the line if you disagree.

## Verified empirically (not taken on faith)

Throwaway git repo per size, `LC_ALL=C`, `${PIPESTATUS[0]}` of `<cmd> | head -1`, 20 runs per
cell. bash side = a copy of `./ticket` with `TS_COMMANDS=""` (the harness's own trick), which is
genuinely pre-port since bash `ticket` was untouched.

`ls | head -1` — bash flips 0→141 between **2700 and 6480 bytes** (brackets awk's 4096 buffer);
TS flips between **54000 and 108000** (brackets the 64 KB pipe buffer); both ends agree
(0/0 at ≤2700 B, 141/141 at ≥108000 B). Deterministic in every cell. Different byte figures from
the reviewer's only because my fixture titles are longer — the *boundaries* reproduce exactly, so
divergence #7 holds as written, and the shipped CLI really does exit **0** for every listing
under 64 KB.

`query <filter> | head -1` — old bash and shipped `tk` agree everywhere: `0` up to 4000 B, a
racy band at 6000 B (`{0:5,141:15}` vs `{0:6,141:14}` — jq's own buffering; jq is a real child
that really is signalled), `141` from 10000 B up.

## Checked beyond R1 — nothing else was wrong

Re-verified the other user-facing divergence claims in both files; all TRUE, left verbatim:
missing-`id` hard error and its "remaining commands follow" caveat, `closed --limit=0` ⇒ rc 0,
`--limit=abc`/`--limit=2k` ⇒ the new error at rc 1, jq-missing ⇒ 127, `|`-in-title, control
characters, symlink mtime, byte-wise path order. No `[[wiki.link]]`, `![[embed]]` or `ap_*_E`
identifier exists in either file, so nothing to preserve.

## Suite

`make test` → unit **251 pass / 0 fail**; behave **12 features, 208 scenarios, 1368 steps, 0
failed**. `grep -rn 141 features/` is empty, so no BDD step depended on the old wording. Log:
`.tmp/doc-fixer-make-test.log`. `make parity` not re-run — docs-only, the harness reads neither
file.

No `change_log` entry written, no ticket closed, branch unchanged, tree clean.
