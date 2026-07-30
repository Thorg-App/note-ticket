# IMPLEMENTATION_ITERATION — Phase A review response

Responding to `IMPLEMENTATION_REVIEW__PUBLIC.md` (verdict READY, no BLOCKING findings).
Commits this round: **`f165d98`** (code/tests/docs), **`736fd10`** (follow-up ticket).

## Disposition per finding

| # | Finding | Disposition | Notes |
|---|---------|-------------|-------|
| — | BLOCKING | none raised | — |
| 1 | Undeclared `|`-in-title divergence in `ready`/`blocked` | **INCORPORATED** | Reproduced independently against the pinned bash copy before acting. Declared in 5 places (below). |
| 2 | Parity generator titles hide every metacharacter | **INCORPORATED (adapted)** | `harness.HOSTILE_TITLES` added; `|` deliberately NOT among them — see rationale below. |
| 3 | Two user-error rendering channels in `main.ts` | **INCORPORATED** | `CliError` gained `detailLines` + `stderrText`; `StoreResolver` throws; `StoreResolution` deleted. |
| 4 | CRLF files hard-fail with a misleading message | **INCORPORATED as ticket** | `nid_z10hpj927zqilxcpl9ycpe0ad_e`, tags `ts-port, core, decide`, deps on this T3 ticket. Not fixed here — root cause is core frontmatter parsing and touching it risks the byte-exact round-trip guarantee. |
| NIT | `ticket-row.ts` "byte for byte" claim vs UTF-16 padding | **INCORPORATED** | Claim softened to ASCII ids, with a WHY-NOT on `ID_COLUMN_WIDTH` explaining the byte-vs-UTF-16 gap and why it is unreachable via `create`. |
| NIT | `limitText` is dead until Phase B | **REJECTED** | Phase B (`closed`/`query`) is the immediately next unit of work on this same ticket, and `closed`'s `--limit=` is the sole reason the shared parser exists. Deleting and re-adding it in the next commit is pure churn, and the field is documented as `closed`-only. Reconsider only if Phase B is abandoned (noted in PRIVATE). |
| NIT | Harness compares stdout, ignores exit codes | **INCORPORATED** | `check_graph` now compares `rc=<code>\n<stdout>` for every CLI invocation; `check_query._check_jsonl` compares return codes before diffing bytes and reports TS stderr on a mismatch. Agreed this strengthens every later phase. |
| NIT | `TicketRow.withStatus` documented as `closed`-specific | **INCORPORATED** | Now "the row `closed` prints and `withDeps` builds on". |

## Finding #1 — what was verified and how it is now pinned

Reproduced, not taken on trust: title `Pipe|Title` with `deps: [bbb2]`, pinned bash copy vs TS —

```
bash ready:    bbb2  [P2][open] - Plain                    # truncated at the pipe
TS   ready:    bbb2  [P2][open] - Plain | pipes [and] ...
bash blocked:  aaa1  [P1][open] - Pipe <- Title            # title tail where blockers go
TS   blocked:  aaa1  [P1][open] - Pipe|Title <- [bbb2]
```

Cause: `ticket:905` / `ticket:1068` `sprintf("%s|%s|%s|%s", prio, id, status, title)` then
`split(…, "|")`. `ls` packs no sort key and was verified byte-identical, so the divergence is
scoped to `ready`/`blocked`. TS is the correct side; only the declaration was missing.

Now declared/pinned in: 3 unit tests, 2 BDD scenarios, `CHANGELOG.md` **Fixed**,
whitelist #3 in `scripts/parity/README.md`, the porting checklist in
`docs-internal/migration-to-ts-high-level.md`, and a `TicketRow` class-doc DIVERGENCE note.

## Finding #2 — one adaptation, stated explicitly

The reviewer's example list included `a | b`. I excluded `|` from `HOSTILE_TITLES` and pinned it
separately instead: a pipe in a generated title would make the `ready`/`blocked` byte-compare fail
on a divergence we *want*, which would either force ready/blocked out of the byte-compare (losing
real coverage) or force the bash bug back in. So: everything else hostile goes through the
byte-compare (`"`, `\`, `:`, `[]`, non-ASCII, trailing space — written exactly as bash `create`
writes them, so every one is a reachable input), and `|` is pinned by
`check_graph._check_pipe_title_divergence`, which fails if EITHER side changes its mind.

Bonus finding from doing this: I ran every hostile title through real bash `create` and diffed
bash-vs-TS `ls`/`ready`. All byte-identical — so the predecessor's declared divergence #3
(`": "` truncation) is **not** reachable through `create` for titles. `|` is the only title
metacharacter that actually diverges.

## Non-vacuity of the new protections (mutation-tested, each restored after)

| Mutation in `dist/ticket.mjs` | Result |
|---|---|
| title-unescaping in the `ls` row | graph **207** byte failures — the old `T <id>` fixture had no backslashes at all and would have reported 0 |
| truncate title at `|` in the `ready`/`blocked` row | byte failures **0**, and `_check_pipe_title_divergence` FAILS alone — exactly the "restore the bash bug" regression it guards |
| the 2 new BDD scenarios against `TICKET_SCRIPT=.tmp/ticket-bash-only` | 2 failed / 29 skipped |

## Files touched

- `src/cli/cli-error.ts` — `detailLines` + `stderrText`; the one place that adds `Error: `
- `src/cli/store-resolver.ts` — returns `TicketStore`, throws `CliError`; `StoreResolution` gone
- `src/cli/main.ts` — `Cli.read` shrunk to store-open + write; `userFacingFailure` adopts `MissingTicketIdError`
- `src/cli/ticket-row.ts` — comment accuracy (padding, `withStatus`) + DIVERGENCE note
- `test/list-commands.test.ts` — +5 tests (3 pipe-title, 2 `CliError` rendering)
- `features/ticket_listing.feature` — +2 scenarios (pipe title in `ready`, in `blocked`)
- `scripts/parity/harness.py` — `HOSTILE_TITLES`, `PIPE_TITLE`, `write_scenario(title_template=…)`
- `scripts/parity/check_graph.py` — exit-code comparison, `_check_pipe_title_divergence`
- `scripts/parity/check_query.py` — exit-code comparison
- `scripts/parity/README.md`, `CHANGELOG.md`, `docs-internal/migration-to-ts-high-level.md`
- `_tickets/crlf-ticket-files-hard-fail-…-no-id-error.md` — new follow-up ticket

Untouched: `ticket` (bash), `src/core/` (still CLI-free), the three command classes.

## Final numbers — my own runs

| Check | Result |
|---|---|
| `make typecheck` | exit 0 |
| `make unit-test` | **207 pass / 0 fail** (was 202; +5) |
| `make test` | 12 features, **192 scenarios, 0 failed**, 1272 steps (was 190) |
| `make parity` | graph **68 scenarios / 0 failures** (+ pinned: 19 bash bogus cycles, pipe-title as designed); query OK (8 JSONL lines identical); slug OK (13 titles) |

Tree clean, both commits on `nid_zesi8c4t7lyw6jgmqqsjqd54k_e_2026-07-29T18-22-47PDT`.

## Disagreements needing arbitration

One, minor and already stated above: the `limitText` NIT is **rejected** on churn grounds. Nothing
else — findings #1–#4 were valid and are addressed as the reviewer asked (with the #2 adaptation
explained rather than silently applied).

## Signal

**READY** for convergence.
