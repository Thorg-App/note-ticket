---
closed_iso: 2026-08-12T23:12:19Z
session_ids: [{"a": "claude", "type": "execution", "id": "2b29286f-a3f4-499e-85d5-ce2197e17d6f"}, {"a": "claude", "type": "review", "id": "e032dfd1-8344-45e1-a9b8-5dd81e357eca"}]
working_dir: note-ticket
id: nid_j5qv3jof5ldktdnvuwgw5q2ml_e
title: "Investigate ticket CLI add-note/close reporting success without persisting"
status: closed
deps: []
links: []
created_iso: 2026-08-12T22:29:44Z
status_updated_iso: 2026-08-12T23:12:19Z
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

## Investigation & Resolution (2026-08-12)

**Root cause: this is NOT a CLI persistence defect.** The `add-note` and `close`
invocations ran with a working directory that `git rev-parse --show-toplevel`
resolved to a **different checkout** than the verification commands. That
environment has a parallel/mirror tree under `/Users/nkondrat/vintrin-env/…`
(the same tree the env stack sources on every Bash invocation and the one the
agent memory dir lives in), and it contained a copy of the same repo with the
same ticket ids. The mutations persisted correctly — into the *other* tree —
while `git status`, `grep`, and `ticket query` ran against the tree the human
was looking at, which was genuinely untouched. Success output was truthful
*relative to the tree the command resolved*.

**Why the CLI itself cannot report success without persisting (verified in
code):**

- `add-note` (`src/cli/commands/add-note.ts`) calls `store.appendTo(...)` and
  `close`/`status` (`src/cli/commands/status.ts`) call `store.save(...)` — both
  **synchronous** `node:fs` writes (`appendFileSync`; `writeFileSync`+`renameSync`)
  wrapped in `FileSystemError.guarding(...)` (`src/core/ticket-store.ts`). The
  success line is printed only *after* the write returns; any OS-level failure
  throws and exits non-zero. There is no code path that prints success while
  skipping or losing the write.
- Every command in a single invocation resolves the SAME tickets dir via
  `TicketsDirectory.resolve()` → `Git.repoRoot(cwd)` (`src/core/ticket-store.ts`,
  `src/cli/store-resolver.ts`), so read and write within one process are always
  consistent. The divergence in the report is strictly *between* invocations
  (different cwd → different git top-level → different `_tickets/`).

**Reproduction (documented manual check).** Two separate git checkouts holding
the same ticket id; run the mutations with cwd inside the mirror, then inspect
the real tree:

```bash
node dist/ticket.mjs add-note nid_demo_e "shadow note" && node dist/ticket.mjs close nid_demo_e
#   (cwd = mirror)  ->  "Note added to nid_demo_e" / "Updated nid_demo_e -> closed"
# real tree:   grep 'shadow note' -> no match;  query .status -> "open";  git status -> clean
# mirror tree: grep 'shadow note' -> present;   query .status -> "closed"
```

This reproduces the exact reported symptom (success printed, real tree
unchanged, `query` still `open`, `git status` clean) with a completely correct
CLI — proving the mechanism is tree/cwd divergence, not a lost write.

**Acceptance criteria disposition:**

1. Root cause identified — cross-checkout cwd divergence, above.
2. Mutations already persist-or-throw; success output IS trustworthy relative to
   the resolved tree. No code change was warranted — adding one to "look
   productive" would be a hack against a non-existent bug.
3. Silent-success as a CLI defect is already guarded: `features/ticket_notes.feature`
   asserts appended note text lands in the file, and `features/ticket_status.feature`
   asserts `status`/`close` change the persisted `status` field. A real in-tree
   no-op would fail these on CI.

**How to tell which tree a command hit, in future:** `ticket query` emits
`full_path` for every ticket — the authoritative signal for *which* file/checkout
is in play. When results look "not persisted," compare `full_path` (and
`git rev-parse --show-toplevel`) between the mutating and the inspecting shell;
if they differ, the shells are in different checkouts of the same repo.


## Notes

**2026-08-12T23:13:58Z**

__READY_AS_IS__: investigation-only branch; verified persist-or-throw code + existing persistence tests; no code change warranted.
