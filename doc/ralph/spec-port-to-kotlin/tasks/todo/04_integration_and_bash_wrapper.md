# Phase 04: Integration & Bash Wrapper

## Objective
Wire the Kotlin JAR into the `ticket` bash script as a thin wrapper, verify ALL BDD tests pass, fix any behavioral discrepancies, and clean up documentation. After this phase, the port is complete and the Kotlin implementation is the production backend.

## Prerequisites
- Phase 01 complete: core infrastructure
- Phase 02 complete: CRUD and status commands
- Phase 03 complete: relationship and listing commands
- All Kotlin unit tests passing

## Scope
### In Scope
- **Bash wrapper** (`ticket` script): rewrite to be a thin wrapper that:
  1. Checks for `java` on PATH (error if not found)
  2. Locates the fat JAR (convention-based path relative to script location)
  3. Passes all CLI arguments through to `java -jar <path> "$@"`
  4. For `query` command with jq filter: pipes Kotlin JSONL output through `jq -c "select(filter)"`
  5. Preserves exit codes from Kotlin process
- **JAR location strategy**: determine how the wrapper finds the JAR
  - Option A: relative to script location (e.g., `SCRIPT_DIR/lib/ticket.jar`)
  - Option B: well-known install path
  - Option C: environment variable (`TICKET_JAR`)
  - Decide during detailed planning
- **BDD test verification**: run ALL 10 feature files and verify they pass
- **Behavioral discrepancy fixes**: fix any stdout/stderr format differences that cause BDD failures
- **README cleanup**: remove plugin/super documentation, update any stale sections
- **CLAUDE.md updates**: ensure note-ticket CLAUDE.md reflects the new Kotlin architecture
- **CHANGELOG update**: document the Kotlin port
- **Help text**: ensure `tk help` output matches expected format (minus plugin/super)

### Out of Scope
- New features or behavior changes
- Performance optimization beyond correctness
- Distribution packaging (Homebrew, AUR — existing CI handles this)

## Implementation Guidance

### Bash Wrapper Structure
```bash
#!/usr/bin/env bash
set -euo pipefail

# Locate JAR
SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
TICKET_JAR="${TICKET_JAR:-$SCRIPT_DIR/lib/ticket.jar}"

# Verify java is available
if ! command -v java &>/dev/null; then
  echo "Error: java not found on PATH. Install JDK 21+." >&2
  exit 1
fi

# Special handling for query with jq filter
if [[ "${1:-}" == "query" ]] && [[ $# -gt 1 ]]; then
  filter="${2}"
  shift 2
  java -jar "$TICKET_JAR" query "$@" | jq -c "select($filter)"
else
  java -jar "$TICKET_JAR" "$@"
fi
```
This is illustrative — actual implementation may vary based on JAR location decision.

### Query jq Compatibility
- The Kotlin `query` command outputs pure JSONL (one JSON object per line)
- The bash wrapper intercepts `query <filter>` and pipes through `jq -c "select(filter)"`
- When no filter: just passes through to Kotlin
- This maintains backward compatibility with BDD tests that test filtering

### BDD Test Execution
```bash
# Run from note-ticket submodule
cd /usr/local/workplace/thorg-root/submodules/note-ticket
make test > .tmp/bdd_test_output.txt 2>&1
tail -20 .tmp/bdd_test_output.txt
```
- The BDD tests use the `ticket` script path (via `TICKET_SCRIPT` env or default discovery)
- Since we're replacing the `ticket` script with the wrapper, tests should just work
- If tests fail, examine the exact assertion failures and fix output format in Kotlin code

### Common Discrepancy Sources
- Trailing whitespace or newlines in output
- Field ordering in JSON output
- Exact error message text
- Exact help text format
- Sorting order differences (locale-dependent)
- Empty vs missing fields in JSONL
- Exact tree visualization spacing

### README Cleanup
- Remove the plugin/super section from help text in README
- Remove `super` from the command list
- Remove plugin description/env vars
- Verify all command documentation matches actual behavior

### CHANGELOG Entry
Add under `## [Unreleased]`:
```markdown
### Changed
- Ported ticket CLI from bash to Kotlin JVM for type safety and cross-platform consistency
- Bash `ticket` script is now a thin wrapper delegating to Kotlin JAR

### Removed
- Plugin/super mechanism references from README and help text
```

## Acceptance Criteria
- [ ] Bash wrapper correctly invokes Kotlin JAR for all commands
- [ ] Bash wrapper handles `query` with jq filter for backward compatibility
- [ ] Bash wrapper exits with appropriate error if `java` not found
- [ ] **ALL 10 BDD feature files pass** (this is the critical gate)
- [ ] No BDD tests were modified (unless obviously broken behavior found — document any such cases)
- [ ] README cleaned of plugin/super references
- [ ] CLAUDE.md for note-ticket reflects Kotlin architecture
- [ ] CHANGELOG updated with port documentation
- [ ] `tk help` output is correct (no plugin/super, matches expected format)
- [ ] Tests pass

## Notes
- This is the most critical phase for quality — the BDD tests are the definitive behavioral specification.
- If BDD tests fail, the fix should be in the Kotlin code or bash wrapper, NOT in the BDD tests.
- Exception: if a BDD test reveals obviously incorrect behavior in the original bash script (and the test was testing that incorrect behavior), document the finding and discuss before modifying.
- Run BDD tests frequently during this phase — pipe output to `.tmp/` files.
- The `bash_ticket` file must NOT be modified.
- Remember to build the fat JAR before running BDD tests: `./gradlew :kotlin-jvm:ticket:shadowJar`
