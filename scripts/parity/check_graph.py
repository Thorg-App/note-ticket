#!/usr/bin/env python3
"""Listing + graph parity: `ls`, `ready`, `blocked`, `closed`, `dep tree[ --full]`, `dep cycle`, `show`.

Every command here is served by the shipped TS CLI, so both sides get the same argv.
`ls` / `ready` / `blocked` / `closed` (with every filter flag) and `dep tree[ --full]` are
compared byte-for-byte.

Two commands cannot be byte-compared and are checked semantically instead:

* `dep cycle` -- bash aborts its DFS on the first cycle and leaves nodes marked "visiting",
  so it prints paths that are not cycles and misses real ones. Comparing its bytes would
  just pin a bug, so every cycle the TS side reports must be a real closed walk, and no
  cyclic graph may come back empty. bash's bogus cycles are counted and reported.
* `show` -- bash builds its Blocking and Children sections by iterating an awk associative
  array, whose order is UNSPECIFIED. The echoed file is byte-compared; the computed
  sections are compared as sorted row sets.
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


# A symlinked ticket, its target, and a plain sibling stamped between the two: `ls -t` does
# not dereference a symlink operand, so the LINK's own mtime decides where it sorts.
SYMLINK_TARGET_MTIME = 1577836800  # 2020
SYMLINK_SIBLING_MTIME = 1735689600  # 2025
SYMLINK_LINK_MTIME = 1893456000  # 2030


def _check_closed_symlink_mtime():
    """A symlinked ticket sorts by the LINK's mtime, not its target's.

    README documents a symlinked ticket file as a supported layout and `_collect_ticket_files`
    uses `find -L` to pick one up, so which mtime `closed` sorts by is contractual. Following
    the link (`stat`) instead of reading it (`lstat`) flips the order, and nothing else in the
    fixtures has a symlink whose mtime differs from its target's.
    """
    with TempRepo("parity-closed-symlink-") as repo:
        outside = os.path.join(os.path.dirname(repo.tickets), "outside")
        os.makedirs(outside)
        target = os.path.join(outside, "target.md")
        with open(target, "w") as f:
            f.write('---\nid: sym1\ntitle: "Sym"\nstatus: closed\n---\n')
        sibling = os.path.join(repo.tickets, "dir1.md")
        with open(sibling, "w") as f:
            f.write('---\nid: dir1\ntitle: "Direct"\nstatus: closed\n---\n')
        link = os.path.join(repo.tickets, "sym1.md")
        os.symlink(target, link)
        repo.set_mtime(target, SYMLINK_TARGET_MTIME)
        repo.set_mtime(sibling, SYMLINK_SIBLING_MTIME)
        os.utime(link, (SYMLINK_LINK_MTIME, SYMLINK_LINK_MTIME), follow_symlinks=False)

        bash, ts = _outcome(repo.bash_result("closed")), _outcome(repo.ts_cli_result("closed"))
        if bash != ts:
            return False, "closed symlink mtime order differs:\n  --- bash ---\n%s  --- ts ---\n%s" % (bash, ts)
        # Non-vacuity: the fixture only exercises anything if the link really does lead.
        if not bash.startswith("rc=0\nsym1"):
            return False, "closed symlink fixture no longer puts the link first: [%s]" % bash.strip()
        return True, "closed symlink ordered by the link's own mtime, identically"


# More closed tickets than the default `--limit=20`, so the default is visible in the bytes.
DEFAULT_LIMIT_SCENARIO = [("dl%02d" % i, "closed", [], "2") for i in range(25)]
EXPECTED_DEFAULT_LIMIT_ROWS = 20


def _check_closed_default_limit():
    """`closed` with no `--limit=` prints bash's 20 rows.

    Every other fixture has fewer than 20 closed tickets, so the default was pinned only by a
    unit test asserting the constant -- i.e. not against bash at all.
    """
    with TempRepo("parity-closed-default-limit-") as repo:
        repo.write_scenario(DEFAULT_LIMIT_SCENARIO)
        bash, ts = repo.bash_result("closed"), repo.ts_cli_result("closed")
        if _outcome(bash) != _outcome(ts):
            return False, "closed default limit differs:\n  --- bash ---\n%s  --- ts ---\n%s" % (
                _outcome(bash),
                _outcome(ts),
            )
        rows = len(bash.stdout.splitlines())
        if rows != EXPECTED_DEFAULT_LIMIT_ROWS:
            return False, "closed default limit is %d rows, expected %d" % (rows, EXPECTED_DEFAULT_LIMIT_ROWS)
        return True, "closed default limit identical (%d rows of %d)" % (rows, len(DEFAULT_LIMIT_SCENARIO))


# Output has to exceed BOTH awk's ~4 KB write buffer and node's 64 KB pipe buffer, so that
# both sides genuinely write into a pipe whose reader is already gone.
BROKEN_PIPE_TICKET_COUNT = 3000
BROKEN_PIPE_RC = 141  # 128 + SIGPIPE
SMALL_SCENARIO = [("sm1", "open", [], "2")]


def _check_broken_pipe_exit_code():
    """`ls | head -1` must report SIGPIPE death, as every Unix tool does.

    Node ignores SIGPIPE, so this only holds because the CLI turns the failed write into
    128+SIGPIPE itself. The small-output case is here too: with nothing to break, both sides
    must still exit 0, which is what stops the guard from reporting 141 unconditionally.
    """
    problems = []
    with TempRepo("parity-broken-pipe-") as repo:
        repo.write_scenario([("bp%04d" % i, "open", [], "2") for i in range(BROKEN_PIPE_TICKET_COUNT)])
        bash, ts = repo.bash_head_rc("ls"), repo.ts_cli_head_rc("ls")
        if bash != BROKEN_PIPE_RC:
            problems.append("bash `ls | head -1` rc=%d, expected %d" % (bash, BROKEN_PIPE_RC))
        if ts != BROKEN_PIPE_RC:
            problems.append("TS `ls | head -1` rc=%d, expected %d" % (ts, BROKEN_PIPE_RC))
    with TempRepo("parity-unbroken-pipe-") as repo:
        repo.write_scenario(SMALL_SCENARIO)
        bash, ts = repo.bash_head_rc("ls"), repo.ts_cli_head_rc("ls")
        if (bash, ts) != (0, 0):
            problems.append("one-row `ls | head -1` rc bash=%d ts=%d, expected 0/0" % (bash, ts))
    if problems:
        return False, "broken-pipe exit code changed: " + "; ".join(problems)
    return True, "ls | head -1 exits %d on both sides (and 0 when nothing breaks)" % BROKEN_PIPE_RC


# The computed sections `show` appends after the ticket file itself.
SHOW_SECTION_HEADINGS = ("## Blockers", "## Blocking", "## Children", "## Linked")
SHOW_ROW_PREFIX = "- "


def _split_show(out):
    """`show` output -> (echoed file, {heading: [rows]}).

    The echoed file is a byte-for-byte contract. The section ROWS are too, but their ORDER
    is not: bash iterates an awk associative array for Blocking and Children.
    """
    echoed, sections, heading = [], {}, None
    for line in out.split("\n"):
        if line in SHOW_SECTION_HEADINGS:
            heading = line
            sections[heading] = []
        elif heading is None:
            echoed.append(line)
        elif line.startswith(SHOW_ROW_PREFIX):
            sections[heading].append(line)
    # The blank line before the first heading belongs to the section block, not the file.
    while echoed and echoed[-1] == "":
        echoed.pop()
    return "\n".join(echoed), sections


def _show_mismatches(repo, scenario):
    """(label, bash, ts) for `show` over every ticket of a scenario."""
    problems = []
    for tid, _status, _deps, _prio in scenario:
        bash, ts = repo.bash_result("show", tid), repo.ts_cli_result("show", tid)
        if bash.returncode != ts.returncode:
            problems.append(("show %s (exit code)" % tid, _outcome(bash), _outcome(ts)))
            continue
        bash_file, bash_sections = _split_show(bash.stdout)
        ts_file, ts_sections = _split_show(ts.stdout)
        if bash_file != ts_file:
            problems.append(("show %s (echoed file)" % tid, bash_file, ts_file))
        # Which sections appear AND in what order: only the rows inside Blocking and
        # Children are hash-ordered in bash, never the headings themselves.
        if list(bash_sections) != list(ts_sections):
            problems.append(("show %s (sections)" % tid, str(list(bash_sections)), str(list(ts_sections))))
            continue
        for heading, bash_rows in bash_sections.items():
            if sorted(bash_rows) != sorted(ts_sections[heading]):
                problems.append(
                    ("show %s (%s rows)" % (tid, heading), str(sorted(bash_rows)),
                     str(sorted(ts_sections[heading])))
                )
    return problems


# A ticket with a parent, a dependency of each kind, a dependent and a child: enough for all
# four `show` sections to appear AT ONCE, with exactly one row each. Generated scenarios have
# no `parent:` field at all, so without this fixture neither the parent annotation nor the
# Children section nor the ORDER of the sections is exercised anywhere (measured: mutating
# either one left `make parity` green).
SHOW_RELATIONS_FILES = {
    "par.md": '---\nid: par\ntitle: "The parent"\nstatus: open\ndeps: []\nlinks: []\n---\n',
    "tgt.md": (
        '---\nid: tgt\ntitle: "Target"\nstatus: open\ndeps: [dep_open, dep_closed, ghost]\n'
        'links: [par, nolink]\nparent: par\n---\n\nBody text.\n'
    ),
    "dep_open.md": '---\nid: dep_open\ntitle: "Open dep"\nstatus: open\ndeps: []\nlinks: []\n---\n',
    "dep_closed.md": '---\nid: dep_closed\ntitle: "Closed dep"\nstatus: closed\ndeps: []\nlinks: []\n---\n',
    "waiter.md": '---\nid: waiter\ntitle: "Waiter"\nstatus: open\ndeps: [tgt]\nlinks: []\n---\n',
    "kid.md": '---\nid: kid\ntitle: "Kid"\nstatus: open\ndeps: []\nlinks: []\nparent: tgt\n---\n',
}
EXPECTED_SHOW_SECTIONS = ["## Blockers", "## Blocking", "## Children", "## Linked"]


def _check_show_relations():
    """`show` on a ticket with all four sections populated, byte-for-byte.

    One row per section, so bash's unspecified Blocking/Children ORDER cannot make this
    flaky, and the section sequence and the `parent:` annotation are both really compared.
    """
    with TempRepo("parity-show-relations-") as repo:
        for name, text in SHOW_RELATIONS_FILES.items():
            with open(os.path.join(repo.tickets, name), "w") as f:
                f.write(text)
        bash, ts = repo.bash_result("show", "tgt"), repo.ts_cli_result("show", "tgt")
        if _outcome(bash) != _outcome(ts):
            return False, "show with all sections differs:\n  --- bash ---\n%s  --- ts ---\n%s" % (
                _outcome(bash),
                _outcome(ts),
            )
        # Non-vacuity: the fixture only proves anything if every section really is there.
        headings = [line for line in bash.stdout.split("\n") if line.startswith("## ")]
        if headings != EXPECTED_SHOW_SECTIONS or "parent: par  # The parent" not in bash.stdout:
            return False, "show fixture no longer exercises every section: %r" % headings
        return True, "show identical with parent annotation and all four sections"


# `dup` names `tgt` twice in its deps, which bash's `show` prints as two Blocking rows.
SHOW_DUPLICATE_SCENARIO = [("tgt", "open", [], "2"), ("dup", "open", ["tgt", "tgt"], "2")]
EXPECTED_BASH_BLOCKING_ROWS = 2
EXPECTED_TS_BLOCKING_ROWS = 1


def _check_show_duplicate_blocking():
    """Whitelisted divergence: one Blocking row per ticket, not per matching `deps` entry.

    bash appended a row for every `deps` entry naming the target, so a ticket that lists it
    twice was printed twice. Pinned rather than byte-compared, so the day either side changes
    its mind the harness says so. (The ORDER of these sections is bash's awk hash order and
    is not pinnable at all -- `_show_mismatches` compares them as sets for that reason.)
    """
    with TempRepo("parity-show-duplicate-") as repo:
        repo.write_scenario(SHOW_DUPLICATE_SCENARIO)
        bash_rows = _split_show(repo.bash("show", "tgt"))[1].get("## Blocking", [])
        ts_rows = _split_show(repo.ts_cli("show", "tgt"))[1].get("## Blocking", [])
        if len(bash_rows) != EXPECTED_BASH_BLOCKING_ROWS or len(ts_rows) != EXPECTED_TS_BLOCKING_ROWS:
            return False, "show duplicate-blocking divergence changed: bash=%r ts=%r" % (bash_rows, ts_rows)
        return True, "show lists a duplicate dependent once, bash twice (as designed)"


# `short` is a full id and also a substring of `short-and-long`: bash's `dep tree` matched
# by substring only and called that ambiguous.
ID_SUBSTRING_SCENARIO = [("short", "open", [], "2"), ("short-and-long", "open", [], "2")]
ONE_TICKET_SCENARIO = [("only", "open", [], "2")]


def _check_id_resolution_divergences():
    """Whitelisted divergence: `dep tree` resolves its root through the shared resolver.

    bash's `cmd_dep_tree` had its own awk scan matching by SUBSTRING, so a full id contained
    in another id was "ambiguous" and its tree unreachable, while an EMPTY id matched every
    ticket (awk `index(s, "")` is 1) -- `tk show "$UNSET_VAR"` printed an arbitrary ticket in
    a one-ticket repo. Both were confirmed as bugs by the human owner (ticket
    nid_5g3eta9cf7yi6iukmscxma6wc_e); BDD scenarios pin the TS side, and this pins that bash
    really did behave that way.
    """
    problems = []
    with TempRepo("parity-id-substring-") as repo:
        repo.write_scenario(ID_SUBSTRING_SCENARIO)
        bash, ts = repo.bash_result("dep", "tree", "short"), repo.ts_cli_result("dep", "tree", "short")
        if bash.returncode == 0 or "ambiguous" not in bash.stderr:
            problems.append("bash `dep tree <full-id>` no longer reports ambiguity: %s" % _outcome(bash))
        if ts.returncode != 0 or not ts.stdout.startswith("short ["):
            problems.append("TS `dep tree <full-id>` did not resolve: %s" % _outcome(ts))
    with TempRepo("parity-id-empty-") as repo:
        repo.write_scenario(ONE_TICKET_SCENARIO)
        bash, ts = repo.bash_result("show", ""), repo.ts_cli_result("show", "")
        if bash.returncode != 0:
            problems.append("bash `show \"\"` no longer resolves to the only ticket: %s" % _outcome(bash))
        if ts.returncode != 1 or "not found" not in ts.stderr:
            problems.append("TS `show \"\"` is no longer not-found: %s" % _outcome(ts))
    if problems:
        return False, "id-resolution divergence changed: " + "; ".join(problems)
    return True, "dep tree root resolves exact-first and an empty id matches nothing (as designed)"


def _outcome(result):
    """What must match: exit code AND stdout. Comparing stdout alone would let a bash-side
    crash that prints nothing look equal to an empty TS success."""
    return "rc=%d\n%s" % (result.returncode, result.stdout)


def _exact_mismatches(repo, scenario):
    """(label, bash, ts) for every command whose output must match byte-for-byte."""
    invocations = list(CLI_INVOCATIONS)
    for root in [t[0] for t in scenario]:
        invocations.append(["dep", "tree", root])
        invocations.append(["dep", "tree", "--full", root])
    problems = []
    for args in invocations:
        bash_out = _outcome(repo.bash_result(*args))
        ts_out = _outcome(repo.ts_cli_result(*args))
        if bash_out != ts_out:
            problems.append((" ".join(args), bash_out, ts_out))
    return problems


def run(random_count, seed):
    failures = bash_bogus_cycles = 0
    scenarios = all_scenarios(random_count, seed)
    for scenario, label in scenarios:
        with TempRepo("parity-graph-") as repo:
            repo.write_scenario(scenario)
            problems = _exact_mismatches(repo, scenario) + _show_mismatches(repo, scenario)

            deps = _active_deps(scenario)
            bash_bogus_cycles += sum(
                1 for c in _parse_cycles(repo.bash("dep", "cycle")) if not _is_closed_walk(c, deps)
            )
            ts_cycles = _parse_cycles(repo.ts_cli("dep", "cycle"))
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
        _check_closed_symlink_mtime(),
        _check_closed_default_limit(),
        _check_broken_pipe_exit_code(),
        _check_show_relations(),
        _check_show_duplicate_blocking(),
        _check_id_resolution_divergences(),
    ]
    summary = "scenarios=%d failures=%d (whitelisted: bash bogus cycles=%d); %s" % (
        len(scenarios),
        failures,
        bash_bogus_cycles,
        "; ".join(summary for _passed, summary in pinned),
    )
    return failures == 0 and all(passed for passed, _summary in pinned), summary
