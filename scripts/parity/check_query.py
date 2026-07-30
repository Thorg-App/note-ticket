#!/usr/bin/env python3
"""`query` JSONL parity: byte-for-byte, including escaping and frontmatter key order.

Tickets are created through bash `./ticket create` (so the frontmatter is exactly what
bash writes) plus hand-written edge cases bash's create cannot produce.
"""
import json
import os
import shutil

from harness import TempRepo

# Titles/flags chosen for the escaping and field-coverage traps: quotes, backslashes,
# non-ASCII, and every optional frontmatter field.
CREATE_ARGS = [
    ["A normal title"],
    ['Title with "quotes"'],
    ["Backslash C:\\path here"],
    ["Tagged", "--tags", "ui,backend"],
    ["Prio", "-p", "0", "-t", "bug", "-a", "Some One", "--external-ref", "gh-1"],
    ["Unicode Ünïcödé"],
    ["Nested"],
]

# A colon inside a quoted title and list-valued deps -- shapes bash `create` never writes.
EDGE_FILES = {
    "edge.md": '---\nid: nid_edge_e\ntitle: "a: b"\nstatus: open\ndeps: [x, y]\nlinks: []\n'
    "created_iso: 2026-01-01T00:00:00Z\n---\n\nbody\n",
}

MISSING_ID_FILE = "nofm.md"

# The bare command plus the jq passthrough: the filter is spawned as external `jq` on both
# sides, so its output, its "nothing selected" empty success and its exit code 3 for a syntax
# error must all match. The `--flag` cases pin bash's arg loop, where the LAST argument wins
# and nothing is treated as a flag.
QUERY_INVOCATIONS = [
    ["query"],
    ["query", ""],
    ["query", '.status == "open"'],
    ["query", ".tags | length > 0"],
    ["query", ".nosuchfield"],
    ["query", "syntax((("],
    ["query", "--pretty", ".id"],
    ["query", ".id", "--pretty"],
]

# A tab in a title: reachable through `tk create $'a\tb'`, and bash emits it RAW inside the
# JSON string, which is invalid JSON that jq itself refuses to read.
TAB_TITLE_FILE = "tabbed.md"
TAB_TITLE_CONTENT = '---\nid: nid_tab_e\ntitle: "tab\there"\nstatus: open\n---\n'


def _check_control_character_divergence():
    """Whitelisted divergence: bash does not escape control characters, so its JSONL is invalid.

    `json_escape` in bash's `_file_to_jsonl` handles `\\` and `"` only. TS uses
    `JSON.stringify`, so the line parses. Pinned: bash's output must stay unparseable and TS's
    must stay parseable, and bash's own `query <filter>` must keep failing where TS succeeds.
    """
    with TempRepo("parity-query-ctrl-") as repo:
        with open(os.path.join(repo.tickets, TAB_TITLE_FILE), "w") as f:
            f.write(TAB_TITLE_CONTENT)
        bash, ts = repo.bash_result("query"), repo.ts_cli_result("query")
        problems = []
        if _parses_as_json(bash.stdout):
            problems.append("bash JSONL now parses: [%r]" % bash.stdout)
        if not _parses_as_json(ts.stdout):
            problems.append("TS JSONL does NOT parse: [%r]" % ts.stdout)
        if repo.bash_result("query", ".id").returncode == 0:
            problems.append("bash `query .id` now succeeds on a raw control character")
        if repo.ts_cli_result("query", ".id").returncode != 0:
            problems.append("TS `query .id` now fails on a control character")
        if problems:
            return False, "control-character divergence changed: " + "; ".join(problems)
        return True, "control chars: bash emits invalid JSON, TS escapes them (as designed)"


def _parses_as_json(jsonl):
    try:
        for line in jsonl.splitlines():
            json.loads(line)
    except ValueError:
        return False
    return True


def _check_missing_id_divergence():
    """Whitelisted divergence: a `.md` with no `id` is skipped by bash, fatal in TS.

    Deliberate (nid_n6eavbm0h77twvna8k9nnpu2g_e): silently omitting a ticket from every
    listing hides a corrupt repo. Pinned here rather than byte-compared, so the day
    either side changes its mind the harness says so.
    """
    with TempRepo("parity-missing-id-") as repo:
        path = os.path.join(repo.tickets, MISSING_ID_FILE)
        with open(path, "w") as f:
            f.write("no frontmatter here\n")
        bash, ts = repo.bash_result("query"), repo.ts_cli_result("query")
        # bash emits a bare blank line for such a file (no JSON record) -- hence strip().
        bash_skips = bash.returncode == 0 and bash.stdout.strip() == ""
        if bash_skips and ts.returncode != 0 and path in ts.stderr:
            return True, "missing-id: bash skips, TS fails naming the file (as designed)"
        return False, (
            "missing-id divergence changed: bash rc=%d out=[%s] / ts rc=%d stderr=[%s]"
            % (bash.returncode, bash.stdout.strip(), ts.returncode, ts.stderr.strip()[:200])
        )


