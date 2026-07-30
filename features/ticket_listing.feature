Feature: Ticket Listing
  As a user
  I want to list tickets in various ways
  So that I can see what work needs to be done

  Background:
    Given a clean tickets directory

  Scenario: List all tickets
    Given a ticket exists with ID "list-0001" and title "First ticket"
    And a ticket exists with ID "list-0002" and title "Second ticket"
    When I run "ticket ls"
    Then the command should succeed
    And the output should contain "list-0001"
    And the output should contain "list-0002"

  Scenario: List command alias works
    Given a ticket exists with ID "list-0001" and title "First ticket"
    When I run "ticket list"
    Then the command should succeed
    And the output should contain "list-0001"

  Scenario: List shows ticket format correctly
    Given a ticket exists with ID "list-0001" and title "My ticket"
    When I run "ticket ls"
    Then the command should succeed
    And the output should match pattern "list-0001\s+\[open\]\s+-\s+My ticket"

  Scenario: List with status filter
    Given a ticket exists with ID "list-0001" and title "Open ticket"
    And a ticket exists with ID "list-0002" and title "Closed ticket"
    And ticket "list-0002" has status "closed"
    When I run "ticket ls --status=open"
    Then the command should succeed
    And the output should contain "list-0001"
    And the output should not contain "list-0002"

  Scenario: List shows dependencies
    Given a ticket exists with ID "list-0001" and title "Main ticket"
    And a ticket exists with ID "list-0002" and title "Dep ticket"
    And ticket "list-0001" depends on "list-0002"
    When I run "ticket ls"
    Then the command should succeed
    And the output should contain "<- [list-0002]"

  Scenario: List with no tickets returns nothing
    When I run "ticket ls"
    Then the output should be empty

  Scenario: Ready shows tickets with no deps and with closed deps
    Given a ticket exists with ID "ready-001" and title "Ready ticket"
    And a ticket exists with ID "ready-002" and title "Unblocked ticket"
    And a ticket exists with ID "ready-003" and title "Dependency"
    And ticket "ready-002" depends on "ready-003"
    And ticket "ready-003" has status "closed"
    When I run "ticket ready"
    Then the command should succeed
    And the output should contain "ready-001"
    And the output should contain "ready-002"

  Scenario: Ready excludes tickets with unclosed deps
    Given a ticket exists with ID "ready-001" and title "Blocked ticket"
    And a ticket exists with ID "ready-002" and title "Open dependency"
    And ticket "ready-001" depends on "ready-002"
    When I run "ticket ready"
    Then the command should succeed
    And the output should not contain "ready-001"
    And the output should contain "ready-002"

  Scenario: Ready shows tickets when deps are closed
    Given a ticket exists with ID "ready-001" and title "Main ticket"
    And a ticket exists with ID "ready-002" and title "Closed dependency"
    And ticket "ready-001" depends on "ready-002"
    And ticket "ready-002" has status "closed"
    When I run "ticket ready"
    Then the command should succeed
    And the output should contain "ready-001"

  Scenario: Ready excludes closed tickets
    Given a ticket exists with ID "ready-001" and title "Closed ticket"
    And ticket "ready-001" has status "closed"
    When I run "ticket ready"
    Then the command should succeed
    And the output should not contain "ready-001"

  Scenario: Ready shows priority in output
    Given a ticket exists with ID "ready-001" and title "Priority ticket"
    When I run "ticket ready"
    Then the command should succeed
    And the output should match pattern "ready-001\s+\[P2\]\[open\]\s+-\s+Priority ticket"

  Scenario: Ready sorts by priority then ID
    Given a ticket exists with ID "ready-003" and title "Low priority" with priority 3
    And a ticket exists with ID "ready-001" and title "High priority" with priority 1
    And a ticket exists with ID "ready-002" and title "Also high priority" with priority 1
    When I run "ticket ready"
    Then the command should succeed
    And the output line 1 should contain "ready-001"
    And the output line 2 should contain "ready-002"
    And the output line 3 should contain "ready-003"

  Scenario: Blocked shows tickets with unclosed deps
    Given a ticket exists with ID "block-001" and title "Blocked ticket"
    And a ticket exists with ID "block-002" and title "Blocker ticket"
    And ticket "block-001" depends on "block-002"
    When I run "ticket blocked"
    Then the command should succeed
    And the output should contain "block-001"
    And the output should contain "<- [block-002]"

  Scenario: Blocked excludes tickets with all deps closed
    Given a ticket exists with ID "block-001" and title "Unblocked ticket"
    And a ticket exists with ID "block-002" and title "Closed blocker"
    And ticket "block-001" depends on "block-002"
    And ticket "block-002" has status "closed"
    When I run "ticket blocked"
    Then the command should succeed
    And the output should not contain "block-001"

  Scenario: Blocked excludes closed tickets
    Given a ticket exists with ID "block-001" and title "Closed blocked"
    And a ticket exists with ID "block-002" and title "Blocker"
    And ticket "block-001" depends on "block-002"
    And ticket "block-001" has status "closed"
    When I run "ticket blocked"
    Then the command should succeed
    And the output should not contain "block-001"

  Scenario: Blocked shows only unclosed blockers
    Given a ticket exists with ID "block-001" and title "Blocked ticket"
    And a ticket exists with ID "block-002" and title "Open blocker"
    And a ticket exists with ID "block-003" and title "Closed blocker"
    And ticket "block-001" depends on "block-002"
    And ticket "block-001" depends on "block-003"
    And ticket "block-003" has status "closed"
    When I run "ticket blocked"
    Then the command should succeed
    And the output should contain "<- [block-002]"
    And the output should not contain "block-003"

  Scenario: Closed shows recently closed tickets
    Given a ticket exists with ID "done-0001" and title "Done ticket"
    And ticket "done-0001" has status "closed"
    When I run "ticket closed"
    Then the command should succeed
    And the output should contain "done-0001"
    And the output should contain "[closed]"
    And the output should contain "Done ticket"

  Scenario: Closed respects limit
    Given a ticket exists with ID "done-0001" and title "First done"
    And a ticket exists with ID "done-0002" and title "Second done"
    And ticket "done-0001" has status "closed"
    And ticket "done-0002" has status "closed"
    When I run "ticket closed --limit=1"
    Then the command should succeed
    And the output line count should be 1

  Scenario: Closed excludes open tickets
    Given a ticket exists with ID "done-0001" and title "Open ticket"
    When I run "ticket closed"
    Then the command should succeed
    And the output should not contain "done-0001"

  # A .md file under _tickets/ without a usable 'id' is a corrupt repo, not a ticket to
  # skip quietly: hand-editing the id away would otherwise look like the ticket vanished.
  Scenario: Listing fails loudly when a ticket file has no id key
    Given a ticket exists with ID "list-0001" and title "Healthy ticket"
    And a raw ticket file "orphan.md" exists with content
      """
      ---
      title: "No id key"
      status: open
      ---
      """
    When I run "ticket ls"
    Then the command should fail
    And stderr should contain "orphan.md has no 'id' frontmatter field"

  Scenario: Listing fails loudly when the id key has an empty value
    Given a raw ticket file "blank-id.md" exists with content
      """
      ---
      id:
      title: "Blank id"
      ---
      """
    When I run "ticket ls"
    Then the command should fail
    And stderr should contain "blank-id.md has no 'id' frontmatter field"

  Scenario: Listing fails loudly when a file has no frontmatter at all
    Given a raw ticket file "loose-note.md" exists with content
      """
      Just a note somebody dropped in the tickets folder.
      """
    When I run "ticket ls"
    Then the command should fail
    And stderr should contain "loose-note.md has no 'id' frontmatter field"

  Scenario: Ready fails loudly on a ticket file with no id
    Given a raw ticket file "orphan.md" exists with content
      """
      ---
      title: "No id key"
      ---
      """
    When I run "ticket ready"
    Then the command should fail
    And stderr should contain "has no 'id' frontmatter field"

  Scenario: Blocked fails loudly on a ticket file with no id
    Given a raw ticket file "orphan.md" exists with content
      """
      ---
      title: "No id key"
      ---
      """
    When I run "ticket blocked"
    Then the command should fail
    And stderr should contain "has no 'id' frontmatter field"

  Scenario: An assignee flag without a value is rejected
    Given a ticket exists with ID "list-0001" and title "First ticket"
    When I run "ticket ls -a"
    Then the command should fail
    And stderr should contain "option '-a' requires a value"

  Scenario: A tag flag without a value is rejected
    Given a ticket exists with ID "list-0001" and title "First ticket"
    When I run "ticket ready -T"
    Then the command should fail
    And stderr should contain "option '-T' requires a value"

  Scenario: An existing but empty tickets directory lists nothing and succeeds
    When I run "ticket ls"
    Then the command should succeed
    And the output should be empty

  Scenario: Ready ignores a status filter
    Given a ticket exists with ID "list-0001" and title "Open ticket"
    When I run "ticket ready --status=closed"
    Then the command should succeed
    And the output should contain "list-0001"

  # A `|` in a title used to be truncated: both commands packed their sort key as
  # `priority|id|status|title` and split it back apart.
  Scenario: Ready shows a title containing a pipe in full
    Given a ticket exists with ID "pipe-0001" and title "Ship it | phase 2"
    When I run "ticket ready"
    Then the command should succeed
    And the output should contain "Ship it | phase 2"

  Scenario: Blocked shows a title containing a pipe in full, blockers last
    Given a ticket exists with ID "pipe-0001" and title "Ship it | phase 2"
    And a ticket exists with ID "pipe-0002" and title "Blocker"
    And ticket "pipe-0001" depends on "pipe-0002"
    When I run "ticket blocked"
    Then the command should succeed
    And the output should contain "Ship it | phase 2 <- [pipe-0002]"

  Scenario: Blocked lists unresolved blockers only, sorted by priority
    Given a ticket exists with ID "block-0001" and title "Low priority" with priority 3
    And a ticket exists with ID "block-0002" and title "High priority" with priority 1
    And a ticket exists with ID "block-0003" and title "Blocker"
    And ticket "block-0001" depends on "block-0003"
    And ticket "block-0002" depends on "block-0003"
    When I run "ticket blocked"
    Then the command should succeed
    And the output line 1 should contain "block-0002"
    And the output line 2 should contain "block-0001"

  # `closed` orders by file modification time, newest first -- not by id and not by path.
  Scenario: Closed lists the most recently modified ticket first
    Given a ticket exists with ID "zdone-001" and title "Older done"
    And a ticket exists with ID "adone-002" and title "Newer done"
    And ticket "zdone-001" has status "closed"
    And ticket "adone-002" has status "closed"
    And ticket "zdone-001" was modified 600 seconds ago
    And ticket "adone-002" was modified 60 seconds ago
    When I run "ticket closed"
    Then the command should succeed
    And the output line 1 should contain "adone-002"
    And the output line 2 should contain "zdone-001"

  Scenario: Closed includes a ticket with the legacy done status
    Given a raw ticket file "legacy.md" exists with content
      """
      ---
      id: legacy-001
      title: "Legacy done ticket"
      status: done
      ---
      """
    When I run "ticket closed"
    Then the command should succeed
    And the output should contain "legacy-001"
    And the output should contain "[done]"

  Scenario: Closed ignores a status filter
    Given a ticket exists with ID "done-0001" and title "Done ticket"
    And ticket "done-0001" has status "closed"
    When I run "ticket closed --status=open"
    Then the command should succeed
    And the output should contain "done-0001"

  Scenario: Closed fails loudly on a ticket file with no id
    Given a raw ticket file "orphan.md" exists with content
      """
      ---
      title: "No id key"
      status: closed
      ---
      """
    When I run "ticket closed"
    Then the command should fail
    And stderr should contain "has no 'id' frontmatter field"

  # bash forwarded the value to `head -n`, so a typo became `head: invalid number of lines`.
  Scenario: Closed rejects a limit that is not a number
    Given a ticket exists with ID "done-0001" and title "Done ticket"
    And ticket "done-0001" has status "closed"
    When I run "ticket closed --limit=abc"
    Then the command should fail
    And stderr should contain "--limit must be a whole number of rows"

  Scenario: Closed rejects an empty limit
    Given a ticket exists with ID "done-0001" and title "Done ticket"
    And ticket "done-0001" has status "closed"
    When I run "ticket closed --limit="
    Then the command should fail
    And stderr should contain "--limit"

  Scenario: Closed with a limit of zero prints nothing and succeeds
    Given a ticket exists with ID "done-0001" and title "Done ticket"
    And ticket "done-0001" has status "closed"
    When I run "ticket closed --limit=0"
    Then the command should succeed
    And the output should be empty

  # bash returned before `head` ever ran when there was nothing to list, so a typo'd limit
  # went unreported in an empty repo.
  Scenario: Closed rejects a bad limit even with no tickets at all
    When I run "ticket closed --limit=abc"
    Then the command should fail
    And stderr should contain "--limit must be a whole number of rows"
