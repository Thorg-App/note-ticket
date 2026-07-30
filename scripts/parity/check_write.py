#!/usr/bin/env python3
"""Differential parity for the WRITE commands: `create`, the `status` family, `dep`/`undep`,
`link`/`unlink`, `add-note` and `edit`.

Every other check in this harness reads: the fixtures are written by Python and only the
printed output is compared. A write command's real contract is the FILE BYTES it leaves
behind, so this check runs the same command sequence twice -- once against the pinned bash
copy, once against the shipped `./ticket` -- in two freshly created, identical repos, and
compares a transcript of `rc` + stdout + stderr for every command PLUS every byte of every
file under `_tickets/`.

The two things that cannot match by construction are neutralized rather than ignored:
generated ids become `<ID1>`, `<ID2>`, ... (consistently, so a reference to a previously
created ticket still has to line up) and ISO timestamps become `<TS>`. Everything else --
frontmatter key order, `closed_iso`'s insertion position, the slug chosen for a colliding
title, the JSON line, the usage wording, the exit code -- is compared literally.

A case may declare `diverges=True`: then the two sides MUST differ, and the check fails if
they ever agree again. That is how the write-command entries in README.md's whitelist are
pinned (#10, #11, #12) instead of merely described.
"""
import difflib
import os
import re
import shutil
import subprocess
import tempfile

from harness import REPO, TICKET, BashReference

# Random ids and wall-clock timestamps are the only unavoidable difference between two runs.
_GENERATED_ID = re.compile(r"nid_[a-z0-9]{25}_e")
_ISO_TIMESTAMP = re.compile(r"\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}Z")

# `create` falls back to `git config user.name`, so the harness must OWN that value: the
# developer's or CI's global config would otherwise leak into the compared bytes.
CONFIGURED_USER_NAME = "Parity Tester"

# A `user.name` bash writes VERBATIM: `$( )` strips trailing newlines and nothing else.
PADDED_USER_NAME = "  Padded Name  "


class WriteRepo:
    """A throwaway git repo whose `_tickets/` dir the command under test creates itself.

    WHY-NOT `harness.TempRepo`: that one pre-creates `_tickets/`, points `TICKETS_DIR` at it
    and runs commands from inside it. Half of what a write command must get right is exactly
    what happens when the directory does NOT exist, and `create` resolving the repo root from
    a working directory is part of the contract.
    """

    def __init__(self, fixtures, user_name, symlinks=None):
        self.root = tempfile.mkdtemp(prefix="parity-write-", dir=os.path.join(REPO, ".tmp"))
        subprocess.run(["git", "init", "-q", self.root], check=True)
        subprocess.run(["git", "config", "user.name", user_name], cwd=self.root, check=True)
        for relative, content in fixtures.items():
            path = os.path.join(self.root, relative)
            os.makedirs(os.path.dirname(path), exist_ok=True)
            with open(path, "w") as f:
                f.write(content)
        for relative, target in (symlinks or {}).items():
            path = os.path.join(self.root, relative)
            os.makedirs(os.path.dirname(path), exist_ok=True)
            os.symlink(target, path)

    def transcript(self, program, commands):
        """`rc`/stdout/stderr of each command, then a dump of the whole tickets tree."""
        parts = []
        for command in commands:
            result = self._run(program, command)
            parts.append(
                "$ tk %s\nrc=%d\n--out--\n%s--err--\n%s"
                % (" ".join(repr(a) for a in command), result.returncode,
                   result.stdout, result.stderr)
            )
        parts.append("--- TREE ---\n" + self._tree_dump())
        return self._normalize("".join(parts))

    def remove(self):
        shutil.rmtree(self.root, ignore_errors=True)

    def _run(self, program, command):
        # LC_ALL=C for the same reason as the read checks; TICKETS_DIR unset so both sides
        # resolve the dir through `git rev-parse --show-toplevel`, as a user would.
        env = dict(os.environ, LC_ALL="C")
        env.pop("TICKETS_DIR", None)
        return subprocess.run([program] + list(command), cwd=self.root, env=env,
                              capture_output=True, text=True, stdin=subprocess.DEVNULL)

    def _tree_dump(self):
        tickets = os.path.join(self.root, "_tickets")
        if not os.path.isdir(tickets):
            return "<no _tickets dir>\n"
        dumped = []
        for directory, subdirectories, filenames in os.walk(tickets):
            subdirectories.sort()
            for filename in sorted(filenames):
                path = os.path.join(directory, filename)
                # WHETHER an entry is still a symlink is part of the compared state: bash's
                # `add-note` appended THROUGH a link with `>>`, while a write-then-rename
                # replaces the link with a regular file. Without this marker both sides dump
                # the dereferenced content and that difference is invisible.
                kind = " [symlink -> %s]" % os.readlink(path) if os.path.islink(path) else ""
                if os.path.islink(path) and not os.path.exists(path):
                    dumped.append("===== %s%s =====\n<dangling>\n"
                                  % (os.path.relpath(path, self.root), kind))
                    continue
                with open(path, "rb") as f:
                    # `backslashreplace`: a hand-broken fixture need not be valid UTF-8, and
                    # a decode error must not be reported as a parity failure.
                    body = f.read().decode("utf8", "backslashreplace")
                dumped.append("===== %s%s =====\n%s"
                              % (os.path.relpath(path, self.root), kind, body))
        return "".join(dumped) or "<empty _tickets dir>\n"

    def _normalize(self, text):
        text = text.replace(self.root, "<ROOT>")
        text = _ISO_TIMESTAMP.sub("<TS>", text)
        seen = {}

        def placeholder(match):
            return seen.setdefault(match.group(0), "<ID%d>" % (len(seen) + 1))

        return _GENERATED_ID.sub(placeholder, text)


