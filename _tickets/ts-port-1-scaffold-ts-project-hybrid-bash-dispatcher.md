---
id: nid_604l3jerigu3ikyq68958lxy7_e
title: "TS port 1: scaffold TS project + hybrid bash dispatcher"
status: open
deps: []
links: []
created_iso: 2026-07-29T21:57:24Z
status_updated_iso: 2026-07-29T21:57:24Z
type: task
priority: 2
assignee: CC_WITH-nickolaykondratyev
tags: [ts-port]
---

Read docs-internal/migration-to-ts-high-level.md first (the migration plan; strangler-fig strategy).

Scope:
- Create TypeScript project at repo root: package.json (private, ZERO runtime npm deps), strict tsconfig.json, src/cli/main.ts, esbuild bundling to dist/ticket.mjs with a #!/usr/bin/env node shebang and executable bit. Node is pre-installed on target systems, never bundled.
- Modify the bash script ./ticket: add a TS_COMMANDS variable and a delegation block ahead of the builtin case dispatch: when $1 is listed in TS_COMMANDS, exec node "$SCRIPT_DIR/dist/ticket.mjs" "$@". Resolve SCRIPT_DIR from BASH_SOURCE (script location), NOT from PWD.
- Port the help command as the pipeline proof: output must be byte-identical to cmd_help in ./ticket (it interpolates basename of the invoked script; match that).
- Makefile: add build target (esbuild bundle); make test must build first, then run behave.
- CI (.github/workflows): install Node, build the bundle, run the BDD suite.

Acceptance: make test fully green with help present in TS_COMMANDS. Removing a name from TS_COMMANDS must instantly roll a command back to bash.

