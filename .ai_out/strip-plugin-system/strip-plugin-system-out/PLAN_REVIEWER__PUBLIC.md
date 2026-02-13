# Plan Review: Strip Plugin System from `ticket` CLI

## Executive Summary

The plan is well-structured, thorough, and purely subtractive -- which is the ideal shape for a removal task. It correctly identifies all plugin-related code across the core script, tests, packaging, publishing scripts, and documentation. There are a few factual inaccuracies (scenario count, CHANGELOG handling) and one area where the plan under-specifies behavior (the `env` variable cleanup in test steps), but none are blockers. The plan can proceed with minor corrections applied inline.

## Critical Issues (BLOCKERS)

None.

## Major Concerns

### 1. CHANGELOG Phase 6: Incorrect handling of the second `### Added` section

- **Severity:** MAJOR
- **Description:** The plan says to "Remove all 6 bullet points about plugins (lines 25-31)." However:
  - There are 7 lines (25-31 inclusive), not 6.
  - Line 31 (`- CI scripts for publishing to Homebrew tap and AUR`) is not purely plugin-related -- CI publishing scripts will still exist for `ticket-core`. This line should be kept (possibly reworded to remove the "all" implication) or moved under the first `### Added`.
  - After removing the plugin bullets, the second `### Added` heading (line 24) becomes either empty or contains only line 31. If all bullets are removed, the heading itself must also be removed. If line 31 is kept, it should be merged into the first `### Added` section (line 5) to eliminate the duplicate heading.
- **Recommendation:** Remove lines 25-30 (the 6 plugin-specific bullets). Keep line 31 and move it under the first `### Added` section (line 6). Remove the now-empty second `### Added` heading (line 24). Alternatively, if the implementer deems line 31 also plugin-only, remove lines 24-31 entirely.

### 2. Scenario count is wrong: 131 not 133

- **Severity:** MAJOR (affects acceptance criteria validation)
- **Description:** The plan states "133 non-plugin scenarios" in multiple places (Phase 1 verification, Phase 2 verification, acceptance criteria item 1). Actual count across 11 non-plugin feature files is 131 scenarios (10+21+15+16+3+7+19+7+8+10+15). Using the wrong number means the implementer may think tests are failing when they are not, or vice versa.
- **Recommendation:** Update all references from 133 to 131. Or better: replace exact counts with "all non-plugin scenarios must pass" and let `make test` output speak for itself. The exact number is fragile and unnecessary.

## Simplification Opportunities (PARETO)

### 1. Commit strategy: Single commit is fine

The plan offers multiple commit strategies. For a purely subtractive change with no new code paths, a single commit is cleanest. The phases are logical ordering for the implementer, not commit boundaries. One commit with a clear message like "Remove plugin system" is the simplest and most reviewable approach.

### 2. Phase 4 (publishing scripts) self-correction is good

The plan correctly self-corrects from "rename ticket-core to ticket" to "just remove plugin sections, keep ticket-core naming." This is the right call -- renaming is a separate concern. The revised approach is simpler.

## Minor Suggestions

### 1. `step_run_command()` cleanup under-specified -- Severity: MINOR

- **File:** `/usr/local/workplace/thorg-root/submodules/note-ticket/features/steps/ticket_steps.py`, lines 419-422
- **Description:** The plan says "Remove the plugin PATH injection (lines 420-422)" and "Simplify to just use `os.environ.copy()` directly (no `env` variable customization for plugins)." This wording implies removing the `env = os.environ.copy()` line entirely, but line 431 (`env=env`) still references it. The correct change is: remove only lines 421-422 (the `if hasattr` block), keep line 420 (`env = os.environ.copy()`), and keep `env=env` on line 431.
- **Recommendation:** Clarify: "Remove lines 421-422 (the `if hasattr(context, 'plugin_dir')` block). Keep `env = os.environ.copy()` on line 420 and `env=env` on line 431." Alternatively, the comment on line 419 (`# Include plugin directory in PATH if plugins were created`) should also be removed.

### 2. Feature file count discrepancy -- Severity: MINOR

- The plan says "11 features (was 12 with plugins)" in Phase 2 verification. Currently there are 12 feature files. After deleting `ticket_plugins.feature`, there will be 11. This is correct. No action needed, just confirming.

### 3. `ask.dnc.md` and `formatted_request.dnc.md` not addressed -- Severity: NIT

- These files in the repo root contain plugin references (they appear to be request/prompt files). The plan does not address them. Since they are not project code or documentation, this is a nit. However, if the acceptance criteria grep for "plugin" across the entire repo, these will be flagged.
- **Recommendation:** The acceptance criteria (item 9) correctly limits the grep to specific files, so this is fine as-is. No change needed.

### 4. Missing: remove the comment on line 419 of `ticket_steps.py` -- Severity: NIT

- Line 419 says `# Include plugin directory in PATH if plugins were created`. After removing the plugin logic, this comment becomes orphaned and misleading. The plan does not mention removing it.
- **Recommendation:** Remove the comment on line 419 along with lines 421-422.

## Strengths

1. **Purely subtractive.** The plan introduces zero new code paths. This is the correct approach for a removal task and minimizes risk of regressions.

2. **Correct identification of TICKETS_DIR preservation.** The plan correctly distinguishes between `TICKETS_DIR` as an internal variable (keep) and `export TICKETS_DIR` in plugin dispatch (remove). This is the single most important correctness concern and it is handled well.

3. **Clear phase ordering.** Core script first, then tests, then files, then scripts, then docs. Each phase has a verification step. This ordering means tests can validate the core changes immediately.

4. **Good acceptance criteria coverage.** Manual verification items (help output content, `super` command failure, grep sweeps) are thorough and practical.

5. **Self-correcting on scope.** The plan identifies the package renaming question, considers it, and correctly defers it. This shows good judgment about scope boundaries.

6. **Accurate line number references.** I verified the line numbers in the core `ticket` script against the actual file. The references to `_list_plugins()` (1460-1493), `cmd_help()` (1495-1557), super bypass (1561-1566), and plugin dispatch (1568-1581) are all accurate.

## Verdict

- [ ] APPROVED
- [x] APPROVED WITH MINOR REVISIONS
- [ ] NEEDS REVISION
- [ ] REJECTED

**Rationale:** The plan is sound and complete. The two MAJOR items (scenario count, CHANGELOG handling) are factual corrections that the implementer can easily fix inline. No structural changes to the plan are needed. PLAN_ITERATION can be skipped -- the implementer should apply these corrections during implementation.

## Recommendation on PLAN_ITERATION

**SKIP PLAN_ITERATION.** The issues identified are minor factual corrections, not architectural or structural problems. The implementer should:
1. Use "all non-plugin scenarios must pass" instead of hardcoded 133.
2. Handle the duplicate `### Added` heading in CHANGELOG properly (merge or remove).
3. Keep `env = os.environ.copy()` in `step_run_command()` while removing only the plugin-specific lines.
