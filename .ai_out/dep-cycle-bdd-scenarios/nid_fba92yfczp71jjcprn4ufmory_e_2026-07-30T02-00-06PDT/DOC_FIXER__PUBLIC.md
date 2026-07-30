# DOC_FIXER — public

## Documentation Updated

**Local Docs:**
- `features/steps/ticket_steps.py:129`: `parse_reported_cycles()` docstring now says it returns a list of `ReportedCycle`s (number + member ids) instead of "a list of member-id sets".
- `scripts/parity/README.md:55`: divergence #1 now reads "three cycles overlapping in one ticket (all 3 found)" instead of "two overlapping cycles (both found)", matching the scenario at `features/ticket_dependencies.feature:192`.

**Thorg Notes:**
- None referenced in the changed code.

## Verification
`make test` → exit 0: 12 features, 215 scenarios, 1440 steps, 0 failed. Log: `.tmp/doc_fixer_make_test.log`.

Not committed; branch unchanged.
