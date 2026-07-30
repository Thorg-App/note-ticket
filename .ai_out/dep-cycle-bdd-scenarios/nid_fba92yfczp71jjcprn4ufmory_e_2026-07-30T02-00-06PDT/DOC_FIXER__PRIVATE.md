# DOC_FIXER — private

Scoped task: 2 stale strings from aea4c27. Read the real code/scenario before wording.

- `parse_reported_cycles()` genuinely returns `ReportedCycle` objects (class right above it, line 120). Docstring's remaining paragraph about output shape + comparing member SETS is still accurate, left untouched.
- `features/ticket_dependencies.feature:192` scenario is "Cycle detection finds every cycle overlapping in one ticket": 3 cycles, all sharing `task-0002`, asserting `exactly 3 dependency cycles`. So "three cycles overlapping in one ticket (all 3 found)" is accurate, not just "three-way overlap".

No other fronts opened. No commit, no branch switch.
