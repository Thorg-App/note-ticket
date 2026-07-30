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
| `dump.ts` | Thin entrypoint rendering `src/core` output in bash's exact format, for commands the shipped CLI does not serve yet (only `slug` is left); bundled to `dist-parity/dump.mjs` |
| `harness.py` | Throwaway repo, command runners, scenario generators, pinned bash reference |
| `check_graph.py` | `ls`/`ready`/`blocked`/`closed` (every filter flag) + `dep tree[ --full]` byte-compare, `dep cycle` and `show` semantic checks, pinned `closed` divergences, `closed` scan cap / mtime ties / symlink mtime / default limit, `ls \| head -1` exit code, the `show` and id-resolution divergences |
| `check_query.py` | `query` JSONL byte-compare (bare and through jq), the empty-tickets-dir short-circuit, `query <filter> \| head -1` exit code, and the missing-`id` and control-character divergences |
| `check_slug.py` | `title_to_filename` vs `Slug.fromTitle` |
| `run.py` | Runs all checks; exit 1 on any unexpected mismatch |

## The bash side is a pinned copy, not `./ticket`

`./ticket` exec's the TS bundle for every command named in its `TS_COMMANDS`, and `cmd_dep`
does the same for the subcommands in `TS_DEP_SUBCOMMANDS`, so calling it directly would
compare TS against TS the moment a command is ported — a harness that can no longer fail.
`harness.py` therefore runs a copy of the script with **both** lists emptied
(`BashReference`, materialized under `$REPO/.tmp` because the system temp dir may be
`noexec`). Nothing in the shipped script changes. Each list must appear exactly once, or
`BashReference` refuses to build: a delegation switch that quietly stops being disabled
would hollow out every check below it.

The TS side of a check is the **real CLI** (`dist/ticket.mjs`) for every ported command, and
`dump.mjs` only for the rest; a command's `dump.ts` mode is deleted when it is ported, so no
output format is ever described in two places. `make parity` depends on `make build` for
exactly this reason.

## Whitelisted divergences

Byte-comparison is the default; the following nine are deliberate and are *pinned*
instead, so the harness still fails if either side changes its mind.

1. **`dep cycle`** — bash aborts its DFS on the first cycle and leaves nodes marked
   "visiting", so it prints paths that are not cycles and misses real ones (19 bogus
   cycles over the default scenario set). Diffing bytes would pin a bug, so both sides
   are checked semantically instead: every cycle the TS core reports must be a real
   closed walk, and no cyclic graph may come back empty. T4 flipped `dep cycle` to TS and
   BDD scenarios now pin the TS behavior; the whitelist stays until T6, because until then
   there is still a buggy bash implementation on the other side of the diff.
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

8. **`show`'s computed sections** — bash builds Blocking and Children by iterating an awk
   associative array, whose order is UNSPECIFIED (measured: neither path nor id order), and
   appends one Blocking row per matching `deps` ENTRY, so a ticket naming the target twice is
   printed twice. TS uses enumeration (path) order and lists each ticket once.
   `check_graph._show_mismatches` therefore byte-compares the echoed FILE and the section
   HEADINGS in order, and compares the rows within a section as a sorted MULTISET —
   except `## Blocking`, the only section with the count divergence, which is compared as a
   sorted SET so the `duplicate-dep*` scenarios do not trip it; `_check_show_duplicate_blocking`
   pins that duplicate-row difference by COUNT. Deduplicating every section instead was
   measured to hide a real `show` regression (a `[...new Set(ids)]` row dedup shipped green),
   so keep the dedup narrow. The `Blockers` and `Linked` sections are `deps`/`links` order on
   both sides, duplicate entries included — both sides repeat the row.
   **Approval status:** the ORDER half needs none (bash's order is unspecified, so any
   implementation must pick one). The DUPLICATE-ROW REMOVAL is a deliberate behavior change
   that is **shipped but PENDING HUMAN SIGN-OFF** — ticket `nid_qxt3z5unr9k220aqttbw84a6a_e`
   (tagged `decide`). It is NOT covered by the id-resolution decision ticket, which is #9 only.
9. **`dep tree`'s root id, and an empty id anywhere** — bash's `cmd_dep_tree` resolved its
   root with its own awk scan matching by SUBSTRING, so a full id contained in another
   ticket's id came back "ambiguous" and that tree was unreachable, while untrimmed input
   matched nothing. Separately, awk's `index(s, "")` is 1, so an EMPTY id matched every
   ticket and resolved to the only one in a single-ticket repo — `tk show "$UNSET_VAR"`
   printed an arbitrary ticket. Both were confirmed as bugs by the owner
   (`nid_5g3eta9cf7yi6iukmscxma6wc_e`): `dep tree` now resolves through the shared
   `IdResolver` (exact beats partial, input trimmed) and an empty id matches nothing.
   BDD scenarios pin the TS side; `check_graph._check_id_resolution_divergences` pins that
   bash really did behave the other way. bash's error WORDING for a `dep tree` root is
   reproduced exactly (`Error: ticket <id> not found`, unquoted — unlike `ticket_path`'s).

Because of #3, `harness.HOSTILE_TITLES` — the titles every generated scenario cycles
through so the byte-compare sees `"`, `\`, `:`, `[]`, non-ASCII and a trailing space —
deliberately contains no `|`. For the same reason it contains no tab (#5).

Not whitelisted because it is unreachable in practice, but worth knowing: for ticket files
with *identical* mtimes, bash `ls -t` breaks the tie with `strcoll`, i.e. the caller's
locale, while TS compares bytes. The harness runs both sides under `LC_ALL=C`, where the two
agree, and `check_graph._check_closed_mtime_tie` byte-compares that case.

## Requirements

`node`, `python3`, `git`, GNU coreutils, and **`jq`** (`query <filter>` spawns the real `jq` on
both sides — without it both exit 127 with empty output, and the run goes red with three
misdiagnoses, none naming jq: "fixture drift" from the row-count minimums, `rc=127 ... expected
141` from the broken-pipe check, and a "changed" control-character divergence. `run.py` refuses to
start so the message names jq).

## Lifetime

Delete all of the following at **T6 cutover** — once bash `ticket` is gone there is
nothing left to diff against:

- `scripts/parity/`
- the `parity` make target and the `build:parity` npm script
- the `dist-parity/` ignore entry
- the **`Run bash-vs-TS parity harness` step in `.github/workflows/test.yml`**
