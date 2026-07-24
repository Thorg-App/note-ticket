# REVIEWER PRIVATE MEMORY — nested folders review

Round 1 (HEAD `ca810fe`, branch `nested_folders`). Public file:
`.ai_out/nested-folders/nested_folders/IMPLEMENTATION_REVIEW__PUBLIC.md`.

## What I actually ran (all reproducible)

- `mkdir -p .tmp; make test > .tmp/review-test.out 2>&1` → 12 features / 153 scenarios / 1040 steps,
  0 failed. Implementer's numbers confirmed. No /dev/shm plugin failures (plugins gone since `1d31fa0`).
- Extracted old script: `git show 9f8ebdb:ticket > .tmp/ticket_old; chmod +x`.
- `TICKET_SCRIPT=.tmp/ticket_old uv run --with behave behave features/nested_folders.feature`
  → 3 passed / 19 failed. Green-on-old = feature lines **81, 90, 143**. (Behave honors `TICKET_SCRIPT`
  via `get_ticket_script()` — very handy for "would this test have failed before?" checks.)
- Scratch repos under `.tmp/`: `scratch` (5 tickets zebra/alpha/mango/beta/kiwi + 110 bulk closed),
  `symtest/repo` (`_tickets` symlink), `emptychk` (empty tree).

## Confirmed findings (evidence)

1. **B1 symlinked `_tickets` → 0 tickets, exit 0.** `.tmp/symtest`: old lists 4, new lists none.
   Root cause: `find` needs `-L`/`-H` to descend a symlink start point. Fix `find -L`.
2. **B2 ordering regression.** new = zebra,alpha,mango,beta,kiwi (dir order); old = alphabetical.
   `cmd_ls` (ticket:816) and `_file_to_jsonl`/`cmd_query` (ticket:1471) emit in arg order, no sort.
   `ready`/`blocked` DO sort in awk (priority then id) → unaffected. Fix: `| LC_ALL=C sort -z`.
3. **S1 symlinked ticket file** dropped by `-type f` (old found it). Same `-L` fix.
4. **S2/S3 awk-with-no-file-operands reads stdin** → hang. `cmd_show` (ticket:1263) unguarded;
   `recent_files` in `cmd_closed` (ticket:936) unguarded.
5. **S6 hidden dirs traversed**: `_tickets/.trash/x.md` counted (4 → 5).
6. **Exit-2 fix real**: old script in empty tree → exit 2 for ls/ready/blocked/closed/query.
7. **closed cap + mtime order preserved**: 110 closed tickets → newest first (bulk 110,109,108);
   `closed --limit 200` gives identical count (20) old vs new; default limit appears to be 20, the
   100 is a *file* cap not an output cap. Both deviations from the plan are justified.

## Judgement calls I made

- Rated B1/B2 BLOCKING rather than SHOULD-FIX: both are silent, unrequested losses of previously
  working behavior, which the review mandate treats as regressions needing human sign-off.
- Did NOT flag: `title_to_filename` root-only collision check (intentional per ticket), double `find`
  in `show` (documented, cheap), newline-filename gap in `closed` (implementer disclosed, 80/20 OK),
  ARG_MAX with thousands of tickets (pre-existing with the old glob too).
- Test quality overall: honest. No silent fallbacks, no weakened assertions, no removed scenarios
  (131 pre-existing all still present and green). Only weakness is non-discrimination at :81/:90.

## If there is a round 2

Check that the fix is a single change inside `_collect_ticket_files` (`find -L … | LC_ALL=C sort -z`)
— resist per-call-site fixes. Re-run: `make test`, the symlink repro, the 5-ticket ordering repro,
and re-run the feature file against `.tmp/ticket_old` to confirm any strengthened `:81`/`:90`
scenarios now go red on old code.
