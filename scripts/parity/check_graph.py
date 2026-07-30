#!/usr/bin/env python3
"""Listing + dependency-graph parity: `ls`, `ready`, `blocked`, `dep tree[ --full]`, `dep cycle`.

`ls` / `ready` / `blocked` (with every filter flag) and `dep tree[ --full]` are compared
byte-for-byte. The first three are served by the shipped TS CLI, so both sides get the
same argv; `dep tree`/`dep cycle` are not ported yet and use the `dump.mjs` fixture.

`dep cycle` is the ONE whitelisted divergence: bash aborts its DFS on the first
cycle and leaves nodes marked "visiting", so it prints paths that are not cycles
and misses real ones. Comparing its bytes would just pin a bug, so instead both
sides are validated semantically -- every cycle the TS core reports must be a real
closed walk, and no cyclic graph may come back empty. bash's bogus cycles are
counted and reported, not failed on. DROP this whitelist once T4
(nid_fba92yfczp71jjcprn4ufmory_e) flips `dep cycle` to the TS implementation.
"""
from harness import TempRepo, all_scenarios


def _parse_cycles(out):
    """'Cycle N: a -> b -> a' followed by indented member lines -> list of member lists."""
    cycles, current = [], None
    for line in out.splitlines():
        if line.startswith("Cycle "):
            current = []
            cycles.append(current)
        elif line.startswith("  ") and current is not None:
            current.append(line.split()[0])
    return cycles


def _active_deps(scenario):
    """Dep edges as `dep cycle` sees them: closed tickets and dangling deps dropped."""
    deps = {tid: list(d) for tid, status, d, _prio in scenario if status != "closed"}
    return {tid: [d for d in edges if d in deps] for tid, edges in deps.items()}


def _is_closed_walk(members, deps):
    if not members:
        return False
    return all(
        members[(i + 1) % len(members)] in deps.get(m, []) for i, m in enumerate(members)
    )


def _has_cycle(deps):
    VISITING, DONE = 1, 2
    state = {}

    def visit(node):
        if state.get(node) == VISITING:
            return True
        if state.get(node) == DONE:
            return False
        state[node] = VISITING
        found = any(visit(child) for child in deps.get(node, []))
        state[node] = DONE
        return found

    return any(visit(node) for node in deps)


# Invocations the TS CLI already serves; bash and TS are handed identical argv.
# The flag values line up with harness.write_scenario's assignee/tags cycling.
CLI_INVOCATIONS = [
    ["ls"],
    ["ls", "--status=open"],
    ["ls", "--status=closed"],
    ["ls", "-a", "u0"],
    ["ls", "--assignee=u1"],
    ["ls", "-T", "t1"],
    ["ls", "--tag=common"],
    ["ls", "--status=open", "-a", "u0", "-T", "common"],
    ["ready"],
    ["ready", "-a", "u1"],
    ["ready", "-T", "t2"],
    ["ready", "--assignee=u0", "--tag=common"],
    # ready/blocked take no --status: bash never reads it there, so it must be IGNORED
    # rather than applied. This pair is what catches a shared option parser overreaching.
    ["ready", "--status=closed"],
    ["blocked"],
    ["blocked", "-a", "u0"],
    ["blocked", "-T", "t0"],
    ["blocked", "--assignee=u1", "--tag=common"],
    ["blocked", "--status=closed"],
]


def _exact_mismatches(repo, scenario):
    """(label, bash, ts) for every command whose output must match byte-for-byte."""
    problems = []
    for args in CLI_INVOCATIONS:
        bash_out, ts_out = repo.bash(*args), repo.ts_cli(*args)
        if bash_out != ts_out:
            problems.append((" ".join(args), bash_out, ts_out))
    dump_comparisons = []
    for root in [t[0] for t in scenario]:
        dump_comparisons.append(("dep tree %s" % root, ["dep", "tree", root], ["tree", root, "dedup"]))
        dump_comparisons.append(
            ("dep tree --full %s" % root, ["dep", "tree", "--full", root], ["tree", root, "full"])
        )
    for label, bash_args, ts_args in dump_comparisons:
        bash_out, ts_out = repo.bash(*bash_args), repo.ts(*ts_args)
        if bash_out != ts_out:
            problems.append((label, bash_out, ts_out))
    return problems


def run(random_count, seed):
    failures = bash_bogus_cycles = 0
    scenarios = all_scenarios(random_count, seed)
    for scenario, label in scenarios:
        with TempRepo("parity-graph-") as repo:
            repo.write_scenario(scenario)
            problems = _exact_mismatches(repo, scenario)

            deps = _active_deps(scenario)
            bash_bogus_cycles += sum(
                1 for c in _parse_cycles(repo.bash("dep", "cycle")) if not _is_closed_walk(c, deps)
            )
            ts_cycles = _parse_cycles(repo.ts("cycle"))
            for cycle in ts_cycles:
                if not _is_closed_walk(cycle, deps):
                    problems.append(("dep cycle (TS reported a non-cycle)", str(cycle), str(deps)))
            if _has_cycle(deps) and not ts_cycles:
                problems.append(("dep cycle (TS missed a cyclic graph)", "", str(deps)))

            for problem_label, bash_out, ts_out in problems:
                failures += 1
                print("MISMATCH scenario=[%s] check=[%s] graph=%s" % (label, problem_label, scenario))
                print("  --- bash ---\n%s  --- ts ---\n%s" % (bash_out, ts_out))
    summary = "scenarios=%d failures=%d (whitelisted: bash bogus cycles=%d)" % (
        len(scenarios),
        failures,
        bash_bogus_cycles,
    )
    return failures == 0, summary
