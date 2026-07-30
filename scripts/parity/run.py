#!/usr/bin/env python3
"""Run every bash-vs-TS parity check. Exit 1 on any unexpected mismatch.

    make parity                 # default scenario count
    make parity PARITY_RANDOM=500
"""
import argparse
import os
import sys

sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))

import check_graph
import check_query
import check_slug
from harness import require_dump

DEFAULT_RANDOM_SCENARIOS = 60
DEFAULT_SEED = 7


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--random", type=int, default=DEFAULT_RANDOM_SCENARIOS,
                        help="number of generated graphs for the dep-graph check")
    parser.add_argument("--seed", type=int, default=DEFAULT_SEED,
                        help="seed for graph generation; a failure is reproducible with it")
    args = parser.parse_args()

    require_dump()
    results = [
        ("graph", check_graph.run(args.random, args.seed)),
        ("query", check_query.run()),
        ("slug", check_slug.run()),
    ]
    print("\n== parity ==")
    for name, (ok, summary) in results:
        print("%-6s %-4s %s" % (name, "OK" if ok else "FAIL", summary))
    if not all(ok for _name, (ok, _summary) in results):
        return 1
    return 0


if __name__ == "__main__":
    sys.exit(main())
