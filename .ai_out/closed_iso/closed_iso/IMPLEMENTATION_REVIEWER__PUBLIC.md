# Implementation Review: `closed_iso` Field

## Summary

The implementation adds a `closed_iso` ISO timestamp field to ticket frontmatter when a ticket is closed, and removes it when the ticket is reopened or transitioned to any non-closed status. The change is minimal, well-scoped, and follows existing codebase patterns faithfully.

**Overall assessment: APPROVED.** No critical or important issues found. The implementation matches the plan, applies the plan reviewer's feedback, and all new and pre-existing tests pass.

## CRITICAL Issues

None.

## IMPORTANT Issues

None.

## Suggestions

### 1. `remove_yaml_field` scope matches `update_yaml_field` -- consider future hardening (out of scope)

Both `update_yaml_field()` (`/usr/local/workplace/thorg-root/submodules/note-ticket/ticket`, line 193) and `remove_yaml_field()` (line 207) operate on the entire file, not just the YAML frontmatter block. This means if a ticket body contained a line starting with `closed_iso:`, it would be affected. The plan and plan reviewer both acknowledged this is safe for machine-managed fields like `closed_iso`. I agree -- this is consistent with existing patterns and is not a problem for this change. Noting for future awareness only.

### 2. CLAUDE.md change is mildly redundant but acceptable

The original sentence "When adding new commands or flags, add corresponding scenarios to the appropriate feature file" was replaced with "Every new feature or behavior change MUST include BDD scenarios in the appropriate feature file." The plan reviewer recommended dropping this change (DRY concern), but the implementor notes the user explicitly requested it. The replacement is reasonable -- it broadens the scope from "commands/flags" to "features/behavior changes" which is a meaningful improvement. The old sentence was removed rather than duplicated, so there is no DRY violation.

## Verification Results

- **All 6 new scenarios pass** (closing sets timestamp, reopen removes it, status-to-in_progress removes it, never-closed has none, status-close sets it, close-reopen-close cycle).
- **All 127 pre-existing passing scenarios continue to pass** (133 total passing).
- **9 pre-existing plugin test failures are unchanged** (in `features/ticket_plugins.feature` -- unrelated to this change, existed on master).
- **No lines removed** from existing test or production code -- all changes are purely additive.

## Code Quality Assessment

| Criterion | Assessment |
|-----------|-----------|
| **Correctness** | `cmd_status()` is the single entry point for all status transitions (`close`, `reopen`, `start`, `status`). Adding `closed_iso` management here is correct and centralized. |
| **DRY** | `remove_yaml_field()` reuses `_grep` and `_sed_i` -- no code duplication. |
| **SRP** | `remove_yaml_field()` does one thing. `cmd_status()` still has one responsibility (manage status transitions). |
| **KISS** | ~16 lines of production code for a complete feature. No over-engineering. |
| **Portability** | Uses `_sed_i()` (temp file + mv) and `_grep` (rg or grep). Both are portable. The sed `/d` command is POSIX standard. |
| **Idempotency** | `remove_yaml_field` is a no-op when field is absent. `update_yaml_field` overwrites on re-close. Both correct. |
| **Test coverage** | 6 scenarios covering: close, reopen, status transition, never-closed, status-close, and the full cycle. Plan reviewer's feedback applied -- reopen/in_progress scenarios first close via command to test actual field removal. |
| **JSONL output** | `_file_to_jsonl()` auto-emits all frontmatter fields. `closed_iso` appears in query output automatically. No changes needed. |
| **No regressions** | Existing 9 status scenarios and all other feature tests unaffected. No lines removed from any pre-existing file. |

## Files Changed

| File | Lines Added | Change |
|------|-------------|--------|
| `/usr/local/workplace/thorg-root/submodules/note-ticket/ticket` | +16 | `remove_yaml_field()` function + `cmd_status()` modification |
| `/usr/local/workplace/thorg-root/submodules/note-ticket/features/ticket_status.feature` | +45 | 6 new BDD scenarios |
| `/usr/local/workplace/thorg-root/submodules/note-ticket/features/steps/ticket_steps.py` | +20 | 2 new step definitions |
| `/usr/local/workplace/thorg-root/submodules/note-ticket/CLAUDE.md` | 1 changed | BDD testing requirement broadened |
| `/usr/local/workplace/thorg-root/submodules/note-ticket/CHANGELOG.md` | +3 | Unreleased/Added entry |

## Documentation Updates Needed

None. CLAUDE.md and CHANGELOG.md are already updated as part of the implementation.
