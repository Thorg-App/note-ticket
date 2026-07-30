#!/usr/bin/env python3
"""Shared plumbing for the bash-vs-TS differential parity checks.

Every check builds throwaway git repos, runs bash `./ticket` and the TS `dump.mjs`
against the same tickets dir, and compares. Nothing here knows about a specific
command -- see check_graph.py / check_query.py / check_slug.py.
"""
import os
import random
import shutil
import subprocess
import tempfile

REPO = os.path.dirname(os.path.dirname(os.path.dirname(os.path.abspath(__file__))))
TICKET = os.path.join(REPO, "ticket")
DUMP = os.path.join(REPO, "dist-parity/dump.mjs")


class TempRepo:
    """A git-initialized throwaway repo with a `_tickets/` dir, removed on exit."""

    def __init__(self, prefix):
        self._prefix = prefix

    def __enter__(self):
        self._root = tempfile.mkdtemp(prefix=self._prefix)
        self.tickets = os.path.join(self._root, "_tickets")
        os.makedirs(self.tickets)
        subprocess.run(["git", "init", "-q", self._root], check=True)
        return self

    def __exit__(self, *_exc):
        shutil.rmtree(self._root, ignore_errors=True)

    def write_scenario(self, scenario):
        for tid, status, deps, prio in scenario:
            with open(os.path.join(self.tickets, tid + ".md"), "w") as f:
                f.write(
                    '---\nid: %s\ntitle: "T %s"\nstatus: %s\ndeps: [%s]\npriority: %s\n---\n'
                    % (tid, tid, status, ", ".join(deps), prio)
                )

    def bash(self, *args):
        return self.bash_result(*args).stdout

    def ts(self, *args):
        return self.ts_result(*args).stdout

    def bash_result(self, *args):
        return self._run([TICKET] + list(args))

    def ts_result(self, *args):
        return self._run(["node", DUMP] + list(args))

    def _run(self, cmd):
        env = dict(os.environ, TICKETS_DIR=self.tickets)
        return subprocess.run(cmd, env=env, capture_output=True, text=True, cwd=self.tickets)


def require_dump():
    """Loud failure beats silently 'passing' with no TS side to compare against."""
    if not os.path.exists(DUMP):
        raise SystemExit("Missing %s -- run `make parity` (or `npm run build:parity`)" % DUMP)


# Hand-picked graph shapes: the structures where bash's dep traversal is most
# likely to differ (shared subtrees, cycles, dangling deps, uneven depth).
FIXED_SCENARIOS = [
    ([("a", "open", ["b"], "2"), ("b", "open", ["c"], "2"), ("c", "open", [], "2")], "chain"),
    ([("a", "open", ["b", "c"], "2"), ("b", "open", [], "2"), ("c", "open", [], "2")], "fan"),
    ([("a", "open", ["b", "d"], "2"), ("b", "open", ["d"], "2"), ("d", "open", [], "2")], "diamond"),
    ([("a", "open", ["b"], "2"), ("b", "open", ["a"], "2")], "cycle2"),
    ([("a", "open", ["a"], "2")], "selfloop"),
    ([("a", "open", ["b"], "2"), ("b", "open", ["c"], "2"), ("c", "open", ["b"], "2")], "tail-into-cycle"),
    ([("a", "open", ["ghost"], "2")], "dangling"),
    ([("a", "open", ["b", "c"], "2"), ("b", "open", ["d"], "2"), ("c", "open", [], "2"),
      ("d", "open", [], "2")], "uneven"),
]


def random_scenarios(count, seed):
    """Deterministic pseudo-random graphs -- a failure is always reproducible."""
    rnd = random.Random(seed)
    for i in range(count):
        ids = ["n%d" % k for k in range(rnd.randint(2, 6))]
        scenario = [
            (
                tid,
                rnd.choice(["open", "open", "in_progress", "closed"]),
                [d for d in ids if d != tid and rnd.random() < 0.35],
                str(rnd.randint(0, 4)),
            )
            for tid in ids
        ]
        yield scenario, "random#%d" % i


def all_scenarios(random_count, seed):
    return list(FIXED_SCENARIOS) + list(random_scenarios(random_count, seed))
