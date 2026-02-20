# Plan Review: Change Default Directory from `.tickets` to `_tickets`

## Executive Summary

The plan is well-structured, thorough, and correctly identifies this as a mechanical string replacement across 6 files. The approach is sound: no backward compatibility fallback, KISS principle applied correctly. I found **two missed files** (`bash_ticket` and `features/ticket_directory.feature` line 100 scenario name) and **one false positive** in the plan's CLAUDE.md analysis. With the minor additions noted below, this plan is ready for implementation. PLAN_ITERATION can be skipped if the implementer addresses the additions inline.

## Critical Issues (BLOCKERS)

None.

## Major Concerns

### 1. Missed file: `bash_ticket`

- **Concern:** The file `bash_ticket` at the repo root is a near-copy of `ticket` and contains all the same `.tickets` references (lines 7, 9, 14, 17, 18, 23, 30, 36, 56, 60, 1555, 1556). The plan does not mention this file at all.
- **Why:** If `bash_ticket` is kept as a reference/backup copy of the script, leaving it with `.tickets` creates inconsistency. If it is not meant to be maintained, it should still be noted as an intentional exclusion.
- **Suggestion:** Either (a) update `bash_ticket` with the same `.tickets` -> `_tickets` replacements, or (b) explicitly document it as out-of-scope with reasoning (e.g., "historical reference, not actively maintained"). The plan should mention it either way.

### 2. Missed file: `features/ticket_edit.feature` line 14 contains directory name in assertion

- **Concern:** This IS identified in the plan (Phase 3, line 14: `".tickets/editable-ticket.md"` -> `"_tickets/editable-ticket.md"`). Confirmed correct. No issue here.

### 3. Scenario name on `ticket_directory.feature` line 100

- **Concern:** The plan identifies line 100 as needing change: `Existing .tickets takes priority` -> `Existing _tickets takes priority`. This is correct, but note that this scenario name change also has a semantic implication -- the scenario description says `.tickets` takes priority over `.git`. After the change, `_tickets` takes priority. The scenario behavior is unchanged, only the name reference. Confirmed correct.

## Simplification Opportunities (PARETO)

### 1. Use a single `sed` command per file instead of line-by-line enumeration

- **Current approach:** The plan enumerates every single line number for each file.
- **Simpler alternative:** `sed -i 's/\.tickets/_tickets/g' ticket` (or equivalent) handles it in one pass per file.
- **Value:** The implementer does not need to manually track line numbers that will drift. The line-by-line enumeration is useful for review but the implementation should use bulk replacement. The plan should note this.

### 2. Verification commands are already good

The plan's verification approach (`grep -c '\.tickets' <file>` should return 0) is exactly right. No change needed.

## Minor Suggestions

### A. `features/environment.py` line 21 is NOT a match

The grep output shows `context.tickets = {}` on line 21 of `features/environment.py`. The plan correctly does NOT list this file for changes -- `context.tickets` is a Python attribute name (the dot is `context.tickets`), not a reference to the `.tickets` directory. Confirmed: no change needed here.

### B. `doc/` directory references

The grep found `.tickets` references in:
- `doc/ralph/spec-port-to-kotlin/spec-port-to-kotlin-high-level.md` (lines 18, 27, 109, 128)
- `doc/ralph/spec-port-to-kotlin/tasks/todo/01_module_bootstrap_and_core_infrastructure.md` (lines 36, 40, 102, 104, 130)
- `doc/ralph/spec-port-to-kotlin/tasks/todo/02_crud_and_status_commands.md` (line 62)

These are spec/design documents for a Kotlin port. The plan does not mention them. **Decision needed:** Should these be updated too, or are they considered historical design documents? Given they describe future behavior (a Kotlin port of the same tool), they probably should be updated. But this is low priority -- they are internal planning docs, not user-facing.

**Suggestion:** Add a note in the plan: "doc/ralph/ spec files also reference `.tickets` but are spec documents for a future Kotlin port. Update them if convenient, or leave as follow-up."

### C. Parent repo CLAUDE.md

The plan correctly identifies this as out-of-scope and suggests a follow-up. Good decision.

### D. This submodule's CLAUDE.md

The plan's CLAUDE.md section says the reference is "in the parent repo's CLAUDE.md, not this submodule." I verified this submodule's CLAUDE.md at `/usr/local/workplace/mirror/thorg-root-mirror-4/submodules/note-ticket/CLAUDE.md` -- it does NOT contain `.tickets` directly. It says "Entries stored as markdown" but only via the parent CLAUDE.md's `tk help` block. **Confirmed: no change needed in this submodule's CLAUDE.md itself.**

However, this submodule's CLAUDE.md says the script is "~1000 lines" (line 9) but the actual script is ~1542 lines. This is pre-existing inaccuracy, not related to this change.

### E. CHANGELOG historical entries

The plan correctly decides NOT to change historical changelog entries (lines 17, 38, 51). These document what happened at that point in time. Good decision.

### F. `ask.dnc.md` and `formatted_request.dnc.md`

These files at the repo root also reference `.tickets` (they appear to be the original task request). They are not user-facing and do not need updating. The plan correctly does not mention them.

## Strengths

1. **KISS applied correctly**: No backward compatibility fallback. The `TICKETS_DIR` env var escape hatch is sufficient. This avoids adding branching logic for a temporary migration window.
2. **Thorough enumeration**: Every line number in every file is enumerated with the exact change needed. This makes implementation trivially verifiable.
3. **Clear acceptance criteria**: The testing strategy is well-defined. No new tests needed -- just verifying existing tests pass after the rename.
4. **Correct decision on CHANGELOG**: Not modifying historical entries is the right call.
5. **Phased approach**: The 5-phase structure (script -> step defs -> features -> docs -> verify) is logical and prevents partial breakage during implementation.

## Summary of Findings

| Finding | Severity | Action |
|---------|----------|--------|
| `bash_ticket` file missed | Major | Add to plan or explicitly exclude |
| `doc/ralph/` spec files missed | Minor | Add note, update if convenient |
| `features/environment.py` is a false positive | N/A | Confirmed not needed (already correct in plan) |
| CLAUDE.md in submodule is clean | N/A | Confirmed not needed (already correct in plan) |
| Makefile, CI, scripts, pkg -- all clean | N/A | Confirmed: no `.tickets` references |
| `ask.dnc.md`, `formatted_request.dnc.md` | N/A | Task request files, not user-facing |

## Verdict

- [ ] APPROVED
- [x] APPROVED WITH MINOR REVISIONS
- [ ] NEEDS REVISION
- [ ] REJECTED

**Required before implementation:**
1. Address `bash_ticket` -- either add it to the plan or explicitly mark as excluded with reasoning.
2. Note `doc/ralph/` spec files as a follow-up or update them inline.

These are minor enough that the implementer can handle them during implementation without a plan iteration cycle. **PLAN_ITERATION can be skipped.**
