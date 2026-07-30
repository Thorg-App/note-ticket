# bash-vs-TS differential parity harness

Migration-only test tooling. It generates ticket graphs in throwaway git repos, runs
both bash `./ticket` and the TS `src/core` over the *same* tickets dir (over two
identical copies of it, for the write commands), and compares the output — and, for a
write, the resulting file bytes.
Parity with bash is the contract for the port, and this harness verifies
it empirically instead of by reading the two implementations side by side — the way
it was originally built during T2, where it caught two divergences that code reading
had missed.

```bash
make parity                              # ~70 graph scenarios + query + slug + write
make parity PARITY_ARGS="--random 500"   # more generated graphs
make parity PARITY_ARGS="--seed 42"      # different graphs; failures are reproducible
```

## Layout

| File | Role |
|------|------|
| `dump.ts` | Thin entrypoint rendering `src/core` output in bash's exact format; only the `slug` mode is left, and it compares the PURE title-to-filename functions (see below) |
| `harness.py` | Throwaway repo, command runners, scenario generators, pinned bash reference |
| `check_graph.py` | `ls`/`ready`/`blocked`/`closed` (every filter flag) + `dep tree[ --full]` byte-compare, `dep cycle` and `show` semantic checks, pinned `closed` divergences, `closed` scan cap / mtime ties / symlink mtime / default limit, `ls \| head -1` exit code, the `show` and id-resolution divergences |
| `check_query.py` | `query` JSONL byte-compare (bare and through jq), the empty-tickets-dir short-circuit, `query <filter> \| head -1` exit code, and the missing-`id` and control-character divergences |
| `check_slug.py` | `title_to_filename` vs `Slug.fromTitle` |
| `check_write.py` | `create` and `status`/`start`/`close`/`reopen`: transcript + FILE BYTES compared after running each side on identical fresh repos |
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

`slug` is the one exception, and deliberately so: `create` is ported (T5), but the check
diffs bash `title_to_filename` against `Slug.fromTitle` — the two PURE functions — rather
than driving `tk create` on both sides. WHY: a `create` invocation also emits a random id and
a timestamp and can only be observed one title per repo, so the function-level diff is
strictly finer-grained and cheaper for the exact same property. It is not a second
description of an output format; there is no format, only a filename.

## Write commands: compared by FILE BYTES (`check_write.py`)

A write command's contract is not its stdout, it is what it leaves on disk. `check_write.py`
therefore creates two identical throwaway repos, runs the same command sequence with the
pinned bash copy in one and the shipped `./ticket` in the other, and compares a transcript of
`rc` + stdout + stderr for every command **plus every byte of every file under `_tickets/`**.
Frontmatter key order, `closed_iso`'s insertion position, the slug picked for a colliding
title, the JSON line and every usage string are all inside that comparison.

Each dumped entry also records **whether it is still a symlink** and what it points at. That is
not decoration: bash appended a note with `>>`, which writes THROUGH a link, while a
write-then-rename would leave a regular file in its place. Both sides dereference the link when
read, so without the marker the difference would be invisible. `Case(symlinks={...})` creates
one; the two cases that use it pin that `add-note` appends through the link on both sides and
that a frontmatter edit (`close`) replaces it on both sides.

Only the two things that cannot match by construction are neutralized — generated ids become
`<ID1>`, `<ID2>`, … (consistently, so a reference to an earlier ticket still has to line up)
and ISO timestamps become `<TS>`. Nothing else is masked. `create`'s default assignee comes
from `git config user.name`, so each repo sets that value itself rather than inheriting the
developer's or CI's global config.

