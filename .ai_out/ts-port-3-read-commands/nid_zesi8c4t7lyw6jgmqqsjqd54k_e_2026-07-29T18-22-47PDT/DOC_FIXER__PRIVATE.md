# DOC_FIXER — private notes

## Task
R1 from `IMPLEMENTATION_REVIEW_PHASE_B_ROUND2__PUBLIC.md`: two user-facing docs stated the
broken-pipe exit code unconditionally. Docs only; no code/test/harness touched.

## What I measured myself (did not trust the handoff)
Probe scripts (kept): `.tmp/doc_fixer_verify.py`, `.tmp/doc_fixer_verify2.py`. Throwaway git
repo per size, `LC_ALL=C`, `${PIPESTATUS[0]}` of `<cmd> | head -1`, 20 runs per cell. bash side
is a copy of `./ticket` with `TS_COMMANDS=""` (same trick as `scripts/parity/harness.py`), so it
is genuinely the pre-port behavior — bash `ticket` was untouched by this ticket.

`ls | head -1` (my fixtures have longer titles than the reviewer's, so bytes differ; the
*boundaries* reproduce exactly):

```
n=1     bytes=54      bash={0:20}    ts={0:20}
n=3     bytes=162     bash={0:20}    ts={0:20}
n=50    bytes=2700    bash={0:20}    ts={0:20}
n=120   bytes=6480    bash={141:20}  ts={0:20}
n=150   bytes=8100    bash={141:20}  ts={0:20}
n=400   bytes=21600   bash={141:20}  ts={0:20}
n=1000  bytes=54000   bash={141:20}  ts={0:20}
n=2000  bytes=108000  bash={141:20}  ts={141:20}
n=3000  bytes=162000  bash={141:20}  ts={141:20}
```

bash flips between 2700 and 6480 bytes (brackets 4096 = awk's buffer). TS flips between 54000
and 108000 (brackets 65536 = pipe buffer). Deterministic in every cell. Exactly the shape
`scripts/parity/README.md` #7 describes, and it confirms 141 is NOT unconditional: the shipped
CLI exits **0** for any listing under 64 KB, i.e. every real repo today.

`query <filter> | head -1` sweep (old bash vs shipped `tk`):

```
n=1..20   (≤4000 B)   oldbash={0}              tk={0}
n=30      (6000 B)    oldbash={0:5,141:15}     tk={0:6,141:14}
n=50..1000            oldbash={141:20}         tk={141:20}
```

Both sides flip at the same place and are racy in the same band (jq's own buffering — jq is a
real child that really gets signalled, which is why the threshold is jq's, not node's).

## Beyond R1 — the CHANGELOG entry claimed a fix users never needed
`- query <jq-filter> | head (any short reader) now exits 141, as ls | head does, instead of 1`

Old bash `query <filter>` is `echo "$json_output" | jq -c "select(...)"` under `set -o pipefail`
(`ticket:1502`), so its exit code is jq's: **0** for small output, **141** for large. It never
returned 1 — 10 sizes × 20 runs produced only `0` and `141`. The "1" was an intermediate TS
regression inside this same unreleased cycle (review item **S2**, "jq SIGPIPE reported as 1",
fixed by the status→signal→error ordering). CHANGELOG `[Unreleased]` is measured against the
last released bash, and there are no release tags yet, so this bullet documented a
never-shipped regression as a user-facing fix.

I **deleted** the bullet rather than conditioning it. Conditioning would have left "instead of
1", which is false, and "now exits 141" under **Fixed** implies a change that did not happen.
The genuinely useful fact (exit code is size-dependent, `query` included) now lives once, in
README, where it belongs. Flagging the deletion for the human because the reviewer asked for
conditioning, not removal — `git show` recovers it if they disagree.

## Other divergence claims I spot-checked (all TRUE, left alone)
- missing `id` ⇒ `Error: <path> has no 'id' frontmatter field`, rc 1 on `ls`; `dep tree` (still
  bash) does not enforce it — matches CHANGELOG's "the remaining enumerating commands follow".
- `closed --limit=0` ⇒ no output, rc 0. `--limit=abc` / `--limit=2k` ⇒
  `Error: --limit must be a whole number of rows, got '...'`, rc 1.
- `jq` missing ⇒ 127 with the new message (pinned by BDD, not re-run here).
- `|` in title, control characters, symlink mtime, byte-wise path order: no numeric or
  conditional claims to get wrong; left verbatim.

## Verification
`make test` (log `.tmp/doc-fixer-make-test.log`): unit **251 pass / 0 fail**, behave
**12 features, 208 scenarios, 1368 steps, 0 failed**. No BDD step asserts on the old wording
(`grep -rn 141 features/` is empty), so nothing depended on it. `make parity` not re-run:
docs-only change, the harness reads neither file.

No `[[wiki.link]]`, `![[embed]]` or `ap_*_E` identifier exists in either file (checked); nothing
to preserve. No `change_log` entry written, no ticket closed, branch unchanged.
