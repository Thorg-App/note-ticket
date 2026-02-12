# Planner Private Context

## Key findings from code analysis

### find_tickets_dir (ticket:8-27)
- Simple while loop walking from $PWD to /
- Only checks for `-d "$dir/.tickets"`
- Returns the path and exit 0, or exit 1

### init_tickets_dir (ticket:33-56)
- Calls find_tickets_dir, captures path in TICKETS_DIR
- For read commands: checks `-d "$TICKETS_DIR"` -- this is the key guard
- For write commands when find fails: defaults to `.tickets` (cwd)
- The -d check on read commands means returning a non-existent path from find_tickets_dir is safe for reads

### cmd_create behavior
- Need to verify it does mkdir -p on TICKETS_DIR before writing
- The create_ticket helper in the function should handle this

### Test infrastructure (environment.py)
- Each scenario gets a fresh tempdir (context.test_dir)
- No .git exists in temp dirs, so current tests won't be affected
- context.working_dir is set by "I am in subdirectory" step

### Existing test scenario impact
- "Create ticket initializes in current directory when no parent has tickets" -- SAFE
  - Runs in temp dir with no .git, so fallback to $PWD/.tickets still works
- All other directory scenarios -- SAFE, they create .tickets/ explicitly

### Design decision: -e vs -d/-f
- Used `-e` to match both .git files (submodules) and .git directories (regular repos)
- This is the simplest single check

### Concern: root / check
- The existing `[[ -d "/.tickets" ]]` root check now has a subtle consideration
- Should we also check `[[ -e "/.git" ]]` at root?
- Answer: No. The while loop already handles dir != "/" and checks .git. When dir reaches /, the loop exits and we only check /.tickets. This is fine because / is effectively the ultimate boundary anyway.

### Scenarios to be careful about
- The "Do not walk past .git" test is the most important behavioral test
- It verifies that an outer .tickets/ is NOT found when an inner .git exists
