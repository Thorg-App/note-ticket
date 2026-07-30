#!/usr/bin/env python3
"""`title_to_filename` parity: the filename bash `create` picks vs `Slug.fromTitle`.

Each title goes into a fresh empty repo, so collision suffixes are out of scope here
and the comparison is purely the slug transform.

WHY no newline in TITLES: this check expects the two sides to AGREE, and a newline is
divergence #11 (bash's line-oriented sed keeps it in the filename). It is pinned in
check_write.py, where a difference is the expected outcome.
"""
import os

from harness import TempRepo

# Case/whitespace folding, punctuation stripping, non-ASCII (bash lowercases bytes,
# so `İ` must NOT become `i`), and the 200-char truncation boundary.
TITLES = [
    "Hello World",
    "Hello   World",
    "  Leading and trailing  ",
    "!!!",
    "Ünïcödé Tïtle",
    "UPPER_snake_case",
    "a/b\\c",
    "Tabs\there",
    "a - b",
    "v1.2.3 release",
    "İ",
    "a" * 250,
    "a" * 199 + " tail",
]


def run():
    failures = 0
    for title in TITLES:
        with TempRepo("parity-slug-") as repo:
            repo.bash("create", title)
            created = sorted(os.listdir(repo.tickets))
            bash_name = created[0] if len(created) == 1 else "<created=%s>" % created
            ts_name = repo.ts("slug", title).strip()
            if bash_name != ts_name:
                failures += 1
                print("MISMATCH slug title=[%r]\n  bash=[%s]\n  ts  =[%s]" % (title, bash_name, ts_name))
    return failures == 0, "titles=%d failures=%d" % (len(TITLES), failures)
