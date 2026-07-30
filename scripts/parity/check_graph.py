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
from harness import PIPE_TITLE, TempRepo, all_scenarios

# Two tickets, so one is ready and one is blocked, both with a `|` in the title.
PIPE_TITLE_SCENARIO = [("aa1", "open", ["bb2"], "1"), ("bb2", "open", [], "2")]


def _check_pipe_title_divergence():
    """Whitelisted divergence: bash `ready`/`blocked` truncate a title at its first `|`.

    Both pack the sort key as `prio|id|status|title` and `split()` it back apart, so bash
    loses everything after the pipe -- and `blocked` prints a title fragment where the
    blockers belong. TS prints the title whole, which is the intended behavior. Pinned
    rather than byte-compared, so the day either side changes its mind the harness says so.
    """
    with TempRepo("parity-pipe-title-") as repo:
        repo.write_scenario(PIPE_TITLE_SCENARIO, title_template=PIPE_TITLE)
        ready_title, blocked_title = PIPE_TITLE % "bb2", PIPE_TITLE % "aa1"
        expectations = [
            # (label, bash text, TS text, what bash keeps, what only TS keeps)
            ("ready", repo.bash("ready"), repo.ts_cli("ready"), ready_title.split("|")[0], ready_title),
            ("blocked", repo.bash("blocked"), repo.ts_cli("blocked"), blocked_title.split("|")[0], blocked_title),
        ]
        problems = []
        for label, bash_out, ts_out, truncated, whole in expectations:
            if whole in bash_out or truncated not in bash_out:
                problems.append("bash %s no longer truncates at `|`: [%s]" % (label, bash_out.strip()))
            if whole not in ts_out:
                problems.append("TS %s no longer renders the whole title: [%s]" % (label, ts_out.strip()))
        # The blockers bash drops, and only TS still prints.
        if "[bb2]" in expectations[1][1] or "<- [bb2]" not in expectations[1][2]:
            problems.append("blocked blockers changed: bash=[%s] ts=[%s]" % (expectations[1][1].strip(), expectations[1][2].strip()))
        if problems:
            return False, "pipe-title divergence changed: " + "; ".join(problems)
        return True, "pipe-title: bash truncates ready/blocked at `|`, TS does not (as designed)"


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


def _outcome(result):
    """What must match: exit code AND stdout. Comparing stdout alone would let a bash-side
    crash that prints nothing look equal to an empty TS success."""
    return "rc=%d\n%s" % (result.returncode, result.stdout)


def _exact_mismatches(repo, scenario):
    """(label, bash, ts) for every command whose output must match byte-for-byte."""
    problems = []
    for args in CLI_INVOCATIONS:
        bash_out = _outcome(repo.bash_result(*args))
        ts_out = _outcome(repo.ts_cli_result(*args))
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
    pipe_ok, pipe_summary = _check_pipe_title_divergence()
    summary = "scenarios=%d failures=%d (whitelisted: bash bogus cycles=%d); %s" % (
        len(scenarios),
        failures,
        bash_bogus_cycles,
        pipe_summary,
    )
    return failures == 0 and pipe_ok, summary