def _fixture(ticket_id, title, extra_lines=(), body="Body.\n"):
    lines = ["---", "id: %s" % ticket_id, 'title: "%s"' % title, "status: open"]
    lines.extend(extra_lines)
    return "\n".join(lines + ["---", "", body])


ALPHA_ID = "nid_aaaaaaaaaaaaaaaaaaaaaaaaa_e"
GAMMA_ID = "nid_ccccccccccccccccccccccccc_e"

# alpha: a full ticket. beta: only the fields bash's `create` does not guarantee are absent
# (a status change must ADD the stamps). gamma: already closed, nested, legacy-`done` sibling.
BASE = {
    "_tickets/alpha.md": _fixture(
        ALPHA_ID, "Alpha",
        ["deps: []", "links: []", "created_iso: 2020-01-01T00:00:00Z",
         "status_updated_iso: 2020-01-01T00:00:00Z", "type: task", "priority: 2"]),
    "_tickets/beta.md": _fixture("nid_bbbbbbbbbbbbbbbbbbbbbbbbb_e", "Beta"),
    "_tickets/nested/gamma.md": "\n".join([
        "---", "id: %s" % GAMMA_ID, 'title: "Gamma"', "status: closed",
        "closed_iso: 2019-05-05T05:05:05Z", "deps: []", "links: []",
        "created_iso: 2019-01-01T00:00:00Z", "status_updated_iso: 2019-02-01T00:00:00Z",
        "type: task", "priority: 2", "---", "", "Gamma body.\n"]),
    "_tickets/eps.md": _fixture(
        "nid_eeeeeeeeeeeeeeeeeeeeeeeee_e", "Eps",
        ["deps: []", "links: []", "created_iso: 2018-01-01T00:00:00Z",
         "status_updated_iso: 2018-01-01T00:00:00Z", "type: task", "priority: 2"]),
}
# `status: done` is the legacy spelling; patch it in so `_fixture` stays single-purpose.
BASE["_tickets/eps.md"] = BASE["_tickets/eps.md"].replace("status: open", "status: done")

ALL_OPTIONS = ["create", "Full", "-d", "desc", "--design", "dsn", "--acceptance", "acc",
               "-p", "0", "-t", "bug", "-a", "me", "--external-ref", "REF-1",
               "--tags", "a,b , c"]


def _with(fixtures, relative, content):
    """`fixtures` with one file replaced -- BASE stays the single description of the rest."""
    return dict(fixtures, **{relative: content})


