/** `help` command: usage text. Byte-identical to bash cmd_help in ./ticket. */
export class HelpCommand {
    static render(cmd: string): string {
        return `${cmd} - minimal ticket system with dependency tracking

Usage: ${cmd} <command> [args]

Commands:
  create [title] [options] Create ticket, prints JSON with id and full_path.
                           When creating tickets SPLIT them up so that processing each ticket
                           will fit into 200K context window. IF common planning is required for tickets
                           create a ticket for plan creation and make it a dependency of implementation tickets.
    -d, --description      Description text. Goes into markdown body of the ticket.
                           MUST be self contained, if referencing files make sure they are referenced
                           with full relative path from git repo. And NOT just the file names.
                           This should give GOOD context for new agent picking this up.
                           For newlines use bash $'...\\n...' quoting, e.g.:
                             -d $'First line.\\n\\nSecond paragraph.\\n- bullet'
    --design               Design notes
    --acceptance           Acceptance criteria
    -t, --type             Type (bug|feature|task|epic|chore) [default: task]
    -p, --priority         Priority 0-4, 0=highest [default: 2]
    -a, --assignee         Assignee
    --external-ref         External reference (e.g., gh-123, JIRA-456)
    --parent               Parent ticket ID
    --tags                 Comma-separated tags (e.g., --tags ui,backend,urgent)
  start <id>               Set status to in_progress
  close <id>               Set status to closed
  reopen <id>              Set status to open
  status <id> <status>     Update status (open|in_progress|closed|punted)
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

Tickets live at <git-repo-root>/_tickets (override with TICKETS_DIR env var).
Tickets stored as markdown files in _tickets/ (filenames derived from title)
IDs are stored in frontmatter at 'id' field;
Tickets may be organized into nested subfolders (e.g. _tickets/backend/api/foo.md)
by simply moving the files; all commands search every nesting level.
Every .md file at any depth is a ticket, except those inside a hidden
directory (.trash, .obsidian, ...) - such folders are skipped whole.
Hidden files are NOT skipped (_tickets/.draft.md is a ticket).
ls/query list in path order.
New tickets are always created at the top level of _tickets/.
`;
    }
}
