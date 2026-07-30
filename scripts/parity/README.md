# bash-vs-TS differential parity harness

Migration-only test tooling. It generates ticket graphs in throwaway git repos, runs
both bash `./ticket` and the TS `src/core` over the *same* tickets dir, and compares
the output. Parity with bash is the contract for the port, and this harness verifies
it empirically instead of by reading the two implementations side by side — the way
it was originally built during T2, where it caught two divergences that code reading
had missed.

```bash
make parity                              # ~70 graph scenarios + query + slug
make parity PARITY_ARGS="--random 500"   # more generated graphs
make parity PARITY_ARGS="--seed 42"      # different graphs; failures are reproducible
```

## Layout

| File | Role |
|------|------|
| `dump.ts` | Thin entrypoint rendering `src/core` output in bash's exact format; bundled to `dist-parity/dump.mjs` |
| `harness.py` | Throwaway repo, command runners, scenario generators |
| `check_graph.py` | `ready`, `blocked`, `dep tree[ --full]` byte-compare + `dep cycle` semantic check |
| `check_query.py` | `query` JSONL byte-compare + the missing-`id` divergence |
| `check_slug.py` | `title_to_filename` vs `Slug.fromTitle` |
| `run.py` | Runs all checks; exit 1 on any unexpected mismatch |

## Whitelisted divergences

Byte-comparison is the default; these two are deliberate and are *pinned* instead, so
the harness still fails if either side changes its mind.

1. **`dep cycle`** — bash aborts its DFS on the first cycle and leaves nodes marked
   "visiting", so it prints paths that are not cycles and misses real ones (19 bogus
   cycles over the default scenario set). Diffing bytes would pin a bug, so both sides
   are checked semantically instead: every cycle the TS core reports must be a real
   closed walk, and no cyclic graph may come back empty. Remove this whitelist when T4
   (`nid_fba92yfczp71jjcprn4ufmory_e`) flips `dep cycle` to TS.
2. **A `.md` under `_tickets/` with no `id`** — bash silently skips it; the TS core
   fails naming the file (`nid_n6eavbm0h77twvna8k9nnpu2g_e`, an intentional behavior
   change: a corrupt repo must not be silently under-reported).

## Lifetime

Delete `scripts/parity/`, the `parity` make target, `build:parity`, and the
`dist-parity/` ignore entry at **T6 cutover** — once bash `ticket` is gone there is
nothing left to diff against.