A case may declare `diverges=True`, which INVERTS the expectation: the two sides must differ,
and the check fails loudly if they ever agree again. That is how the write-command entries of
the whitelist below (#5, #9, #10, #11, #12, #13, #14, #15, #16, #17) are pinned rather than
merely described.

Every write command is now diffed. What is NOT reachable here is any behavior gated on a
terminal: the runners give the child pipes, so `edit` always takes its "print the path" arm and
`add-note` always takes its read-stdin arm (with an empty note). The editor arm and the
"no note provided" arm are pinned by `test/edit-command.test.ts` /
`test/add-note-command.test.ts`, which can say that both streams are terminals.

**A green run of this check only proves the LISTED cases agree.** Mutation-tested with 8
breakages of the `create`/`status` path (`closed_iso` never written, a new frontmatter field
appended instead of prepended, tags not re-spaced, the git-config assignee default dropped,
`--parent` not expanded, `Updated <typed id>`, `.trim()` on git's output, slug collisions
ignored), with 18 of the `dep`/`undep`/`link`/`unlink` path (table in
`.ai_out/ts-port-5-write-commands/**/IMPLEMENTATION_PHASE_B__PUBLIC.md`) and with 15 of the
`add-note`/`edit` path (table in `…/IMPLEMENTATION_PHASE_C__PUBLIC.md`) — all turn a gate
red. Note that "rewrite the file instead of appending" is caught by **one** case only, the
symlinked one: for a regular file the two are byte-identical. Extend `CASES` when a fix depends on an input shape that is not there yet; that lesson
was learned the expensive way with `dep tree` and duplicate `deps`.

One shape is deliberately absent: `link a b c` on three UNLINKED tickets. bash appends the
missing ids with awk's `for (id in need)`, i.e. in hash order, so the result is neither
reliably equal to nor reliably different from TS's argument order (see #18). The multi-ticket
case that IS compared is the one where every file gains exactly one id.

## Whitelisted divergences

Byte-comparison is the default; the following are deliberate and are *pinned*
instead, so the harness still fails if either side changes its mind.

Every entry that CHANGES user-visible behavior rather than merely picking an order bash left
unspecified has owner sign-off: #9 on `nid_5g3eta9cf7yi6iukmscxma6wc_e`, #8's duplicate-row
removal on `nid_qxt3z5unr9k220aqttbw84a6a_e`, and #6, #10, #11, #12 and #17 approved as shipped
on 2026-07-30 (`nid_r3mp6uylht7t77iwxtuqvhxv2_e`). Nothing here is pending a decision.

1. **`dep cycle`** — bash aborts its DFS on the first cycle and leaves nodes marked
   "visiting", so it prints paths that are not cycles and misses real ones (19 bogus
   cycles over the default scenario set). Diffing bytes would pin a bug, so both sides
   are checked semantically instead: every cycle the TS core reports must be a real
   closed walk, and no cyclic graph may come back empty. T4 flipped `dep cycle` to TS and
   BDD scenarios in `features/ticket_dependencies.feature` now pin the TS behavior on both
   halves of the bug — the points-into-a-cycle shape (exactly one cycle, no bogus second) and
   three cycles overlapping in one ticket (all 3 found). The whitelist stays until T6, because until then
   there is still a buggy bash implementation on the other side of the diff.
2. **A `.md` under `_tickets/` that is not a usable ticket** — bash tolerates it (skipped, or
   emitted as an id-less JSON record); the TS core fails naming the file
   (`nid_n6eavbm0h77twvna8k9nnpu2g_e`, an intentional behavior change: a corrupt repo must
   not be silently under-reported). TS distinguishes three causes, and
   `check_query._check_missing_id_divergence` pins the message of each: no frontmatter block,
   a block with no `id`, and a CRLF file — whose `---\r` is not the fence, so it is rejected for
   its LINE ENDINGS rather than for the `id` it visibly contains
   (`nid_z10hpj927zqilxcpl9ycpe0ad_e`; CRLF ticket files stay unsupported).
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
   bash's output stays invalid and TS's stays valid, and `check_write`'s
   `DIVERGENCE #5 tab in title` pins it at the point where the value is BORN — the JSON line
   `create` itself prints.
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
   implementation must pick one). The DUPLICATE-ROW REMOVAL is a deliberate behavior change,
   approved by the owner on 2026-07-30 (`nid_qxt3z5unr9k220aqttbw84a6a_e`); it was not covered
   by the id-resolution decision ticket, which is #9 only.
