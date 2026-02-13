# Pareto Complexity Analysis: `closed_iso` Field

## Pareto Assessment: PROCEED

**Value Delivered:** Automatic timestamping of ticket close events, enabling queries like "when was this closed?" and "how long was this open?" -- essential metadata for any ticket system.

**Complexity Cost:** 16 lines of production bash, 20 lines of step definitions, 45 lines of BDD scenarios, 2 documentation lines.

**Ratio:** High

---

## Detailed Analysis

### 1. Value/Complexity Ratio

The production code change is 16 lines:
- 7 lines: `remove_yaml_field()` -- a reusable utility that fills a genuine gap (the codebase had `update_yaml_field` but no removal counterpart).
- 5 lines of logic + 4 lines of structure in `cmd_status()`.

This is the minimum viable implementation. There is no simpler way to achieve the requirement. The implementation reuses every existing abstraction (`_grep`, `_sed_i`, `_iso_date`, `update_yaml_field`), introduces exactly one new function that was genuinely missing, and piggybacks on the existing centralized `cmd_status()` entry point so that `close`, `reopen`, `start`, and `status` all work automatically.

**Verdict: Excellent ratio.** The effort is well under 20% and delivers 100% of the requirement.

### 2. Scope Creep Detection

No scope creep detected. The change does exactly what was asked:
- Set `closed_iso` on close.
- Remove `closed_iso` on reopen/transition.
- BDD tests.
- CLAUDE.md update.

No adjacent problems were solved. No "while we are here" additions. The CHANGELOG entry is appropriate for the change.

The CLAUDE.md edit (broadening "commands or flags" to "features or behavior changes") is a minor wording improvement that was explicitly requested by the user. It does not introduce new process overhead -- just makes an existing guideline more precise.

### 3. Premature Abstraction

`remove_yaml_field()` is not premature. It is the symmetric counterpart to `update_yaml_field()` and is used immediately. Any future feature that needs to remove a frontmatter field (tags cleanup, dependency removal, etc.) will benefit from it. The function is 5 lines of straightforward bash -- the cost of creating it is negligible.

No other abstractions were introduced. No configuration, no flags, no options. The function signature is `remove_yaml_field file field`. That is it.

### 4. Integration Cost

Zero cascading complexity. Key observations:
- `_file_to_jsonl()` already emits all frontmatter fields -- `closed_iso` appears in query output automatically with no changes.
- All status commands (`close`, `reopen`, `start`, `status`) route through `cmd_status()` -- the single insertion point covers all paths.
- No other files or systems need to know about `closed_iso`. It is purely additive metadata.

### 5. Test Proportionality

6 scenarios covering:
1. Close sets timestamp.
2. Reopen removes it.
3. Status-to-in_progress removes it.
4. Never-closed ticket has no field.
5. `status <id> closed` (alternate path) sets it.
6. Close-reopen-close cycle (end-to-end).

This is proportional. Scenarios 1-3 are the core behavior. Scenario 4 is a sanity check (1 line of assertion). Scenario 5 verifies the alternate entry point. Scenario 6 is the integration/cycle test.

None of these are redundant -- each tests a distinct code path or edge case. The step definitions (`should not have field` and `should have a valid timestamp`) are generic and reusable by future features.

No over-testing. No under-testing.

### 6. Process Overhead Assessment

The `.ai_out/` directory contains 7 planning/review documents totaling ~600 lines for a 16-line production change. This is a high process-to-code ratio. However, this is the agent coordination overhead, not the implementation complexity. The actual implementation is tight and minimal. The planning documents are artifacts of the multi-agent workflow, not of the feature itself.

---

## Summary

| Criterion | Rating |
|-----------|--------|
| Value/Complexity Ratio | High -- 16 lines of production code, full feature delivered |
| Scope Creep | None detected |
| Premature Abstraction | None -- `remove_yaml_field()` is immediately used and fills a real gap |
| Integration Cost | Zero -- purely additive, no cascading changes |
| Test Proportionality | Appropriate -- 6 scenarios, each covering a distinct path |

**Recommendation:** Proceed as-is. The implementation is the simplest correct solution. No simplification opportunities exist without cutting necessary behavior.
