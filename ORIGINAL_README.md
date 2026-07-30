# ticket

The git-backed issue tracker for AI agents. Rooted in the Unix Philosophy, `tk` is inspired by Joe Armstrong's [Minimal Viable Program](https://joearms.github.io/published/2014-06-25-minimal-viable-program.html) with additional quality of life features for managing and querying against complex issue dependency graphs.

Tickets are markdown files with YAML frontmatter in `_tickets/`. This allows AI agents to easily search them for relevant content without dumping ten thousand character JSONL lines into their context window.

Ticket filenames are derived from the title (e.g., `add-sse-connection-management.md`) while a random 25-character ID in the YAML frontmatter serves as the stable identifier for dependencies, links, and lookups.

Because identity lives in the frontmatter rather than the path, you can organize tickets into nested subfolders (e.g. `_tickets/backend/api/add-sse-connection-management.md`) by simply `mv`-ing the files. Every command — `ls`, `ready`, `blocked`, `closed`, `show`, `query`, `dep tree`, `dep cycle`, and all status/link/note edits — searches every nesting level. New tickets are always created at the top level of `_tickets/`.

Every ticket MUST carry an `id` frontmatter field. Since every `.md` file under `_tickets/` is a ticket, a file missing its `id` is a corrupt repo, and commands fail with `Error: <path> has no 'id' frontmatter field` rather than quietly leaving that ticket out of every listing. Restore the `id` (or move the file out of `_tickets/`) to fix it.

The rule is: every `.md` file at any depth under `_tickets/` is a ticket, except those inside a hidden directory. Hidden directories (`.trash`, `.obsidian`, editor/sync sidecars) are skipped along with their entire subtree; hidden *files* are not skipped, so `_tickets/.draft.md` is listed like any other ticket. Symlinked ticket files and a symlinked `_tickets/` directory are followed, and `ls`/`query` list tickets in byte-wise path order so output is deterministic.

## Install

**Homebrew (macOS/Linux):**
```bash
brew tap wedow/tools
brew install ticket
```

**Arch Linux (AUR):**
```bash
yay -S ticket  # or paru, etc.
```

**From source (auto-updates on git pull):**
```bash
git clone https://github.com/wedow/ticket.git
cd ticket && ln -s "$PWD/ticket" ~/.local/bin/tk
```

**Or** just copy `ticket` to somewhere in your PATH.

## Requirements

`tk` is a portable bash script requiring only coreutils and `git`, so it works out of the box on any POSIX system with bash installed. Tickets are anchored to the enclosing git repository root, so `tk` must be run inside a git repo (or with `TICKETS_DIR` set). The `query` command requires `jq`. Uses `rg` (ripgrep) if available, falls back to `grep`.

## Agent Setup

Add this line to your `CLAUDE.md` or `AGENTS.md`:

```
This project uses a CLI ticket system for task management. Run `tk help` when you need to use it.
```

Claude Opus picks it up naturally from there. Other models may need additional guidance.

## Usage

```bash
tk - minimal ticket system with dependency tracking

Usage: tk <command> [args]

Commands:
  create [title] [options] Create ticket, prints JSON with id and full_path
    -d, --description      Description text. Goes into markdown body of the ticket.
                           For newlines use bash $'...\n...' quoting, e.g.:
                             -d $'First line.\n\nSecond paragraph.\n- bullet'
    --design               Design notes
    --acceptance           Acceptance criteria
    -t, --type             Type (bug|feature|task|epic|chore) [default: task]
    -p, --priority         Priority 0-4, 0=highest [default: 2]
    -a, --assignee         Assignee [default: git user.name]
    --external-ref         External reference (e.g., gh-123, JIRA-456)
    --parent               Parent ticket ID
    --tags                 Comma-separated tags (e.g., --tags ui,backend,urgent)
  start <id>               Set status to in_progress
  close <id>               Set status to closed
  reopen <id>              Set status to open
  status <id> <status>     Update status (open|in_progress|closed)
  dep <id> <dep-id>        Add dependency (id depends on dep-id)
  dep tree [--full] <id>   Show dependency tree (--full disables dedup)
  dep cycle                Find dependency cycles in open tickets
  undep <id> <dep-id>      Remove dependency
  link <id> <id> [id...]   Link tickets together (symmetric)
  unlink <id> <target-id>  Remove link between tickets
  ls|list [--status=X] [-a X] [-T X]   List tickets
  ready [-a X] [-T X]      List open/in-progress tickets with deps resolved
  blocked [-a X] [-T X]    List open/in-progress tickets with unresolved deps
  closed [--limit=N] [-a X] [-T X] List recently closed tickets (default 20, by mtime)
  show <id>                Display ticket
  edit <id>                Open ticket in $EDITOR
  add-note <id> [text]     Append timestamped note (or pipe via stdin)
  query [jq-filter]        Output tickets as JSONL (includes full_path)

Tickets live at <git-repo-root>/_tickets (override with TICKETS_DIR env var)
Tickets stored as markdown files in _tickets/ (filenames derived from title)
IDs are stored in frontmatter; supports partial ID matching
```

## Testing

The tests are written in the Behavior-Driven Development library [behave](https://behave.readthedocs.io/en/latest/) and require Python.

If you have `uv` [installed](https://docs.astral.sh/uv/getting-started/installation/) simply:

```sh
make test
```

## License

[Thorg Core License, Version 1.0](LICENSE.md) (ThorgCL-1.0)

Portions derived from [wedow/ticket](https://github.com/wedow/ticket) under MIT — see [THIRD_PARTY_LICENSES.md](THIRD_PARTY_LICENSES.md).
