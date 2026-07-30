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


