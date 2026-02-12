# Exploration: Tickets at Git Root

## Current Behavior
`find_tickets_dir()` in `ticket:8-27` walks up from `$PWD` looking **only** for `.tickets/` directories. It stops at `/` or first `.tickets/` found.

`init_tickets_dir()` in `ticket:33-56` falls back to `TICKETS_DIR=".tickets"` (current dir) for write commands when no `.tickets/` found.

## Problem
In submodules, the walk continues past the submodule root into the parent repo. This means tickets end up in the parent repo's `.tickets/` instead of the submodule's own `.tickets/`.

## Key Files
- **Main script:** `ticket` (lines 8-56 for directory resolution)
- **Tests:** `features/ticket_directory.feature` (9 scenarios)
- **Test steps:** `features/steps/ticket_steps.py`
- **Test env:** `features/environment.py`

## Git Root Detection
- Regular repo: `.git` is a **directory**
- Submodule: `.git` is a **file** (contains `gitdir: ../..` reference)
- Both indicate the root of the current git working tree

## Required Change
Modify `find_tickets_dir()` to check for `.git` (file OR directory) at each level. If `.git` is found before `.tickets/`, return `<that_dir>/.tickets` as the tickets dir.

## Test Impact
- `ticket_directory.feature` scenarios need updating/expanding
- New scenarios: submodule case (`.git` file), regular repo (`.git` directory)
- Existing "Create ticket initializes in current directory when no parent has tickets" may need adjustment since the new logic stops at `.git` root