# Hand-written ids where one is a SUBSTRING of another. Generated ids are all 29 bytes, so
# only a hand-edited (or legacy) repo can reach bash's substring matching -- and this repo's
# own `_tickets/` used exactly such ids before the `nid_` scheme.
SUBSTRING_IDS = {
    "_tickets/one.md": _fixture("t-1", "One", ["deps: [t-11]", "links: []"]),
    "_tickets/eleven.md": _fixture("t-11", "Eleven", ["deps: []", "links: []"]),
    "_tickets/nine.md": _fixture("t-9", "Nine", ["deps: [t-1, t-111]", "links: []"]),
    "_tickets/hundred.md": _fixture("t-111", "Hundred", ["deps: []", "links: []"]),
}

# Three tickets already linked in a chain: a-b and b-c exist, a-c does not. WHY this shape:
# `link a b c` then appends at most ONE id per file, which is the only multi-ticket case
# whose result is order-independent and therefore comparable at all (see DIVERGENCE #18).
LINK_CHAIN = {
    "_tickets/one.md": _fixture("t-1", "One", ["deps: []", "links: [t-2]"]),
    "_tickets/two.md": _fixture("t-2", "Two", ["deps: []", "links: [t-1, t-3]"]),
    "_tickets/three.md": _fixture("t-3", "Three", ["deps: []", "links: [t-2]"]),
}

# A link recorded on ONE side only -- the state bash's `unlink` can leave behind.
HALF_LINK = {
    "_tickets/one.md": _fixture("t-1", "One", ["deps: []", "links: [t-2]"]),
    "_tickets/two.md": _fixture("t-2", "Two", ["deps: []", "links: []"]),
}


class Case:
    """One command sequence run on both sides. `diverges` inverts the expectation."""

    def __init__(self, name, commands, fixtures=None, diverges=False,
                 user_name=CONFIGURED_USER_NAME, symlinks=None):
        self.name = name
        self.commands = commands
        self.fixtures = fixtures or {}
        self.diverges = diverges
        self.user_name = user_name
        # `{path under the repo: link target}`, created after `fixtures`.
        self.symlinks = symlinks or {}


