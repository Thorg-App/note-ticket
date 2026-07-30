#!/usr/bin/env python3
"""Shared plumbing for the bash-vs-TS differential parity checks.

Every check builds throwaway git repos, runs bash `./ticket` and the TS `dump.mjs`
against the same tickets dir, and compares. Nothing here knows about a specific
command -- see check_graph.py / check_query.py / check_slug.py.
"""
import atexit
import os
import random
import re
import shutil
import subprocess
import tempfile

REPO = os.path.dirname(os.path.dirname(os.path.dirname(os.path.abspath(__file__))))
TICKET = os.path.join(REPO, "ticket")
DUMP = os.path.join(REPO, "dist-parity/dump.mjs")
TS_CLI = os.path.join(REPO, "dist/ticket.mjs")


class BashReference:
    """The bash implementation, pinned so a TS_COMMANDS flip cannot hollow out the diff.

    `./ticket` exec's the TS bundle for every command named in its TS_COMMANDS variable.
    Running it directly would therefore compare TS against TS the moment a command is
    ported -- a harness that can no longer fail. This is a copy of the script with that
    variable emptied, so the bash code path is always the one being measured.
    """

    _path = None

    @classmethod
    def path(cls):
        if cls._path is None:
            cls._path = cls._materialize()
        return cls._path

    @classmethod
    def _materialize(cls):
        # WHY $REPO/.tmp and not the system temp dir: TMPDIR can be a noexec mount
        # (/dev/shm on this machine), and the copy has to be executable.
        scratch = os.path.join(REPO, ".tmp")
        os.makedirs(scratch, exist_ok=True)
        directory = tempfile.mkdtemp(prefix="parity-bash-ref-", dir=scratch)
        atexit.register(shutil.rmtree, directory, ignore_errors=True)
        with open(TICKET) as f:
            source = f.read()
        patched, count = re.subn(r'(?m)^TS_COMMANDS=.*$', 'TS_COMMANDS=""', source)
        if count != 1:
            raise SystemExit("Expected exactly one TS_COMMANDS assignment in %s, found %d" % (TICKET, count))
        path = os.path.join(directory, "ticket")
        with open(path, "w") as f:
            f.write(patched)
        os.chmod(path, 0o755)
        return path


# Titles the byte-compare must survive, cycled over the tickets of every scenario. Written
# exactly as bash `create` writes them (quotes backslash-escaped), so these are real inputs:
# each one is reachable through `tk create`.
# WHY no `|` here: bash `ready`/`blocked` pack their sort key as `prio|id|status|title`, so a
# pipe in a title is a genuine divergence -- pinned in check_graph, not byte-compared.
HOSTILE_TITLES = [
    "T %s",
    "a - b [c] %s",
    "Fix: the thing %s",
    'say \\"hi\\" %s',
    "back\\slash %s",
    "ünïcødé %s",
    "trailing space %s ",
]

# A title that trips bash's `|`-packed sort key. Used only by the pinned divergence check.
PIPE_TITLE = "Pipe %s | tail"

