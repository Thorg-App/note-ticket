#!/usr/bin/env python3
"""Validate cycle output: every reported cycle must be real; bash's must not be."""
import os, random, re, shutil, subprocess, sys, tempfile
sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
from diff import build, run, random_scenarios, FIXED, TK, DUMP

def parse(out):
    """-> list of member lists, from 'Cycle N: a -> b -> a' + indented member lines."""
    cycles, cur = [], None
    for line in out.splitlines():
        if line.startswith("Cycle "):
            cur = []
            cycles.append(cur)
        elif line.startswith("  ") and cur is not None:
            cur.append(line.split()[0])
    return cycles

def is_real_cycle(members, deps):
    """members in order must form a closed walk."""
    if not members:
        return False
    for i, m in enumerate(members):
        nxt = members[(i + 1) % len(members)]
        if nxt not in deps.get(m, []):
            return False
    return True

def has_any_cycle(deps):
    state = {}
    def dfs(n):
        if state.get(n) == 1: return True
        if state.get(n) == 2: return False
        state[n] = 1
        for c in deps.get(n, []):
            if c in deps and dfs(c): return True
        state[n] = 2
        return False
    return any(dfs(n) for n in deps)

bogus_bash = ts_bogus = ts_missed = 0
checked = 0
for scenario, label in list(FIXED) + list(random_scenarios(150, 11)):
    tmp = tempfile.mkdtemp(prefix="cyc-")
    try:
        tickets = build(scenario, tmp)
        deps = {t[0]: [d for d in t[2]] for t in scenario if t[1] != "closed"}
        deps = {k: [d for d in v if d in deps] for k, v in deps.items()}
        b = parse(run([TK, "dep", "cycle"], tickets))
        t = parse(run(["node", DUMP, "cycle"], tickets))
        checked += 1
        for c in b:
            if not is_real_cycle(c, deps): bogus_bash += 1
        for c in t:
            if not is_real_cycle(c, deps):
                ts_bogus += 1
                print("TS BOGUS", label, c, deps)
        if has_any_cycle(deps) and not t:
            ts_missed += 1
            print("TS MISSED", label, deps)
    finally:
        shutil.rmtree(tmp, ignore_errors=True)
print("scenarios=%d bash_bogus_cycles=%d ts_bogus_cycles=%d ts_missed_graphs=%d"
      % (checked, bogus_bash, ts_bogus, ts_missed))
