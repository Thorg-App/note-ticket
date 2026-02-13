# Phase 5: Documentation Update - Strip Plugin References

## What was done

Removed all plugin-related content from `README.md` and `CLAUDE.md`.

### README.md changes
- Removed `super <cmd> [args]` line from the usage command reference block
- Removed the entire `## Plugins` section (plugin discovery, examples, env vars, calling built-ins from plugins, super command explanation)

### CLAUDE.md changes
- Removed the `**Plugin system:**` description block from the Architecture section
- Removed the entire `## Plugins` section (Directory Structure, Plugin File Conventions, Extracting Commands to Plugins, Creating New Plugins)
- Removed the `### Plugin Changes` subsection and its example from the Changelog section
- Simplified `### Package Structure` from multi-package (ticket, ticket-core, ticket-extras, ticket-<name>) to single package (`ticket-core`)
- Removed the "Users can mix and match" brew install examples
- Removed the plugin publish caveat line from CI Publishing section

## Files modified
- `/usr/local/workplace/thorg-root/submodules/note-ticket/README.md` - Removed plugin section and super command from usage
- `/usr/local/workplace/thorg-root/submodules/note-ticket/CLAUDE.md` - Removed all plugin sections, simplified packaging

## Tests
- All 131 scenarios, 905 steps pass (0 failures, 0 skipped)

## Verification
- Grep for `plugin`, `super`, `extras`, `meta-package`, `tk-`, `ticket-` all return no matches in both files
- No unrelated content was modified
