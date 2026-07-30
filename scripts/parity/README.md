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
| `check_graph.py` | `ls`/`ready`/`blocked`/`closed` (every filter flag) + `dep tree[ --full]` byte-compare, `dep cycle` semantic check, pinned `closed` divergences, `closed` scan cap / mtime ties / symlink mtime / default limit, `ls \| head -1` exit code |
| `check_query.py` | `query` JSONL byte-compare (bare and through jq), the empty-tickets-dir short-circuit, `query <filter> \| head -1` exit code, and the missing-`id` and control-character divergences |
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

Byte-comparison is the default; the following seven are deliberate and are *pinned*
instead, so the harness still fails if either side changes its mind.

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

4. **`closed --limit=` with anything but a plain count** — bash forwarded the raw text to
   `head -n`, so it accepted `+N`, size suffixes (`2k` = 2048) and negative values meaning
   "all but the last N", reported `head: invalid number of lines` for a typo, and for
   `--limit=0` exited **0 or 141 racily** (whether `awk` writes before `head` closes the
   pipe; measured flipping on identical input). TS accepts a plain decimal count and rejects
   the rest with exit 1 — including in an empty tickets dir, where bash returned before
   `head` ever ran and so ignored the typo. `check_graph._check_closed_limit_divergences`
   pins both sides.
5. **A control character in a frontmatter value, for `query`** — bash's `json_escape`
   handles `\` and `"` only, so a raw tab (reachable via `tk create $'a\tb'`) lands inside a
   JSON string and makes the line unparseable; bash's own `query <filter>` then dies inside
   jq. TS uses `JSON.stringify`. `check_query._check_control_character_divergence` pins that
   bash's output stays invalid and TS's stays valid.
6. **`query <filter>` with no `jq` on PATH** — both sides exit **127**, the shell's code for
   a missing binary, but bash printed the shell's own `./ticket: line NNN: jq: command not
   found`, which names a line of the script. TS prints `Error: jq: command not found` plus
   `Install jq, or run 'query' without a filter`. Only the message differs; the exit code and
   the fact that `query` without a filter still works are pinned by BDD scenarios (the PATH is
   stripped of `jq` alone), not by the harness, because the harness compares text.
7. **The exit code when the reader of stdout goes away** (`tk ls | head -1`) — node ignores
   SIGPIPE, so the CLI reports 128+SIGPIPE itself. bash's code was NOT a property of the
   command but of its output size: `awk` writes in ~4 KB chunks and is killed as soon as
   `head` exits, so bash exited 0 up to ~4 KB of output and 141 above it, while node writes
   in one go and only fails past the 64 KB pipe buffer. Measured with 2/50/120 tickets (both
   sides 0), 200/400 (bash 141, TS 0) and 3000 (both 141). The band in between is the
   divergence; reproducing it would mean reproducing awk's internal chunking.
   `check_graph._check_broken_pipe_exit_code` pins the two ends (3000 tickets ⇒ 141 on both,
   one ticket ⇒ 0 on both) and `check_query._check_query_broken_pipe` pins the `jq` case,
   where the child really is signalled and both sides say 141.

Because of #3, `harness.HOSTILE_TITLES` — the titles every generated scenario cycles
through so the byte-compare sees `"`, `\`, `:`, `[]`, non-ASCII and a trailing space —
deliberately contains no `|`. For the same reason it contains no tab (#5).

Not whitelisted because it is unreachable in practice, but worth knowing: for ticket files
with *identical* mtimes, bash `ls -t` breaks the tie with `strcoll`, i.e. the caller's
locale, while TS compares bytes. The harness runs both sides under `LC_ALL=C`, where the two
agree, and `check_graph._check_closed_mtime_tie` byte-compares that case.

## Lifetime

Delete `scripts/parity/`, the `parity` make target, `build:parity`, and the
`dist-parity/` ignore entry at **T6 cutover** — once bash `ticket` is gone there is
nothing left to diff against.
