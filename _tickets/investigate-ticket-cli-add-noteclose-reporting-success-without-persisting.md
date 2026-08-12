---
id: nid_j5qv3jof5ldktdnvuwgw5q2ml_e
title: "Investigate ticket CLI add-note/close reporting success without persisting"
status: open
deps: []
links: []
created_iso: 2026-08-12T22:29:44Z
status_updated_iso: 2026-08-12T22:29:44Z
type: task
priority: 2
assignee: CC_WITH-nickolaykondratyev
tags: [tooling]
---

## Summary

`ticket add-note` and `ticket close` both printed their success messages but persisted NOTHING — the ticket file on disk was unchanged and `ticket query` still reported the old state. In the same session, `ticket create` and `ticket query` worked correctly. Success output from mutation commands cannot currently be trusted.

## Environment

- Observed: 2026-08-12, repo `vintrin_appointment-booking-root`, branch `main`, PWD = repo root (`/home/nickolaykondratyev/git_repos/vintrin_appointment-booking-root`).
- Shell: Claude Code Bash tool (non-interactive bash, linux, Fedora kernel 7.1.5-100.fc43). Every invocation runs through the `eai2` wrapper and sources the env stack: `common_env_variables_even_in_zsh.sh`, `common/env_setup.sh`, `top_level_all_L1.sh`, `glassthought-env.sh` (twice), then symlinks zellij config and rewrites the git username to `CC_WITH-nickolaykondratyev`.
- Target ticket: `nid_002fk943aouburdy8o37p2isn_e` at `_tickets/decide-whatsapp-client-phone-verification-mechanism-cost-and-launch-posture.md` (top level, no subfolder, ordinary file).

## Exact repro (as it happened)

One Bash invocation ran both mutations chained:

```bash
ticket add-note nid_002fk943aouburdy8o37p2isn_e "$(cat <<'EOF'
<~2.5 KB multi-paragraph note, unicode (§, →, —), blank lines>
EOF
)" && ticket close nid_002fk943aouburdy8o37p2isn_e
```

Output (after the env-init noise):

```
Note added to nid_002fk943aouburdy8o37p2isn_e
Updated nid_002fk943aouburdy8o37p2isn_e -> closed
```

Verification in FRESH Bash invocations immediately after — all three show nothing persisted:

1. `git status --short` → clean; `git add <file> && git commit` → "nothing to commit, working tree clean".
2. `grep -n "DECIDED (human" _tickets/decide-whatsapp-...md` → no match (note absent from file).
3. `ticket query '. | select(.id=="nid_002fk943aouburdy8o37p2isn_e") | {full_path, status}'` → `status: "open"`, `status_updated_iso` unchanged, `full_path` pointing at the expected (unchanged) file.

## What DID work in the same session

- `ticket create "<title>" -d $'<long description>' --tags tooling -p 2` → file created at `_tickets/`, visible to git, committed fine (it created THIS ticket).
- `ticket query` reads consistently reflect actual file contents.

So reads + create persist; add-note + close do not (at least under this env/invocation shape).

## Hypotheses (unverified)

- Mutation path resolves a different repo root / tickets dir than the read+create path (env stack exports something like a home/base dir pointing at the `/Users/nkondrat/...` mirror tree that exists in this environment).
- CLI writes to a temp copy and the final rename/write is lost or lands elsewhere; success message printed before/regardless of the write result.
- Something in the `eai2` wrapper or sourced env scripts (cwd change, trap, subshell) eats the write while stdout survives.

## Workaround used

Edited the ticket markdown directly (frontmatter `status: closed` + `closed_iso` + appended `## Notes` section) — commits `fb88cd23`, `0c283603`, `9400e4c5`, `fde0ce35` in `vintrin_appointment-booking-root` show the exact format the CLI should have produced.

## Acceptance Criteria

- Root cause identified for add-note/close reporting success without persisting under this environment.
- Mutation commands either persist correctly or exit non-zero with a real error — success output is trustworthy again.
- Repro covered (test or documented manual check) so the silent-success class cannot return.