# Modification times for generated tickets: a fixed epoch plus a stride coprime with the
# spread, so the mtime order `closed` uses is deterministic and is NOT the path order.
MTIME_BASE = 1700000000
MTIME_SHUFFLE_STEP = 7919
MTIME_SPREAD = 1000


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

    def write_scenario(self, scenario, title_template=None):
        """Materialize a scenario as ticket files.

        `assignee` and `tags` cycle over small sets so the -a/-T/--status filters select
        real, non-trivial subsets instead of always matching everything. Titles cycle over
        HOSTILE_TITLES for the same reason: a fixture whose titles are all `T <id>` cannot
        catch a metacharacter bug. `title_template` pins one title for every ticket instead.

        Modification times are set explicitly and NOT in path order: `closed` sorts by mtime,
        so files written in ascending name order would let a path-ordered implementation pass.
        """
        for index, (tid, status, deps, prio) in enumerate(scenario):
            template = title_template or HOSTILE_TITLES[index % len(HOSTILE_TITLES)]
            path = os.path.join(self.tickets, tid + ".md")
            with open(path, "w") as f:
                f.write(
                    '---\nid: %s\ntitle: "%s"\nstatus: %s\ndeps: [%s]\npriority: %s\n'
                    'assignee: u%d\ntags: [t%d, common]\n---\n'
                    % (tid, template % tid, status, ", ".join(deps), prio, index % 2, index % 3)
                )
            self.set_mtime(path, MTIME_BASE + (index * MTIME_SHUFFLE_STEP) % MTIME_SPREAD)

    @staticmethod
    def set_mtime(path, seconds):
        os.utime(path, (seconds, seconds))

    def bash(self, *args):
        return self.bash_result(*args).stdout

    def ts(self, *args):
        return self.ts_result(*args).stdout

    def ts_cli(self, *args):
        """The shipped TS CLI. Preferred over `ts()` for any command it already serves."""
        return self.ts_cli_result(*args).stdout

    def bash_result(self, *args):
        return self._run([BashReference.path()] + list(args))

    def ts_result(self, *args):
        return self._run(["node", DUMP] + list(args))

    def ts_cli_result(self, *args):
        return self._run(["node", TS_CLI] + list(args))

    def bash_head_rc(self, *args):
        return self._head_rc([BashReference.path()] + list(args))

    def ts_cli_head_rc(self, *args):
        return self._head_rc(["node", TS_CLI] + list(args))

    def _head_rc(self, cmd):
        """Exit code of `<cmd> | head -1`, i.e. what the pipeline sees when the reader leaves.

        `${PIPESTATUS[0]}` and not `$?`: `$?` is head's status, which is always 0 and would
        make a broken-pipe comparison vacuous.
        """
        shell = "%s | head -1 >/dev/null; exit ${PIPESTATUS[0]}" % " ".join(
            "'%s'" % arg for arg in cmd
        )
        return self._run(["bash", "-c", shell]).returncode

    def _run(self, cmd):
        # LC_ALL=C: bash `closed` breaks equal-mtime ties with `ls`, whose secondary key is
        # `strcoll`, i.e. locale-dependent. The TS side orders byte-wise, which is `ls` under
        # the C locale, so the harness pins the locale instead of comparing two orderings that
        # are both "right". (Byte-vs-collation ordering of equal-mtime files is noted as a
        # divergence in README.md rather than pinned here.)
        env = dict(os.environ, TICKETS_DIR=self.tickets, LC_ALL="C")
        return subprocess.run(cmd, env=env, capture_output=True, text=True, cwd=self.tickets)


def require_dump():
    """Loud failure beats silently 'passing' with no TS side to compare against."""
    if not os.path.exists(DUMP):
        raise SystemExit("Missing %s -- run `make parity` (or `npm run build:parity`)" % DUMP)
    if not os.path.exists(TS_CLI):
        raise SystemExit("Missing %s -- run `make build`" % TS_CLI)


def require_jq():
    """`query <filter>` spawns external `jq` on BOTH sides, so without jq the run is misleading.

    Measured with a PATH stripped of only jq: nothing passes vacuously -- the run goes red, but
    all three failures misdiagnose it and none names jq. `_check_jsonl` blames fixture drift
    (`.status == "open"` matched 0 rows, expected at least 8), `_check_query_broken_pipe` reports
    `rc=127 on both sides, expected 141`, and the control-character divergence "changed". Refuse
    to start, so the message names jq instead of sending the next maintainer after the fixtures.
    """
    if shutil.which("jq") is None:
        raise SystemExit(
            "jq is not on PATH -- `query <filter>` exits 127 on both sides, and every resulting "
            "failure misdiagnoses it (fixture drift, 127 vs 141). Install jq and re-run."
        )


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
    # The legacy `done` status: `closed` lists it, but a `done` dependency still BLOCKS,
    # because bash's dep resolution compares against "closed" alone. Without this shape the
    # two notions are indistinguishable.
    ([("a", "done", [], "2"), ("b", "open", ["a"], "2"), ("c", "closed", ["a"], "1")], "legacy-done"),
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
