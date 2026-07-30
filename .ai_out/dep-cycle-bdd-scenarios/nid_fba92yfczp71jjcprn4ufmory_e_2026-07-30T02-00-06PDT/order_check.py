#!/usr/bin/env python3
"""Run the two `dep cycle` BDD shapes under EVERY ticket-file enumeration order.

Proves the scenarios' assertions do not depend on which ticket file is enumerated first
(i.e. on how the Background titles happen to slug). Usage: order_check.py <repo-root>
"""
import itertools
import os
import re
import subprocess
import sys
from pathlib import Path

ROOT = Path(sys.argv[1]).resolve()
WORK = Path(__file__).resolve().parent / "order-check-work"

IDS = ["task-0001", "task-0002", "task-0003", "task-0004"]

# shape name -> (deps per id, expected member sets, ids that must NOT appear)
SHAPES = {
    "points-into-cycle": (
        {"task-0001": ["task-0002"], "task-0002": ["task-0003"],
         "task-0003": ["task-0002"], "task-0004": ["task-0003"]},
        [{"task-0002", "task-0003"}],
        ["task-0001", "task-0004"],
    ),
    "three-way-overlap": (
        {"task-0001": ["task-0002"],
         "task-0002": ["task-0001", "task-0003", "task-0004"],
         "task-0003": ["task-0002"], "task-0004": ["task-0002"]},
        [{"task-0001", "task-0002"}, {"task-0002", "task-0003"}, {"task-0002", "task-0004"}],
        [],
    ),
}


def write_tickets(tickets_dir, deps, order):
    tickets_dir.mkdir(parents=True)
    # File name position in `order` decides enumeration order (byte-wise path sort).
    for position, ticket_id in enumerate(order):
        body = "".join([
            "---\n", f"id: {ticket_id}\n", f'title: "{ticket_id}"\n', "status: open\n",
            "deps: [" + ", ".join(deps[ticket_id]) + "]\n", "links: []\n", "---\n\nBody\n",
        ])
        (tickets_dir / f"{position}.md").write_text(body)


def reported_cycles(stdout):
    cycles = []
    for line in stdout.split("\n"):
        if re.match(r"^Cycle \d+: ", line):
            cycles.append(set())
        elif line.startswith("  ") and cycles:
            cycles[-1].add(line.split()[0])
    return cycles


def check(shape_name, order):
    deps, expected, absent = SHAPES[shape_name]
    tickets_dir = WORK / shape_name / "-".join(order) / "_tickets"
    write_tickets(tickets_dir, deps, order)
    env = dict(os.environ, TICKETS_DIR=str(tickets_dir))
    result = subprocess.run([str(ROOT / "ticket"), "dep", "cycle"], capture_output=True,
                            text=True, env=env)
    if result.returncode != 0:
        raise SystemExit(f"ticket failed ({result.returncode}): {result.stderr}")
    cycles = reported_cycles(result.stdout)
    problems = []
    if len(cycles) != len(expected):
        problems.append(f"count {len(cycles)} != {len(expected)}")
    for members in expected:
        if members not in cycles:
            problems.append(f"missing {sorted(members)}")
    for ticket_id in absent:
        if ticket_id in result.stdout:
            problems.append(f"unexpected {ticket_id}")
    return problems, result.stdout.strip().replace("\n", " | ")


failures = 0
for shape_name in SHAPES:
    for order in itertools.permutations(IDS):
        problems, output = check(shape_name, list(order))
        verdict = "PASS" if not problems else "FAIL: " + "; ".join(problems)
        if problems:
            failures += 1
        print(f"{shape_name:<20} entry={order[0]} {verdict}\n    {output}")
print(f"\nscenario-assertion failures: {failures} / {2 * 24}")
