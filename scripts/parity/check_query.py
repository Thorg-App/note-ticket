#!/usr/bin/env python3
"""`query` JSONL parity: byte-for-byte, including escaping and frontmatter key order.

Tickets are created through bash `./ticket create` (so the frontmatter is exactly what
bash writes) plus hand-written edge cases bash's create cannot produce.
"""
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
        bash = repo.bash_result("query")
        ts = repo.ts_result("query")
        # bash emits a bare blank line for such a file (no JSON record) -- hence strip().
        bash_skips = bash.returncode == 0 and bash.stdout.strip() == ""
        if bash_skips and ts.returncode != 0 and path in ts.stderr:
            return True, "missing-id: bash skips, TS fails naming the file (as designed)"
        return False, (
            "missing-id divergence changed: bash rc=%d out=[%s] / ts rc=%d stderr=[%s]"
            % (bash.returncode, bash.stdout.strip(), ts.returncode, ts.stderr.strip()[:200])
        )


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

        bash, ts = repo.bash_result("query"), repo.ts_result("query")
        if bash.returncode != ts.returncode:
            return False, "query exit codes differ (bash=%d ts=%d, ts stderr=[%s])" % (
                bash.returncode,
                ts.returncode,
                ts.stderr.strip()[:200],
            )
        bash_out, ts_out = bash.stdout, ts.stdout
        if bash_out == ts_out:
            return True, "query JSONL identical (%d lines)" % len(bash_out.splitlines())

        for bash_line, ts_line in zip(bash_out.splitlines(), ts_out.splitlines()):
            if bash_line != ts_line:
                print("MISMATCH query\n  --- bash ---\n%s\n  --- ts ---\n%s" % (bash_line, ts_line))
        return False, "query JSONL differs (bash=%d lines ts=%d lines)" % (
            len(bash_out.splitlines()),
            len(ts_out.splitlines()),
        )


def run():
    results = [_check_jsonl(), _check_missing_id_divergence()]
    ok = all(passed for passed, _summary in results)
    return ok, "; ".join(summary for _passed, summary in results)
