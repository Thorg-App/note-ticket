# Private Context: Strip Plugin System

## Key Line Numbers and Code Locations

All references are to `/usr/local/workplace/thorg-root/submodules/note-ticket/ticket`.

### Code to DELETE from `ticket` script

**`_list_plugins()` function -- lines 1460-1493:**
```
# List installed plugins with descriptions
...
done < <(compgen -c "${prefix}-" 2>/dev/null | sort -u)
    done
}
```

**Plugin listing in `cmd_help()` -- lines 1535-1556:**
```
    # List installed plugins
    local plugins
    plugins=$(_list_plugins 2>/dev/null)
    if [[ -n "$plugins" ]]; then
        cat << EOF

Plugins (tk-<cmd> or ticket-<cmd> in PATH):
$plugins
EOF
    fi

    cat << EOF

Use 'super' to bypass plugins. Plugins receive TICKETS_DIR and TK_SCRIPT
env vars; use '\$TK_SCRIPT super <cmd>' to call built-ins.

Plugin descriptions: comment '# tk-plugin: text' or --tk-describe flag

Searches parent directories for .tickets/, stopping at .git boundary (override with TICKETS_DIR env var)
...
```
Replace with just the 3 informational lines about searching/storage/IDs.

**`super` line in help usage -- line 1532:**
```
  super <cmd> [args]       Bypass plugins, run built-in command directly
```

**`super` bypass block -- lines 1561-1566:**
```
_tk_super=0
if [[ "${1:-}" == "super" ]]; then
    _tk_super=1
    shift
fi
```

**Plugin dispatch block -- lines 1568-1581:**
```
if [[ $_tk_super -eq 0 && -n "${1:-}" && "${1:-}" != "help" && "${1:-}" != "--help" && "${1:-}" != "-h" ]]; then
    for _prefix in tk ticket; do
        _plugin="${_prefix}-$1"
        if command -v "$_plugin" &>/dev/null; then
            export TICKETS_DIR="${TICKETS_DIR:-$(find_tickets_dir 2>/dev/null || echo "")}"
            export TK_SCRIPT="$(cd "$(dirname "$0")" && pwd)/$(basename "$0")"
            shift
            exec "$_plugin" "$@"
        fi
    done
fi
```

### Code to modify in `cmd_help()`

The final help output after removing plugins should look like:

```bash
cmd_help() {
    local cmd
    cmd=$(basename "$0")
    cat << EOF
$cmd - minimal ticket system with dependency tracking

Usage: $cmd <command> [args]

Commands:
  create [title] [options] Create ticket, prints JSON with id and full_path
    -d, --description      Description text
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
  edit <id>                Open ticket in \$EDITOR
  add-note <id> [text]     Append timestamped note (or pipe via stdin)
  query [jq-filter]        Output tickets as JSONL (includes full_path)

Searches parent directories for .tickets/, stopping at .git boundary (override with TICKETS_DIR env var)
Tickets stored as markdown files in .tickets/ (filenames derived from title)
IDs are stored in frontmatter; supports partial ID matching
EOF
}
```

### Code to modify in `ticket_steps.py`

In `step_run_command()` (around line 407), remove the plugin_dir PATH injection:

```python
    # REMOVE these 3 lines:
    # Include plugin directory in PATH if plugins were created
    env = os.environ.copy()
    if hasattr(context, 'plugin_dir'):
        env['PATH'] = context.plugin_dir + ':' + env.get('PATH', '')
```

But keep passing `env` (just use `os.environ.copy()` without modification), or omit the `env` param entirely since there is no customization. Actually, other steps (like `step_run_command_with_env`) set custom env, so this is step-specific. For `step_run_command`, removing the plugin_dir block means `env` is just a copy of `os.environ` -- we can simplify to just remove the conditional block and keep `env = os.environ.copy()`.

### Plugin steps to DELETE from `ticket_steps.py` (lines 809-928)

```python
# ============================================================================
# Plugin Steps
# ============================================================================

def create_plugin(context, name, content):
    ...

def run_with_plugin_path(context, command):
    ...

@given(r'a plugin "(?P<name>[^"]+)" that outputs "(?P<output>[^"]+)"')
...
@given(r'a plugin "(?P<name>[^"]+)" that outputs its arguments')
...
@given(r'a plugin "(?P<name>[^"]+)" that outputs TICKETS_DIR')
...
@given(r'a plugin "(?P<name>[^"]+)" that outputs TK_SCRIPT')
...
@given(r'a plugin "(?P<name>[^"]+)" with description "(?P<desc>[^"]+)"')
...
@given(r'a plugin "(?P<name>[^"]+)" that outputs "(?P<output>[^"]+)" without metadata')
...
@given(r'a plugin "(?P<name>[^"]+)" that calls super create')
...
@when(r'I run "(?P<command>(?:[^"\\]|\\.)+)" with plugins')
...
```

