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
| `dump.ts` | Thin entrypoint rendering `src/core` output in bash's exact format, for commands the shipped CLI does not serve yet; bundled to `dist-parity/dump.mjs` |
| `harness.py` | Throwaway repo, command runners, scenario generators, pinned bash reference |
| `check_graph.py` | `ls`/`ready`/`blocked` (every filter flag) + `dep tree[ --full]` byte-compare, `dep cycle` semantic check |
| `check_query.py` | `query` JSONL byte-compare + the missing-`id` divergence |
| `check_slug.py` | `title_to_filename` vs `Slug.fromTitle` |
| `run.py` | Runs all checks; exit 1 on any unexpected mismatch |

## The bash side is a pinned copy, not `./ticket`

`./ticket` exec's the TS bundle for every command named in its `TS_COMMANDS`, so calling it
directly would compare TS against TS the moment a command is ported — a harness that can no
longer fail. `harness.py` therefore runs a copy of the script with `TS_COMMANDS` emptied
(`BashReference`, materialized under `$REPO/.tmp` because the system temp dir may be
`noexec`). Nothing in the shipped script changes.

The TS side of a check is the **real CLI** (`dist/ticket.mjs`) for every ported command, and
`dump.mjs` only for the rest; a command's `dump.ts` mode is deleted when it is ported, so no
output format is ever described in two places. `make parity` depends on `make build` for
exactly this reason.

## Whitelisted divergences

Byte-comparison is the default; the following are deliberate and are *pinned* instead, so
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
3. **A `|` in a title, for `ready`/`blocked`** — bash packs its sort key as
   `prio|id|status|title` and `split()`s it back apart, so it truncates the title at the
   first pipe (and `blocked` prints the rest of the title where the blockers belong).
   Reachable through `tk create "a | b"`, so it is a real input class. TS prints the title
   whole; `check_graph._check_pipe_title_divergence` pins both sides. `ls` is unaffected and
   IS byte-compared. Remove this whitelist at T6, when bash is gone.

Because of #3, `harness.HOSTILE_TITLES` — the titles every generated scenario cycles
through so the byte-compare sees `"`, `\`, `:`, `[]`, non-ASCII and a trailing space —
deliberately contains no `|`.

## Lifetime

Delete `scripts/parity/`, the `parity` make target, `build:parity`, and the
`dist-parity/` ignore entry at **T6 cutover** — once bash `ticket` is gone there is
nothing left to diff against.
