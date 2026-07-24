# REVIEWER PRIVATE MEMORY — nested folders review

Public file: `.ai_out/nested-folders/nested_folders/IMPLEMENTATION_REVIEW__PUBLIC.md`
(now holds the Iteration 2 review; iteration 1's text was replaced per instruction).

## Round 1 (HEAD `ca810fe`) — kept for context

- 2 BLOCKING (B1 symlinked `_tickets` → 0 tickets; B2 `ls`/`query` order regressed to FS order),
  6 SHOULD-FIX (S1 symlinked ticket file, S2 `cmd_show` unguarded array, S3 `recent_files` unguarded,
  S4 two non-discriminating scenarios, S5 `2>/dev/null`, S6 hidden dirs), 4 NICE-TO-HAVE.
- Useful lever: `TICKET_SCRIPT=<path> uv run --with behave behave features/...` runs the suite against
  any script version → "would this test have failed before?" in one command.

## Round 2 (HEAD `2ae226a`) — what I actually ran

- `make test` → 12 features / 167 scenarios / 1137 steps, 0 failed (`.tmp/review2-test.out`).
- `git show ca810fe:ticket > .tmp/ticket_it1` → feature file against it: exactly
  `:196 :206 :213 :220 :230 :240` fail (the 6 substantive new scenarios). The 6 stdin scenarios pass
  there too → first smell.
- **Mutation test** (`.tmp/ticket_noguard` = HEAD minus the `cmd_ls` guard and the `recent_files`
  guard): all 36 scenarios still pass. Then proved the mutant really hangs:
  `timeout 8 bash -c 'sleep 300 | ../ticket_noguard ls'` → exit 124, while
  `Popen(stdin=PIPE); communicate()` completes instantly. **Root cause: `communicate()` closes the
  child's stdin when stdin is `subprocess.PIPE`** → the "live pipe" claim is false.
- Proposed fix verified in `.tmp/hangprobe.py`: `os.pipe()` + parent holds write end +
  `start_new_session=True` + `os.killpg` on timeout → mutant TIMED OUT, HEAD completes. The naive
  `process.kill()` variant **deadlocks** (awk survives holding stdout) — I hit that live.
- `.tmp/probe2.sh` → `.tmp/probe2.out`, 10 scratch repos: A symlinked `_tickets` OK; B path order
  `alpha, backend/zebra, beta, kiwi, mango`, md5-identical across runs; C hidden dir pruned incl. its
  non-hidden subtree; D dot-named `TICKETS_DIR` works (`-mindepth 1` is load-bearing); E **hidden `.md`
  FILE still listed** → docs say "non-hidden .md" (S7); F newline-in-filename survives `sort -z`;
  G permission-denied now on stderr, rest lists, exit 0; H symlink loop → find warning, no hang;
  I dangling `_tickets` symlink → clean `does not exist`, exit 1.

## Portability adjudication (the assigned priority risk)

macOS `sort` is BSD sort (`text_cmds`) and **does** document `-z, --zero-terminated` (macOS man page
dated 2015-03-19, identical wording in FreeBSD sort(1)). macOS `find(1)` documents `-L`, `-mindepth`,
`-prune`, `-print0`, `-name`, and `-L` makes `-type f` report the target's type. → NOT blocking.
Precedence check: `(-mindepth 1 -a -name '.*' -a -type d -a -prune) -o (-type f -a -name '*.md'
-a -print0)`; `-mindepth` is "always true" so it doesn't break the left conjunction, and it's first in
the expression so GNU emits no global-option warning.

## Judgement calls

- Rated B3 (vacuous stdin scenarios) BLOCKING even though it is test-only: CLAUDE.md treats
  can't-fail tests as lies, and the plan doc asserts a property the harness does not have.
  Said plainly in the verdict that **no product-code blocker remains**.
- S7 is doc wording only → SHOULD-FIX, not blocking.
- Did NOT re-flag: double `find` in `show`, `closed` newline limitation (now commented), macOS CI gap
  (suggested as a follow-up ticket).

## If there is a round 3

Only two things to check: (1) the stdin step really holds the write fd + killpg — re-run
`TICKET_SCRIPT=.tmp/ticket_noguard behave features/nested_folders.feature` and expect **failures**;
(2) README/ORIGINAL_README/`ticket help` wording on hidden `.md` files. Everything else is signed off.