9. **`dep tree`'s root id, and an empty id anywhere** — bash's `cmd_dep_tree` resolved its
   root with its own awk scan matching by SUBSTRING, so a full id contained in another
   ticket's id came back "ambiguous" and that tree was unreachable, while untrimmed input
   matched nothing. Separately, awk's `index(s, "")` is 1, so an EMPTY id matched every
   ticket and resolved to the only one in a single-ticket repo — `tk show "$UNSET_VAR"`
   printed an arbitrary ticket. Both were confirmed as bugs by the owner
   (`nid_5g3eta9cf7yi6iukmscxma6wc_e`): `dep tree` now resolves through the shared
   `IdResolver` (exact beats partial, input trimmed) and an empty id matches nothing.
   BDD scenarios pin the TS side; `check_graph._check_id_resolution_divergences` pins that
   bash really did behave the other way, and `check_write`'s `DIVERGENCE #9 empty id` pins
   that an empty id now mutates NOTHING where bash closed the only ticket in the repo.
   bash's error WORDING for a `dep tree` root is reproduced exactly
   (`Error: ticket <id> not found`, unquoted — unlike `ticket_path`'s).

10. **`create` with a value-taking flag at the end of the argument list** (`tk create x
   --design`) — bash dereferenced `"$2"` under `set -u` and died with the shell's own
   `./ticket: line 308: $2: unbound variable`, which names a line of the script and tells the
   user nothing about what to type instead. TS exits 1 with `Error: option '--design'
   requires a value`. Pinned by a scenario in `features/ticket_creation.feature` and by
   `check_write`.
11. **A NEWLINE in a `create` title** — bash's `title_to_filename` is a `sed` pipeline, which
   is line-oriented, so the LF survived every substitution (and the per-line `s/^-//; s/-$//`
   ran twice): `tk create $'line1\nline2'` created a file literally named `line1<LF>line2.md`
   and printed a JSON line that does not parse (`"title":"\"line1","line2\"":""`). TS drops
   the newline like any other byte outside `[a-z0-9-]`, giving `line1line2.md`, and
   `JSON.stringify` escapes it in the title. Pinned by `check_write`
   (`DIVERGENCE #11 newline in title`) and commented on `Slug.fromTitle`.
   `check_slug.TITLES` deliberately does NOT contain a newline: that check compares the two
   implementations expecting agreement, so the case belongs where divergence is expected.
12. **`_tickets/<slug>.md` already exists as a DIRECTORY** — bash tested `[[ -f ]]`, false for
   a directory, so it redirected its `create` output INTO the directory and died with
   `Is a directory` at exit 1. TS's `TicketStore.topLevelFileExists` asks whether the NAME is
   taken at all, picks `<slug>-1.md` and succeeds. Pinned by `check_write`
   (`DIVERGENCE #12 …`) and commented on `topLevelFileExists`.

13. **`deps` and `links` are id ARRAYS, not text** — bash tested membership with
   `echo "$deps" | grep -q "$id"` and removed with `sed "s/, *$id//g; s/$id, *//g; s/$id//g"`,
   i.e. on the raw array text. So an id that merely OCCURS inside a recorded one counted as
   already present (`dep` refused to add it, `undep`/`unlink` claimed to find it), and a
   removal cut the text out of the middle of its neighbour: `[t-1, t-111]` minus `t-1` became
   `[11]`, silently destroying a dependency and inventing a dangling one. The id was also a
   `grep`/`sed` REGEX, so a `.` in it matched any character. TS compares and removes whole
   array elements and re-serializes the array canonically (`[a, b]`), which additionally
   normalizes hand-written spacing. A NON-array scalar value is normalized the same way — TS
   reads `deps: foo` as the single element `foo` and writes `deps: [foo, <id>]`, where bash
   printed `Added dependency: …` and changed nothing at all, because its insert was
   `sed "s/\]/, $dep_id]/"` and a scalar has no `]` to append before (measured). Reachable with hand-written or legacy ids — this repo's
   own tickets used `task-0001`-style ids before the fixed-length `nid_` scheme. Pinned by
   three `check_write` cases and by BDD scenarios in `ticket_dependencies.feature` /
   `ticket_links.feature`.
14. **`dep`/`undep` on a ticket with no `deps:` field** — bash read the field through
   `yaml_field`, whose `grep` finds nothing, and that failing pipeline aborted the command
   under `set -euo pipefail`: exit 1, no message on either stream, nothing written. TS treats
   a missing field as an empty relation, so `dep` creates `deps: [<id>]` (as the first
   frontmatter entry, where bash's own insert would have put it) and `undep` prints
   `Dependency not found` with exit 1. Two `check_write` cases and two BDD scenarios.
15. **`link` on a ticket with no `links:` field** — bash's awk only ever REWROTE an existing
   `^links:` line, so such a ticket gained no link at all, contributed 0 to the count, and
   `tk link a b` could report the flatly misleading `All links already exist`. TS creates the
   field. One `check_write` case, one BDD scenario.
16. **`link`/`dep`/`undep` edits are confined to the frontmatter block** — bash's awk matched
   `/^links:/` and its `sed` matched `^deps:` ANYWHERE in the file, so a `links:`/`deps:` line
   in the BODY (a note, a fenced example) was rewritten too, and for `link` even counted:
   a body line made `tk link a b` report 3 added links instead of 2. Two `check_write` cases —
   both `diverges=True`, which asserts only that the two sides DIFFER and can therefore never
   pin what TS does; the TS side is pinned by the `ticket_links.feature` scenario "A links line
   in the body is neither counted nor rewritten" (count stays 2, the body line stays
   `links: [ghost]`). Kept honest by mutation: making the frontmatter block swallow the body
   fails that scenario and only that scenario.
17. **`link` with an argument list naming one ticket twice** — bash treated the repeat as
   another ticket to link, so `tk link a a` recorded `a` in its own `links` and reported
   `Added 1 link(s) between 2 tickets`. TS collapses arguments that resolve to the same
   ticket and refuses a set that collapses to one, with
   `Error: nothing to link: every id resolves to ticket <id>` at exit 1. A repeat that does NOT
   collapse the set changes the reported counts instead of failing: `tk link a a b` is
   `Added 2 link(s) between 2 tickets` here and was `Added 3 link(s) between 3 tickets` in bash.
   One `check_write` case, two BDD scenarios (the refusal and the count).
   WHY only `link` and not `dep`: a `links` entry has no graph semantics, so a ticket linked to
   itself is inert data; a `deps` self-edge is a real graph error that `dep cycle` reports, so
   `tk dep a a` is still recorded exactly as bash recorded it. The asymmetry is approved (see
   above).
18. **The ORDER in which `link` appends missing ids** — bash appended them with awk's
   `for (id in need)`, whose order is unspecified and differs between awk builds (measured
   `[c, b]` for `link a b c` under this machine's awk). TS appends in the order the user named
   the tickets. Not pinnable by the harness in either direction, for exactly that reason; the
   TS order is pinned by a unit test on `LinkClosure` and by a BDD scenario asserting the
   whole `links` value.

19. **An `$EDITOR` that is not on PATH** (`tk edit x` with a terminal on both streams) — both
   sides exit **127**, but bash left the message to the SHELL while TS prints
   `Error: nosucheditor: command not found`. Only the exit code is stable on the bash side: the
   shell printed `./ticket: line 1509: nosucheditor: command not found` (naming a line of the
   script) for a value containing a slash or a space, and NOTHING at all for a bare name when
   the shell had a `command_not_found_handle` installed — so do not pin bash's wording here. The same trade as #6, and now made in ONE place
   (`src/cli/spawned-child.ts`) for `jq`, `$PAGER` and `$EDITOR`. **The harness cannot see this
   at all**: the editor is launched only when stdin AND stdout are terminals, and every runner
   here uses pipes. Pinned by `test/edit-command.test.ts` ("exits 127 naming the editor when it
   is not on PATH"). That file is also the only pin for the rest of the launch arm, one test
   each: the adopted editor exit code, the ticket path reaching the child as its argument, and
   a multi-word `$EDITOR` being looked up as ONE filename (so `EDITOR="code -w"` exits 127
   rather than starting `code`). Those three drive the REAL `spawnSync`; a test that only
   asserts what `Editor.configured` RETURNS does not pin the spawn site.

Because of #3, `harness.HOSTILE_TITLES` — the titles every generated scenario cycles
through so the byte-compare sees `"`, `\`, `:`, `[]`, non-ASCII and a trailing space —
deliberately contains no `|`. For the same reason it contains no tab (#5) and no newline
(#11).

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