CASES = [
    # --- create: arguments and defaults -------------------------------------------------
    Case("create minimal", [["create", "Solo"]]),
    Case("create every option", [ALL_OPTIONS]),
    Case("create no title", [["create"]]),
    Case("create empty title", [["create", ""]]),
    Case("create last positional wins", [["create", "First", "Second"]]),
    Case("create unknown option", [["create", "x", "--bogus"], ["ls"]]),
    Case("create bare hyphen", [["create", "-"]]),
    Case("create priority unvalidated", [["create", "T", "-p", "high"]]),
    Case("create repeated flag last wins", [["create", "T", "-p", "1", "-p", "3"]]),
    Case("create explicit empty assignee", [["create", "T", "-a", ""]]),
    Case("create explicit assignee overrides git", [["create", "T", "-a", "Someone Else"]]),
    Case("create default assignee from git config", [["create", "T"]]),
    Case("create default assignee keeps padding", [["create", "T"]],
         user_name=PADDED_USER_NAME),
    Case("create empty tags", [["create", "T", "--tags", ""]]),
    Case("create tags spacing", [["create", "T", "--tags", "a,b , c"]]),
    Case("create external ref only", [["create", "T", "--external-ref", "R"]]),
    Case("create multiline description", [["create", "T", "-d", "l1\nl2"]]),
    Case("create description that looks like a fence", [["create", "T", "-d", "---"]]),
    # --- create: titles, slugs and collisions -------------------------------------------
    Case("create quotes in title", [["create", 'say "hi" ok']]),
    Case("create unicode and backslash in title", [["create", "é你 \\ back"]]),
    Case("create slug collision three times",
         [["create", "Dup"], ["create", "Dup"], ["create", "Dup"]]),
    Case("create collides with a nested file of the same slug",
         [["create", "Dup"]], {"_tickets/nested/dup.md": BASE["_tickets/alpha.md"]}),
    Case("create punctuation-only titles", [["create", "!!!"], ["create", "???"]]),
    Case("create long title truncation", [["create", "z" * 250]]),
    Case("create leading and trailing spaces", [["create", "  spaced  "]]),
    Case("create brackets and colon", [["create", "a: [b] c"]]),
    # --- create: parent resolution -------------------------------------------------------
    Case("create parent partial id", [["create", "Child", "--parent", "aaaaa"]], BASE),
    Case("create parent exact id", [["create", "Child", "--parent", ALPHA_ID]], BASE),
    Case("create parent unresolvable", [["create", "Child", "--parent", "zzz"], ["ls"]], BASE),
    Case("create parent ambiguous", [["create", "Child", "--parent", "nid_"], ["ls"]], BASE),
    Case("create parent empty", [["create", "Child", "--parent", ""]], BASE),
    # --- create: the tickets directory ---------------------------------------------------
    Case("create from a subdirectory", [["create", "SubMade"]], {"sub/keep.txt": "k\n"}),
    # --- status family -------------------------------------------------------------------
    Case("status no args", [["status"]], BASE),
    Case("status id only", [["status", "aaaaa"]], BASE),
    Case("status invalid value", [["status", "aaaaa", "bogus"]], BASE),
    Case("status invalid value on a missing ticket", [["status", "zzz", "bogus"]], BASE),
    Case("status open", [["status", "aaaaa", "open"]], BASE),
    Case("status in_progress", [["status", "aaaaa", "in_progress"]], BASE),
    Case("status closed adds closed_iso first", [["status", "aaaaa", "closed"]], BASE),
    Case("status extra args ignored", [["status", "aaaaa", "closed", "junk"]], BASE),
    Case("status exact id beats partial", [["status", ALPHA_ID, "closed"]], BASE),
    Case("status partial id is reported expanded", [["close", "aaaaa"]], BASE),
    Case("status on a ticket missing every stamp", [["close", "bbbbb"]], BASE),
    Case("status on a ticket with no status field", [["close", "ddddd"], ["query"]],
         {"_tickets/delta.md": "---\nid: nid_ddddddddddddddddddddddddd_e\n"
                               'title: "Delta"\npriority: 1\n---\n\nDelta body.\n'}),
    Case("close twice", [["close", "aaaaa"], ["close", "aaaaa"]], BASE),
    Case("close then reopen removes closed_iso",
         [["close", "aaaaa"], ["reopen", "aaaaa"]], BASE),
    Case("reopen an already-closed fixture", [["reopen", "ccccc"]], BASE),
    Case("reopen a legacy done ticket", [["reopen", "eeeee"]], BASE),
    Case("close a legacy done ticket", [["close", "eeeee"]], BASE),
    Case("start then close", [["start", "aaaaa"], ["close", "aaaaa"]], BASE),
    Case("start rewrites a nested ticket in place", [["start", "ccccc"], ["ls"]], BASE),
    Case("start no args", [["start"]], BASE),
    Case("close no args", [["close"]], BASE),
    Case("reopen no args", [["reopen"]], BASE),
    Case("close unknown id", [["close", "zzzz"]], BASE),
    Case("close ambiguous id", [["close", "nid_"]], BASE),
    Case("close id with surrounding whitespace", [["close", "  aaaaa  "]], BASE),
    Case("close with no tickets directory", [["close", "x"]]),
    # --- dep / undep ---------------------------------------------------------------------
    Case("dep add", [["dep", "aaaaa", "ccccc"]], BASE),
    Case("dep add twice", [["dep", "aaaaa", "ccccc"], ["dep", "aaaaa", "ccccc"]], BASE),
    Case("dep add a second dependency",
         [["dep", "aaaaa", "ccccc"], ["dep", "aaaaa", "eeeee"]], BASE),
    Case("dep on itself is allowed", [["dep", "aaaaa", "aaaaa"]], BASE),
    Case("dep partial ids are reported expanded", [["dep", "aaaaa", "ccccc"]], BASE),
    Case("dep exact id beats partial", [["dep", ALPHA_ID, GAMMA_ID]], BASE),
    Case("dep id with surrounding whitespace", [["dep", "  aaaaa  ", "ccccc"]], BASE),
    Case("dep rewrites a nested ticket in place", [["dep", "ccccc", "aaaaa"], ["ls"]], BASE),
    Case("dep no args", [["dep"]], BASE),
    Case("dep one arg", [["dep", "aaaaa"]], BASE),
    Case("dep unknown subject", [["dep", "zzz", "aaaaa"], ["query"]], BASE),
    Case("dep unknown dependency", [["dep", "aaaaa", "zzz"], ["query"]], BASE),
    Case("dep ambiguous dependency", [["dep", "aaaaa", "nid_"], ["query"]], BASE),
    Case("dep with no tickets directory", [["dep", "a", "b"]]),
    Case("undep the only dependency",
         [["dep", "aaaaa", "ccccc"], ["undep", "aaaaa", "ccccc"]], BASE),
    Case("undep the first of two",
         [["dep", "aaaaa", "ccccc"], ["dep", "aaaaa", "eeeee"], ["undep", "aaaaa", "ccccc"]],
         BASE),
    Case("undep the last of two",
         [["dep", "aaaaa", "ccccc"], ["dep", "aaaaa", "eeeee"], ["undep", "aaaaa", "eeeee"]],
         BASE),
    Case("undep a dependency that is not there", [["undep", "aaaaa", "ccccc"]], BASE),
    Case("undep no args", [["undep"]], BASE),
    Case("undep one arg", [["undep", "aaaaa"]], BASE),
    Case("undep unknown dependency", [["undep", "aaaaa", "zzz"]], BASE),
    # --- link / unlink --------------------------------------------------------------------
    Case("link two tickets", [["link", "aaaaa", "ccccc"]], BASE),
    Case("link two tickets twice", [["link", "aaaaa", "ccccc"], ["link", "aaaaa", "ccccc"]],
         BASE),
    Case("link three tickets, one new pairing each", [["link", "t-1", "t-2", "t-3"]],
         LINK_CHAIN),
    Case("link no args", [["link"]], BASE),
    Case("link one arg", [["link", "aaaaa"]], BASE),
    Case("link aborts on an unresolvable id without mutating",
         [["link", "aaaaa", "zzz"], ["query"]], BASE),
    Case("link aborts on an unresolvable FIRST id", [["link", "zzz", "aaaaa"], ["query"]],
         BASE),
    Case("unlink what link created", [["link", "aaaaa", "ccccc"], ["unlink", "aaaaa", "ccccc"]],
         BASE),
    Case("unlink a link the subject alone records", [["unlink", "t-1", "t-2"]], HALF_LINK),
    Case("unlink a link only the TARGET records", [["unlink", "t-2", "t-1"]], HALF_LINK),
    Case("unlink a link that is not there", [["unlink", "aaaaa", "ccccc"]], BASE),
    Case("unlink a ticket with no links field", [["unlink", "bbbbb", "aaaaa"]], BASE),
    Case("unlink itself", [["unlink", "aaaaa", "aaaaa"]], BASE),
    Case("unlink no args", [["unlink"]], BASE),
    Case("unlink one arg", [["unlink", "aaaaa"]], BASE),
    Case("unlink unknown target", [["unlink", "aaaaa", "zzz"]], BASE),
    # --- add-note --------------------------------------------------------------------------
    # NB every command here runs with stdin=DEVNULL, i.e. readable and at EOF but NOT a
    # terminal. That is bash's stdin arm, so `add-note <id>` with no text appends an EMPTY
    # note on both sides; the "no note provided" arm needs a real TTY and is unit-tested.
    Case("add-note with text", [["add-note", "aaaaa", "A note"]], BASE),
    Case("add-note twice keeps one heading",
         [["add-note", "aaaaa", "First"], ["add-note", "aaaaa", "Second"]], BASE),
    Case("add-note with no text at all", [["add-note", "aaaaa"]], BASE),
    Case("add-note with an explicitly empty text", [["add-note", "aaaaa", ""]], BASE),
    Case("add-note joins several words", [["add-note", "aaaaa", "two", "words"]], BASE),
    Case("add-note leaves the frontmatter alone", [["add-note", "aaaaa", "x"], ["query"]], BASE),
    Case("add-note rewrites a nested ticket in place", [["add-note", "ccccc", "x"], ["ls"]], BASE),
    Case("add-note partial and exact ids", [["add-note", "aaaaa", "x"], ["add-note", ALPHA_ID, "y"]],
         BASE),
    Case("add-note id with surrounding whitespace", [["add-note", "  aaaaa  ", "x"]], BASE),
    Case("add-note no args", [["add-note"]], BASE),
    Case("add-note unknown id", [["add-note", "zzz", "x"]], BASE),
    Case("add-note ambiguous id", [["add-note", "nid_", "x"]], BASE),
    Case("add-note with no tickets directory", [["add-note", "x", "y"]]),
    # A ticket whose Notes section already exists: bash grepped `^## Notes` over the whole
    # FILE, so no second heading is added.
    Case("add-note to an existing notes section", [["add-note", "aaaaa", "x"]],
         _with(BASE, "_tickets/alpha.md",
               BASE["_tickets/alpha.md"] + "\n## Notes\n\n**2020-01-01T00:00:00Z**\n\nOld\n")),
    # `## Notesish` starts with the heading, which bash's `grep -q '^## Notes'` accepts.
    Case("add-note where a body line merely starts with the heading",
         [["add-note", "aaaaa", "x"]],
         _with(BASE, "_tickets/alpha.md", BASE["_tickets/alpha.md"].replace("Body.", "## Notesish"))),
    # Shapes where a body-level append and a FILE-level append part ways: bash appends bytes to
    # the end of the file, so no marker is invented and nothing before the first `---` is lost.
    Case("add-note to a file that does not end in a newline", [["add-note", "aaaaa", "x"]],
         _with(BASE, "_tickets/alpha.md", BASE["_tickets/alpha.md"].rstrip("\n"))),
    Case("add-note to a file with text before the opening marker", [["add-note", "aaaaa", "x"]],
         _with(BASE, "_tickets/alpha.md", "lead\n" + BASE["_tickets/alpha.md"])),
    Case("add-note to an unterminated frontmatter block", [["add-note", "t-1", "x"]],
         {"_tickets/one.md": '---\nid: t-1\ntitle: "One"\nstatus: open\n'}),
    # A SYMLINKED ticket, the shape that separates "append bytes" from "rewrite the file":
    # bash's `>>` wrote through the link and left it a link. The target lives OUTSIDE
    # `_tickets/`, so the id is enumerated exactly once.
    Case("add-note through a symlinked ticket", [["add-note", "t-1", "noted"]],
         {"outside.md": _fixture("t-1", "Outside")},
         symlinks={"_tickets/link.md": "../outside.md"}),
    # The contrast, and the reason `appendTo` is a separate operation: a FRONTMATTER edit
    # replaces the file on both sides — bash's `_sed_i` is also `sed > tmp && mv`.
    Case("status through a symlinked ticket", [["close", "t-1"]],
         {"outside.md": _fixture("t-1", "Outside")},
         symlinks={"_tickets/link.md": "../outside.md"}),
    # --- edit ------------------------------------------------------------------------------
    # stdout is a pipe here, so both sides take the "print the path" arm. The editor arm needs
    # a terminal on BOTH streams and is unit-tested instead.
    Case("edit prints the path", [["edit", "aaaaa"]], BASE),
    Case("edit a nested ticket", [["edit", "ccccc"]], BASE),
    Case("edit exact id", [["edit", ALPHA_ID]], BASE),
    Case("edit no args", [["edit"]], BASE),
    Case("edit unknown id", [["edit", "zzz"]], BASE),
    Case("edit ambiguous id", [["edit", "nid_"]], BASE),
    Case("edit with no tickets directory", [["edit", "x"]]),
    # --- declared divergences (README.md "Whitelisted divergences") ----------------------
    # #10: bash dies with the shell's own `$2: unbound variable`.
    Case("DIVERGENCE #10 value flag ends the argument list", [["create", "x", "--design"]],
         diverges=True),
    # #11: bash's line-oriented sed keeps the LF in the filename and emits invalid JSON.
    Case("DIVERGENCE #11 newline in title", [["create", "line1\nline2"]], diverges=True),
    # #12: bash's `[[ -f ]]` is false for a directory, so it redirects INTO it and dies.
    Case("DIVERGENCE #12 slug already exists as a directory", [["create", "Dup"]],
         {"_tickets/dup.md/inner.txt": "x\n"}, diverges=True),
    # #5: bash's `json_escape` handles `\` and `"` only, so a raw tab lands inside the JSON
    # string `create` prints and makes the line unparseable. `create` is how that value gets
    # into a ticket in the first place, so this is where the divergence is BORN.
    Case("DIVERGENCE #5 tab in title", [["create", "tab\there"]], diverges=True),
    # #9: awk's `index(s, "")` is 1, so bash's empty id matched a ticket.
    Case("DIVERGENCE #9 empty id", [["close", ""]], BASE, diverges=True),
    # #13: bash tested membership with `grep` and removed with `sed`, i.e. on the array TEXT.
    # `t-11` is not among t-9's deps, but it OCCURS inside the recorded `t-111`.
    Case("DIVERGENCE #13 dep whose id is a substring of a recorded one",
         [["dep", "t-9", "t-11"]], SUBSTRING_IDS, diverges=True),
    Case("DIVERGENCE #13 undep mangles a sibling id it is a substring of",
         [["undep", "t-9", "t-1"]], SUBSTRING_IDS, diverges=True),
    Case("DIVERGENCE #13 array text is re-serialized canonically",
         [["dep", "aaaaa", "eeeee"]],
         _with(BASE, "_tickets/alpha.md",
               BASE["_tickets/alpha.md"].replace("deps: []", "deps: [%s,%s]" % (GAMMA_ID,
                                                                               ALPHA_ID))),
         diverges=True),
    # #14: `yaml_field`'s grep finds nothing, and the failing pipeline trips `set -e`, so
    # bash exits 1 having printed NOTHING at all.
    Case("DIVERGENCE #14 dep on a ticket with no deps field", [["dep", "bbbbb", "aaaaa"]],
         BASE, diverges=True),
    Case("DIVERGENCE #14 undep on a ticket with no deps field", [["undep", "bbbbb", "aaaaa"]],
         BASE, diverges=True),
    # #15: bash's awk only ever REWROTE an existing `links:` line, so a ticket without one
    # gained no link and contributed 0 to the count.
    Case("DIVERGENCE #15 link a ticket with no links field", [["link", "aaaaa", "bbbbb"]],
         BASE, diverges=True),
    # #16: bash's `/^links:/` and `s/^deps:.*/` are not confined to the frontmatter block.
    Case("DIVERGENCE #16 link with a links: line in the BODY", [["link", "aaaaa", "ccccc"]],
         _with(BASE, "_tickets/alpha.md",
               BASE["_tickets/alpha.md"].replace("Body.", "links: [ghost]\ntail")),
         diverges=True),
    Case("DIVERGENCE #16 dep with a deps: line in the BODY", [["dep", "aaaaa", "ccccc"]],
         _with(BASE, "_tickets/alpha.md",
               BASE["_tickets/alpha.md"].replace("Body.", "deps: [ghost]\ntail")),
         diverges=True),
    # #17: bash treated a repeated id as another ticket and linked it to itself.
    Case("DIVERGENCE #17 link a ticket to itself", [["link", "aaaaa", "aaaaa"]], BASE,
         diverges=True),
    # DIVERGENCE #18 (link append ORDER) has no case on purpose: bash appends in awk's hash
    # order, which is unspecified and differs between awk builds, so neither "agrees" nor
    # "diverges" is a stable expectation here. TS's argument order is pinned by a unit test,
    # and the only multi-ticket case above is the one where each file gains a single id.
]


def _report_diff(name, bash_text, ts_text):
    print("MISMATCH write case=[%s]" % name)
    for line in difflib.unified_diff(bash_text.splitlines(True), ts_text.splitlines(True),
                                     "bash", "ts", n=2):
        print("  " + line.rstrip("\n"))


def run():
    failures = 0
    bash_program = BashReference.path()
    for case in CASES:
        texts = []
        for program in (bash_program, TICKET):
            repo = WriteRepo(case.fixtures, case.user_name, case.symlinks)
            try:
                texts.append(repo.transcript(program, case.commands))
            finally:
                repo.remove()
        bash_text, ts_text = texts
        if case.diverges:
            if bash_text == ts_text:
                failures += 1
                print("DIVERGENCE GONE write case=[%s] -- bash and TS now agree; the "
                      "README.md whitelist entry is stale" % case.name)
        elif bash_text != ts_text:
            failures += 1
            _report_diff(case.name, bash_text, ts_text)
    return failures == 0, "cases=%d failures=%d" % (len(CASES), failures)
