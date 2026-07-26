---
id: nid_icb354bq2iqx0ro7qfy0eaq7u_e
title: "Fix over-escaped double quotes in create/query JSONL title field"
status: open
deps: []
links: []
created_iso: 2026-07-26T04:14:33Z
status_updated_iso: 2026-07-26T04:14:33Z
type: bug
priority: 2
assignee: CC_WITH-nickolaykondratyev
---

A title containing a double quote (e.g. `A "quoted" title`) is stored correctly in frontmatter as title: "A \"quoted\" title", but the JSONL emitted by create/query renders it as \\\" which JSON-parses back to a literal backslash + quote. Root cause: the backslash already present in the frontmatter value is doubled by the JSON escaper, and the frontmatter-level escaping is not unescaped first. Add a BDD scenario asserting create output JSON round-trips a quoted title exactly.

