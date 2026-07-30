#!/usr/bin/env python3
"""Differential harness: bash ./ticket vs the TS core, over generated graphs."""
import itertools
import os
import random
import shutil
import subprocess
import sys
import tempfile

REPO = "/home/nickolaykondratyev/git_repos/note-ticket"
TK = os.path.join(REPO, "ticket")
DUMP = os.path.join(REPO, ".tmp/parity/dump.mjs")


def build(scenario, tmp):
    tickets = os.path.join(tmp, "_tickets")
    os.makedirs(tickets)
    subprocess.run(["git", "init", "-q", tmp], check=True)
    for tid, status, deps, prio in scenario:
        with open(os.path.join(tickets, tid + ".md"), "w") as f:
            f.write("---\nid: %s\ntitle: \"T %s\"\nstatus: %s\ndeps: [%s]\npriority: %s\n---\n"
                    % (tid, tid, status, ", ".join(deps), prio))
    return tickets


def run(cmd, tickets):
    env = dict(os.environ, TICKETS_DIR=tickets)
    p = subprocess.run(cmd, env=env, capture_output=True, text=True, cwd=tickets)
    return p.stdout


def compare(scenario, label):
    tmp = tempfile.mkdtemp(prefix="parity-")
    try:
        tickets = build(scenario, tmp)
        ids = [t[0] for t in scenario]
        problems = []
        for mode, bash_cmd, ts_args in (
            ("ready", [TK, "ready"], ["ready"]),
            ("blocked", [TK, "blocked"], ["blocked"]),
            ("cycle", [TK, "dep", "cycle"], ["cycle"]),
        ):
            b = run(bash_cmd, tickets)
            t = run(["node", DUMP] + ts_args, tickets)
            if b != t:
                problems.append((mode, b, t))
        for root in ids:
            for full in (False, True):
                bash_cmd = [TK, "dep", "tree"] + (["--full"] if full else []) + [root]
                ts_args = ["tree", root, "full" if full else "dedup"]
                b = run(bash_cmd, tickets)
                t = run(["node", DUMP] + ts_args, tickets)
                if b != t:
                    problems.append(("tree%s %s" % ("--full" if full else "", root), b, t))
        if problems:
            print("MISMATCH in %s: %s" % (label, scenario))
            for mode, b, t in problems:
                print("  mode=[%s]\n  --- bash ---\n%s  --- ts ---\n%s" % (mode, b, t))
            return False
        return True
    finally:
        shutil.rmtree(tmp, ignore_errors=True)


def random_scenarios(count, seed):
    rnd = random.Random(seed)
    for i in range(count):
        n = rnd.randint(2, 6)
        ids = ["n%d" % k for k in range(n)]
        scenario = []
        for tid in ids:
            deps = [d for d in ids if d != tid and rnd.random() < 0.35]
            status = rnd.choice(["open", "open", "in_progress", "closed"])
            scenario.append((tid, status, deps, str(rnd.randint(0, 4))))
        yield scenario, "random#%d" % i


FIXED = [
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

if __name__ == "__main__":
    ok = True
    cases = list(FIXED) + list(random_scenarios(int(sys.argv[1]) if len(sys.argv) > 1 else 40, 7))
    for scenario, label in cases:
        if not compare(scenario, label):
            ok = False
    print("TOTAL=%d %s" % (len(cases), "ALL MATCH" if ok else "MISMATCHES FOUND"))
