---
id: nid_zesi8c4t7lyw6jgmqqsjqd54k_e
title: "TS port 3: read commands (ls, ready, blocked, closed, query)"
status: open
deps: [nid_ropjwdm792a5qqyu2u0zeuna1_e]
links: []
created_iso: 2026-07-29T21:57:25Z
status_updated_iso: 2026-07-29T21:57:25Z
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

