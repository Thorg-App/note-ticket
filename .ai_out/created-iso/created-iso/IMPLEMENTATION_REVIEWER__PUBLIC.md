# Review: Rename `created` to `created_iso`

## Verdict: PASS

## Summary

The change renames the `created` YAML frontmatter field to `created_iso` across the entire codebase. The implementation is minimal, focused, and correct. All 120 non-plugin scenarios pass (9 plugin failures are pre-existing environment issues).

Files modified:
- `ticket` (line 302) -- core frontmatter generation
- `features/steps/ticket_steps.py` (lines 63, 276, 545, 547) -- test helpers and regex validation
- `features/ticket_creation.feature` (line 89) -- scenario name
- `.tickets/test-ticket-1.md` (line 7) -- sample ticket
- `CHANGELOG.md` -- added entry

## No CRITICAL or IMPORTANT Issues

The change is clean and complete. No missed references to the old field name exist anywhere in the codebase.

## Suggestions

### CHANGELOG duplicate `### Changed` heading

`/home/nickolaykondratyev/git_repos/note-ticket/CHANGELOG.md` now has two `### Changed` sections under `[Unreleased]` (lines 5 and 11). The new entry should be merged into the existing `### Changed` section:

```markdown
## [Unreleased]

### Removed
- Removed `migrate-beads` command

### Changed
- Renamed `created` frontmatter field to `created_iso` for clarity
- Ticket filenames are now derived from the title ...
```

This is minor -- the changelog is still readable -- but keeping one heading per category is standard keepachangelog format.

## Documentation Updates Needed

None. The `created` field name was not documented in CLAUDE.md or README.md, so no documentation updates are required.
