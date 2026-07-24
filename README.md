Refer to original README at [./ORIGINAL_README.md](./ORIGINAL_README.md)

Install `ticket` (as `tk`) on your PATH and run it inside any git repository.
Tickets are stored at the repository root under `<git-repo-root>/_tickets`,
resolved via `git rev-parse --show-toplevel`. Override with the `TICKETS_DIR`
env var.

Tickets may be organized into nested subfolders (e.g. `_tickets/backend/api/foo.md`)
by simply moving the files. Every command searches all nesting levels; identity is
the `id` in the frontmatter, not the path. New tickets are always created at the top
level of `_tickets/`.

Every non-hidden `.md` file at any depth under `_tickets/` is a ticket. Hidden
directories (`.trash`, `.obsidian`, ...) are skipped, symlinked ticket files and a
symlinked `_tickets/` are followed, and `ls`/`query` list tickets in path order.


