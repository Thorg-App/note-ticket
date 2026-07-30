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
import os

from harness import MTIME_BASE, PIPE_TITLE, TempRepo, all_scenarios

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
    # `closed` is mtime-ordered, so these also pin harness.write_scenario's non-path-order
    # mtimes: a path-ordered implementation fails here.
    ["closed"],
    ["closed", "--limit=2"],
    ["closed", "--limit=1"],
    ["closed", "-a", "u0"],
    ["closed", "--tag=common"],
    ["closed", "--limit=2", "--assignee=u1", "-T", "common"],
    ["closed", "--status=open"],
]

# `--limit=` values where bash's behavior comes from `head -n` rather than from any decision
# about the flag, and TS deliberately differs:
# (args, accepted bash rcs, TS rc, whether TS prints rows).
CLOSED_LIMIT_DIVERGENCES = [
    # `head -n 0` exits without reading, so awk's write may or may not land in the pipe buffer
    # first: under `pipefail` bash reports awk's SIGPIPE death (141) or a clean 0, RACILY --
    # measured flipping between the two on identical input. TS always exits 0.
    (["closed", "--limit=0"], (0, 141), 0, False),
    # `head: invalid number of lines` -- a message about head, not about a flag anyone typed.
    (["closed", "--limit=abc"], (1,), 1, False),
    (["closed", "--limit="], (1,), 1, False),
    # `head -n -1` means "all but the last one"; nobody asked for that from `--limit`.
    (["closed", "--limit=-1"], (0,), 1, False),
    # `head -n 2k` means 2048 lines.
    (["closed", "--limit=2k"], (0,), 1, False),
]

# Enough closed tickets that a "all but the last N" limit is visibly different from N.
CLOSED_LIMIT_SCENARIO = [("cl%d" % i, "closed", [], "2") for i in range(4)]


def _check_closed_limit_divergences():
    """Whitelisted divergence: `--limit=` accepts only a plain count in TS.

    bash passed the raw text to `head -n`, inheriting its size suffixes, `+N` form, negative
    "all but the last N" meaning and its exit code 141 for 0. Pinned rather than byte-compared,
    so the day either side changes its mind the harness says so.
    """
    with TempRepo("parity-closed-limit-") as repo:
        repo.write_scenario(CLOSED_LIMIT_SCENARIO)
        problems = []
        for args, bash_rcs, ts_rc, ts_prints_rows in CLOSED_LIMIT_DIVERGENCES:
            bash, ts = repo.bash_result(*args), repo.ts_cli_result(*args)
            if bash.returncode not in bash_rcs:
                problems.append("bash %s rc=%d, expected one of %r" % (args[-1], bash.returncode, bash_rcs))
            if ts.returncode != ts_rc:
                problems.append(
                    "TS %s rc=%d, expected %d (stderr=[%s])"
                    % (args[-1], ts.returncode, ts_rc, ts.stderr.strip()[:120])
                )
            if bool(ts.stdout) != ts_prints_rows:
                problems.append("TS %s printed [%s]" % (args[-1], ts.stdout.strip()[:120]))
            if ts_rc != 0 and "--limit" not in ts.stderr:
                problems.append("TS %s error does not name the flag: [%s]" % (args[-1], ts.stderr.strip()[:120]))
        problems += _empty_repo_limit_problems()
        if problems:
            return False, "closed --limit divergence changed: " + "; ".join(problems)
        return True, "closed --limit: TS takes a plain count only, bash took head's syntax (as designed)"


def _empty_repo_limit_problems():
    """An unusable `--limit=` must be reported even with nothing to list.

    bash returns before `head` ever runs when the tickets dir is empty, so a typo silently
    exits 0 there; TS validates the flag the user typed regardless. Part of divergence #4.
    """
    with TempRepo("parity-closed-limit-empty-") as repo:
        bash, ts = repo.bash_result("closed", "--limit=abc"), repo.ts_cli_result("closed", "--limit=abc")
        if bash.returncode != 0:
            return ["bash now reports a bad --limit on an empty repo (rc=%d)" % bash.returncode]
        if ts.returncode == 0:
            return ["TS no longer reports a bad --limit on an empty repo"]
        return []


# More ticket files than bash's `ls -t … | head -n 100` window, with every CLOSED one older
# than every open one: the scan cap alone decides that `closed` prints nothing, whatever
# `--limit` says. Without a fixture bigger than the window, dropping the cap is invisible.
SCAN_CAP_TOTAL_FILES = 120
SCAN_CAP_CLOSED_FILES = 5


def _check_closed_scan_cap():
    """`closed` reads only the 100 most recently modified FILES, before any filtering."""
    scenario = [("old%02d" % i, "closed", [], "2") for i in range(SCAN_CAP_CLOSED_FILES)]
    scenario += [
        ("new%03d" % i, "open", [], "2") for i in range(SCAN_CAP_TOTAL_FILES - SCAN_CAP_CLOSED_FILES)
    ]
    with TempRepo("parity-closed-cap-") as repo:
        repo.write_scenario(scenario)
        # Oldest first in scenario order, so the closed tickets sit outside the window.
        for index, (tid, _status, _deps, _prio) in enumerate(scenario):
            repo.set_mtime(os.path.join(repo.tickets, tid + ".md"), MTIME_BASE + index)
        for args in (["closed"], ["closed", "--limit=200"]):
            bash, ts = repo.bash_result(*args), repo.ts_cli_result(*args)
            if bash.stdout != "":
                return False, "closed scan-cap fixture no longer exercises the cap: bash printed [%s]" % (
                    bash.stdout.strip()[:120]
                )
            if _outcome(bash) != _outcome(ts):
                return False, "closed %r ignores the 100-file scan cap:\n  --- bash ---\n%s  --- ts ---\n%s" % (
                    args,
                    _outcome(bash),
                    _outcome(ts),
                )
        return True, "closed 100-file scan cap identical (%d files)" % SCAN_CAP_TOTAL_FILES


# Two tickets with the SAME mtime: `ls -t` falls back to the name, and so must TS.
CLOSED_TIE_SCENARIO = [("zz9", "closed", [], "2"), ("aa1", "closed", [], "2")]


def _check_closed_mtime_tie():
    """Equal mtimes must not make the order arbitrary -- both sides fall back to the path."""
    with TempRepo("parity-closed-tie-") as repo:
        repo.write_scenario(CLOSED_TIE_SCENARIO)
        for tid, _status, _deps, _prio in CLOSED_TIE_SCENARIO:
            repo.set_mtime(os.path.join(repo.tickets, tid + ".md"), MTIME_BASE)
        bash, ts = _outcome(repo.bash_result("closed")), _outcome(repo.ts_cli_result("closed"))
        if bash != ts:
            return False, "closed equal-mtime order differs:\n  --- bash ---\n%s  --- ts ---\n%s" % (bash, ts)
        return True, "closed equal-mtime tie-break identical"


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
    pinned = [
        _check_pipe_title_divergence(),
        _check_closed_limit_divergences(),
        _check_closed_mtime_tie(),
        _check_closed_scan_cap(),
    ]
    summary = "scenarios=%d failures=%d (whitelisted: bash bogus cycles=%d); %s" % (
        len(scenarios),
        failures,
        bash_bogus_cycles,
        "; ".join(summary for _passed, summary in pinned),
    )
    return failures == 0 and all(passed for passed, _summary in pinned), summary