### `environment.py` -- line 32-33 to remove:

```python
    if hasattr(context, 'plugin_dir') and os.path.exists(context.plugin_dir):
        shutil.rmtree(context.plugin_dir)
```

### Files to DELETE entirely

- `/usr/local/workplace/thorg-root/submodules/note-ticket/features/ticket_plugins.feature`
- `/usr/local/workplace/thorg-root/submodules/note-ticket/plugins/README.md` (and the `plugins/` directory)
- `/usr/local/workplace/thorg-root/submodules/note-ticket/pkg/extras.txt`
- `/usr/local/workplace/thorg-root/submodules/note-ticket/pkg/aur/ticket-extras/PKGBUILD` (and the directory)
- `/usr/local/workplace/thorg-root/submodules/note-ticket/pkg/aur/ticket/PKGBUILD` (and the directory)

### publish-homebrew.sh simplification

Remove from `main()`:
- Step 2: plugin formula generation loop (lines 88-96)
- Step 3: ticket-extras formula (lines 98-121)
- Step 4: ticket meta-formula (lines 123-145)
- `parse_plugin_metadata()` function (lines 13-20)
- `generate_plugin_formula()` function (lines 22-55)

Keep:
- Step 1: ticket-core formula generation (lines 68-86)
- Clone tap, commit, push logic

### publish-aur.sh simplification

Remove from `main()`:
- Step 2: individual plugin publishing (lines 147-159)
- Step 3: ticket-extras publishing (lines 161-181)
- Step 4: ticket meta-package publishing (lines 183-187)
- `parse_plugin_metadata()` function (lines 28-34)
- `generate_plugin_pkgbuild()` function (lines 96-131)

Keep:
- Step 1: ticket-core publishing (lines 143-145)
- `setup_ssh()`, `generate_srcinfo()`, `push_to_aur()`, `update_pkgbuild()` -- all generic helpers
- Failed summary logic

### Test baseline

Current state (before changes):
- 12 features (11 passing, 1 failing -- plugins)
- 142 scenarios (133 passing, 9 failing -- all plugin scenarios)

Expected after changes:
- 11 features, all passing
- 133 scenarios, all passing

### README.md sections to remove

The `## Plugins` section starts after the Usage code block and runs through the plugin code examples. Approximate content to remove:

```markdown
## Plugins

Executables named `tk-<cmd>` or `ticket-<cmd>` in your PATH are invoked automatically...
...
Use `tk super <cmd>` to bypass plugins and run the built-in directly.
```

Also remove `super` from the usage block in README.

### CLAUDE.md sections to remove

1. `**Plugin system:**` paragraph in Architecture section
2. Entire `## Plugins` section with subsections:
   - Directory Structure
   - Plugin File Conventions
   - Extracting Commands to Plugins
   - Creating New Plugins
3. Plugin references in `## Releases & Packaging`:
   - Remove `ticket-extras`, individual plugin packages, mix-and-match examples
   - Simplify to just `ticket-core`
4. Plugin references in CI Publishing subsection

### CHANGELOG.md edits

Remove from `### Added` under `[Unreleased]`:
```
- Plugin system: executables named `tk-<cmd>` or `ticket-<cmd>` in PATH are invoked automatically
- `super` command to bypass plugins and run built-in commands directly
- `TICKETS_DIR` and `TK_SCRIPT` environment variables exported for plugins
- `help` command lists installed plugins with descriptions
- Plugin metadata: `# tk-plugin:` comment for scripts, `--tk-describe` flag for binaries
- Multi-package distribution: `ticket-core`, `ticket-extras`, and individual plugin packages
- CI scripts for publishing to Homebrew tap and AUR
```

Add to `### Removed` under `[Unreleased]`:
```
- Plugin system: external command dispatch (`tk-<cmd>` / `ticket-<cmd>`), `super` command, plugin help listing
- Multi-package distribution: `ticket-extras` meta-package and individual plugin packages
```