# Enough tickets that the JSONL exceeds the 64 KB pipe buffer, so jq really is killed by
# SIGPIPE rather than finishing before `head -1` closes the pipe.
BROKEN_PIPE_TICKET_COUNT = 3000
BROKEN_PIPE_RC = 141  # 128 + SIGPIPE


def _check_query_broken_pipe():
    """`query <filter> | head -1` exits 141 on both sides.

    bash's pipeline reported jq's SIGPIPE death; the TS side spawns the same jq, so it must
    pass 128+signal through instead of flattening it to a generic 1. `tk query … | head` is
    an everyday invocation, and nothing else in the harness runs either side into a short
    reader.
    """
    with TempRepo("parity-query-pipe-") as repo:
        for index in range(BROKEN_PIPE_TICKET_COUNT):
            with open(os.path.join(repo.tickets, "bp%04d.md" % index), "w") as f:
                f.write('---\nid: bp%04d\ntitle: "Ticket %04d"\nstatus: open\n---\n' % (index, index))
        bash, ts = repo.bash_head_rc("query", ".id != null"), repo.ts_cli_head_rc("query", ".id != null")
        if bash != ts:
            return False, "query <filter> | head -1 exit codes differ (bash=%d ts=%d)" % (bash, ts)
        if bash != BROKEN_PIPE_RC:
            return False, "query <filter> | head -1 rc=%d on both sides, expected %d" % (bash, BROKEN_PIPE_RC)
        return True, "query <filter> | head -1 exits %d on both sides" % BROKEN_PIPE_RC


# Nothing to enumerate: bash returns BEFORE it ever reaches jq, so even an unparseable filter
# succeeds. Without this the guard in QueryCommand can be deleted with every suite still green.
EMPTY_REPO_INVOCATIONS = [
    ["query", "syntax((("],
    ["query", ".id"],
    ["query"],
]


def _check_empty_repo():
    """An empty tickets dir short-circuits before jq, whatever the filter says."""
    with TempRepo("parity-query-empty-") as repo:
        for args in EMPTY_REPO_INVOCATIONS:
            bash, ts = repo.bash_result(*args), repo.ts_cli_result(*args)
            if (bash.returncode, bash.stdout) != (ts.returncode, ts.stdout):
                return False, "empty-repo %r differs (bash rc=%d out=%r / ts rc=%d out=%r stderr=[%s])" % (
                    args,
                    bash.returncode,
                    bash.stdout,
                    ts.returncode,
                    ts.stdout,
                    ts.stderr.strip()[:200],
                )
            if bash.returncode != 0:
                return False, "empty-repo %r no longer succeeds in bash (rc=%d)" % (args, bash.returncode)
        return True, "empty tickets dir succeeds before jq over %d invocations" % len(EMPTY_REPO_INVOCATIONS)


def _check_jsonl():
    with TempRepo("parity-query-") as repo:
        for args in CREATE_ARGS:
            repo.bash("create", *args)
        # Nesting exercises the recursive walk and path ordering.
        os.makedirs(os.path.join(repo.tickets, "sub"))
        shutil.move(
            os.path.join(repo.tickets, "nested.md"), os.path.join(repo.tickets, "sub", "nested.md")
        )
        for name, content in EDGE_FILES.items():
            with open(os.path.join(repo.tickets, name), "w") as f:
                f.write(content)

        lines = 0
        for args in QUERY_INVOCATIONS:
            bash, ts = repo.bash_result(*args), repo.ts_cli_result(*args)
            if bash.returncode != ts.returncode:
                return False, "query %r exit codes differ (bash=%d ts=%d, ts stderr=[%s])" % (
                    args,
                    bash.returncode,
                    ts.returncode,
                    ts.stderr.strip()[:200],
                )
            bash_out, ts_out = bash.stdout, ts.stdout
            if bash_out != ts_out:
                for bash_line, ts_line in zip(bash_out.splitlines(), ts_out.splitlines()):
                    if bash_line != ts_line:
                        print("MISMATCH query %r\n  --- bash ---\n%s\n  --- ts ---\n%s"
                              % (args, bash_line, ts_line))
                return False, "query %r JSONL differs (bash=%d lines ts=%d lines)" % (
                    args,
                    len(bash_out.splitlines()),
                    len(ts_out.splitlines()),
                )
            lines += len(bash_out.splitlines())
        return True, "query identical over %d invocations (%d lines)" % (len(QUERY_INVOCATIONS), lines)


def run():
    results = [
        _check_jsonl(),
        _check_empty_repo(),
        _check_query_broken_pipe(),
        _check_missing_id_divergence(),
        _check_control_character_divergence(),
    ]
    ok = all(passed for passed, _summary in results)
    return ok, "; ".join(summary for _passed, summary in results)
