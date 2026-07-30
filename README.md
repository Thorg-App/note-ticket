Refer to original README at [./ORIGINAL_README.md](./ORIGINAL_README.md)

Install `ticket` (as `tk`) on your PATH and run it inside any git repository.
Tickets are stored at the repository root under `<git-repo-root>/_tickets`,
resolved via `git rev-parse --show-toplevel`. Override with the `TICKETS_DIR`
env var.

Tickets may be organized into nested subfolders (e.g. `_tickets/backend/api/foo.md`)
by simply moving the files. Every command searches all nesting levels; identity is
the `id` in the frontmatter, not the path. New tickets are always created at the top
level of `_tickets/`.

Every `.md` file at any depth under `_tickets/` is a ticket, except those inside a
hidden directory. Hidden directories (`.trash`, `.obsidian`, ...) are skipped along
with their entire subtree, including non-hidden folders nested under them. Hidden
*files* are not skipped: `_tickets/.draft.md` is listed like any other ticket.
Symlinked ticket files and a symlinked `_tickets/` are followed, and `ls`/`query`
list tickets in path order.

Every ticket MUST carry an `id` frontmatter field. A `.md` file under `_tickets/`
without one is a corrupt repo: commands fail with
`Error: <path> has no 'id' frontmatter field` instead of silently omitting that
ticket from every listing. Restore the `id`, or move the file out of `_tickets/`.
A file whose frontmatter block cannot be read at all is reported separately, as
`Error: <path> has no YAML frontmatter block` — the `id` field is never blamed for
a file that has no block to hold it.

Ticket files must use **LF** line endings. CRLF is not supported: `---\r` is not the
frontmatter fence, so such a file fails with
`Error: <path> frontmatter block is not parseable (CRLF line endings are not supported)`
however complete its frontmatter looks. Convert the file (`dos2unix`), and keep
`git config core.autocrlf` from rewriting `_tickets/` on checkout.

Every command that takes an `<id>` accepts a partial one: an exact match wins, otherwise
the id must contain the text you typed as a substring, and more than one match at the
winning tier is an error. Surrounding whitespace is trimmed. An **empty** id matches
nothing, so `tk show "$UNSET_VAR"` fails instead of picking an arbitrary ticket.

`dep tree [--full] <id>` draws the dependency graph below one ticket. By default every
ticket appears once, at its DEEPEST position in the tree, and siblings are ordered by
subtree depth then id, so the longest chain reads down the left; `--full` draws every path
to every ticket instead. Cycles are cut, not followed.

`dep cycle` lists every dependency cycle among tickets that are not closed, each reported
once (`Cycle 1: a -> b -> a` plus one row per member), and prints
`No dependency cycles found` when there is none. A ticket that merely points INTO a cycle
is not part of one and is not listed.

`dep <id> <dependency-id>`, `undep`, `link <id> <id> [id...]` and `unlink` treat `deps` and
`links` as arrays of whole ids: `undep`/`unlink` remove exactly the id you name and never a
similar-looking neighbour, and a ticket that has no `deps:`/`links:` field yet gains one.
`link` is symmetric — every named ticket gains every other one — so it counts one link per
side (2 tickets = 2 links, 3 tickets = 6), appends new ids in the order you named them, and
counts a repeated id once, and refuses an argument list in which every id turns out to be the
same ticket, because a link to itself is data nothing can act on. A self-*dependency* is
recorded, by contrast: `tk dep a a` is a graph error `dep cycle` reports. `undep` prints `Dependency not found` and `unlink` prints
`Link not found` on stdout, with exit 1, when there was nothing to remove; `unlink` decides
that from the FIRST ticket's links and then clears both sides.

`show <id>` prints the ticket file as it is on disk — with the parent's title appended to
the `parent:` line — followed by the sections `## Blockers` (dependencies that are not
closed), `## Blocking` (non-closed tickets that depend on this one), `## Children`
(tickets whose `parent` is this one) and `## Linked`, each omitted when empty. Output goes
through `$TICKET_PAGER` (else `$PAGER`) only when stdout is a terminal.

`add-note <id> [note text]` appends a timestamped note to the end of the ticket file, under a
`## Notes` heading it adds only if the file has none. With no note text it reads the note from
stdin (so `... | tk add-note <id>` works); it asks for one only when stdin is a terminal, and
piping in nothing records an empty note. Nothing but the appended lines changes — the
frontmatter is untouched, and a symlinked ticket file stays a symlink.

`edit <id>` opens the ticket in `$EDITOR` (default `vi`) when stdin AND stdout are terminals,
and otherwise just prints `Edit ticket file: <path>`, so it is safe in a script. The editor's
exit code becomes the command's. `$EDITOR` is used as a single command name, not split into
words: `EDITOR="code -w"` is looked up verbatim and reported as not found (exit 127).

`closed` lists tickets whose status is `closed` (or the legacy `done`), most recently
modified first. It looks only at the 100 most recently modified ticket files, so a
ticket closed long ago is not listed however large `--limit` is. `--limit=N` takes a
plain count of rows and defaults to 20; anything else is rejected. A symlinked ticket
file is ordered by the link's own modification time, as `ls -t` orders it.

`query` prints one JSON object per line — the frontmatter fields in file order, with
`full_path` appended last — and the output is always valid JSON, control characters
included. `query <jq-filter>` pipes that JSONL through `jq -c "select(<filter>)"`, so
`jq` must be installed for filtering (only then) and its exit code is passed through;
without `jq` on PATH, filtering exits 127 with `Error: jq: command not found`.

Piping a listing into a short reader (`tk ls | head -1`, `tk query ... | head -1`) exits
141, the usual code for SIGPIPE, only once the output is large enough that the write
actually fails. A listing that fits in the pipe buffer is written before the reader goes
away and exits 0, so the exit code depends on how many tickets were listed.


