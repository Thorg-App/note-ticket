---
closed_iso: 2026-07-30T05:20:35Z
id: nid_zesi8c4t7lyw6jgmqqsjqd54k_e
title: "TS port 3: read commands (ls, ready, blocked, closed, query)"
status: closed
deps: [nid_ropjwdm792a5qqyu2u0zeuna1_e, nid_n6eavbm0h77twvna8k9nnpu2g_e]
links: []
created_iso: 2026-07-29T21:57:25Z
status_updated_iso: 2026-07-30T05:20:35Z
type: task
priority: 2
assignee: CC_WITH-nickolaykondratyev
tags: [ts-port]
---

Read docs-internal/migration-to-ts-high-level.md first. Reference: cmd_ls, cmd_ready, cmd_blocked, cmd_closed, cmd_query in ./ticket. Port each to src/cli/commands/ on top of src/core/, flip it into TS_COMMANDS in the bash ./ticket dispatcher, and keep make test green after every flip.

Parity notes (contractual even where BDD is thin):
- Output formats exactly: printf "%-8s" style padding, [status] brackets, deps rendered as [id1, id2], ready/blocked sorted by priority then id, blocked shows only unresolved blockers after <-.
- Flags: --status=X, -a / --assignee=X, -T / --tag=X on ls/ready/blocked/closed; --limit=N on closed.
- closed: mtime-sorted newest first, scan capped at 100 files, --limit (default 20) applied after; missing priority defaults to 2.
- query: emit JSONL via the shared core serializer - frontmatter key order preserved, full_path appended LAST, surrounding double quotes stripped from values, backslash and quote JSON escaping; optional jq filter is passed through by spawning the external jq binary (interface parity - jq stays an external dependency).
- Empty tickets dir: read commands error if the dir does not exist; exist-but-empty returns success with no output.

Acceptance: all five commands served by TS via TS_COMMANDS, full BDD suite green.


## Notes

**2026-07-30T00:06:31Z**

BDD scenario to ship with this ticket (from nid_n6eavbm0h77twvna8k9nnpu2g_e, now DONE in TS core): a `_tickets/*.md` file with no `id` frontmatter field must make the flipped enumerating command fail with stderr `Error: <path> has no 'id' frontmatter field` and a non-zero exit. Core throws `MissingTicketIdError` (src/core/id.ts) from `TicketStore.load`; the CLI adds the `Error: ` prefix. Cover missing key, empty value, and no-frontmatter-at-all.

**2026-07-30T05:20:35Z**

RESOLVED. Acceptance met and independently verified: TS_COMMANDS is now
"help --help -h ls list ready blocked closed query" — all five read commands are TS-served, each flipped
separately with the BDD suite green in between.

Final suites (re-run by the orchestrator at HEAD): make test rc 0 — 12 features, 208 scenarios, 1368 steps,
0 failed. make parity rc 0 — graph 69 scenarios / 0 failures with 7 pinned divergence checks, query OK,
slug OK. 251 unit tests, typecheck clean.

Flow: 2 implementation phases (A: ls/ready/blocked, B: closed/query), each reviewed and iterated to
convergence; 11 Phase-B findings all verified fixed by the reviewer in a round-2 gate. Changelog entry
cxk8fn8aune3o55xalost4tp3.

Bugs fixed beyond the port itself:
- query emitted invalid JSON for control characters (bash's own `query .id` died inside jq).
- Broken-pipe deaths surfaced as exit 1 (spawnSync reports both signal SIGPIPE and error EPIPE; the error
  was read first). Now 141, matching bash at both ends of the output-size range.
- closed sorted symlinked tickets by the target's mtime; GNU `ls -t` lstats operands, so it uses the link's.
- The parity harness invoked ./ticket, which execs the TS bundle for ported commands — it was about to
  compare TS against TS. Its bash side now has TS_COMMANDS emptied, and make parity depends on make build.

Seven declared divergences (parity whitelist + migration doc + a pinning test each): `|` in title,
--limit= plain counts only, --limit=0 deterministic (bash was racy: 35x141 / 25x0 over 60 identical runs),
bad --limit= on an empty dir, control-char escaping, missing jq -> 127, and the mid-size broken-pipe band.

Follow-ups: nid_7opxnvhia4a2ty7o0k9t6z4bl_e (deferred NITs), nid_z10hpj927zqilxcpl9ycpe0ad_e (CRLF files
fail with a misleading no-'id' error — tagged `decide`, needs a human call), nid_94f11043dhpk198dj9e6gr6pn_e
(make parity not in CI; raised to P1 after measuring that the scan cap, --limit ordering and full_path
position are invisible to make test).

Artifacts: .ai_out/ts-port-3-read-commands/nid_zesi8c4t7lyw6jgmqqsjqd54k_e_2026-07-29T18-22-47PDT/
