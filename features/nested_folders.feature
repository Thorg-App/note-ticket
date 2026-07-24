Feature: Nested Folders Under _tickets
  As a user with many tickets
  I want to organize ticket files into nested subfolders
  So that I can group related tickets without losing any command functionality

  Background:
    Given a clean tickets directory

  Scenario: List finds a ticket in a subfolder
    Given a ticket exists with ID "nest-0001" and title "Nested ticket"
    And I move ticket "nest-0001" to subfolder "backend"
    When I run "ticket ls"
    Then the command should succeed
    And the output should contain "nest-0001"

  Scenario: Ready finds a ticket in a subfolder
    Given a ticket exists with ID "nest-0001" and title "Nested ticket"
    And I move ticket "nest-0001" to subfolder "backend"
    When I run "ticket ready"
    Then the command should succeed
    And the output should contain "nest-0001"

  Scenario: Show resolves a ticket in a subfolder
    Given a ticket exists with ID "nest-0001" and title "Nested ticket"
    And I move ticket "nest-0001" to subfolder "backend"
    When I run "ticket show nest-0001"
    Then the command should succeed
    And the output should contain "id: nest-0001"

  Scenario: Query finds a ticket in a subfolder
    Given a ticket exists with ID "nest-0001" and title "Nested ticket"
    And I move ticket "nest-0001" to subfolder "backend"
    When I run "ticket query"
    Then the command should succeed
    And the output should contain "nest-0001"

  Scenario: Query full_path reflects the subfolder location
    Given a ticket exists with ID "nest-0001" and title "Nested ticket"
    And I move ticket "nest-0001" to subfolder "backend"
    When I run "ticket query"
    Then the output should contain "_tickets/backend/nested-ticket.md"

  Scenario: List finds a deeply nested ticket
    Given a ticket exists with ID "nest-0001" and title "Deep ticket"
    And I move ticket "nest-0001" to subfolder "a/b/c"
    When I run "ticket ls"
    Then the command should succeed
    And the output should contain "nest-0001"

  Scenario: Partial ID resolves a deeply nested ticket
    Given a ticket exists with ID "nest-0001" and title "Deep ticket"
    And I move ticket "nest-0001" to subfolder "a/b/c"
    When I run "ticket show 0001"
    Then the command should succeed
    And the output should contain "id: nest-0001"

  Scenario: Ambiguous partial ID is detected across nesting levels
    Given a ticket exists with ID "nest-0001" and title "First ticket"
    And a ticket exists with ID "nest-0002" and title "Second ticket"
    And I move ticket "nest-0002" to subfolder "a/b"
    When I run "ticket show nest"
    Then the command should fail
    And the output should contain "Error: ambiguous ID 'nest' matches multiple tickets"

  Scenario: Close updates a nested ticket file in place
    Given a ticket exists with ID "nest-0001" and title "Nested ticket"
    And I move ticket "nest-0001" to subfolder "backend/api"
    When I run "ticket close nest-0001"
    Then the command should succeed
    And ticket "nest-0001" should have field "status" with value "closed"
    And ticket "nest-0001" should be located in subfolder "backend/api"

  Scenario: Closed lists a closed nested ticket
    Given a ticket exists with ID "nest-0001" and title "Nested ticket"
    And ticket "nest-0001" has status "closed"
    And I move ticket "nest-0001" to subfolder "archive/2024"
    When I run "ticket closed"
    Then the command should succeed
    And the output should contain "nest-0001"

  Scenario: Blocked names the nested dependency as the blocker
    Given a ticket exists with ID "nest-0001" and title "Dependency ticket"
    And a ticket exists with ID "nest-0002" and title "Dependent ticket"
    And ticket "nest-0002" depends on "nest-0001"
    And I move ticket "nest-0001" to subfolder "backend"
    When I run "ticket blocked"
    Then the command should succeed
    And the output should contain "nest-0002"
    And the output should contain "<- [nest-0001]"

  Scenario: Blocked drops the ticket once its nested dependency closes
    Given a ticket exists with ID "nest-0001" and title "Dependency ticket"
    And a ticket exists with ID "nest-0002" and title "Dependent ticket"
    And ticket "nest-0002" depends on "nest-0001"
    And I move ticket "nest-0001" to subfolder "backend"
    When I run "ticket close nest-0001"
    And I run "ticket blocked"
    Then the command should succeed
    And the output should not contain "nest-0002"

  Scenario: Ready lists the root dependency but not the blocked nested ticket
    Given a ticket exists with ID "nest-0001" and title "Dependency ticket"
    And a ticket exists with ID "nest-0002" and title "Dependent ticket"
    And ticket "nest-0002" depends on "nest-0001"
    And I move ticket "nest-0002" to subfolder "backend"
    When I run "ticket ready"
    Then the command should succeed
    And the output should contain "nest-0001"
    And the output should not contain "nest-0002"

  Scenario: Ready includes the nested ticket once its root dependency closes
    Given a ticket exists with ID "nest-0001" and title "Dependency ticket"
    And a ticket exists with ID "nest-0002" and title "Dependent ticket"
    And ticket "nest-0002" depends on "nest-0001"
    And I move ticket "nest-0002" to subfolder "backend"
    When I run "ticket close nest-0001"
    And I run "ticket ready"
    Then the command should succeed
    And the output should contain "nest-0002"

  Scenario: Dep tree renders a nested dependency
    Given a ticket exists with ID "nest-0001" and title "Dependency ticket"
    And a ticket exists with ID "nest-0002" and title "Dependent ticket"
    And ticket "nest-0002" depends on "nest-0001"
    And I move ticket "nest-0001" to subfolder "backend"
    When I run "ticket dep tree nest-0002"
    Then the command should succeed
    And the output should contain "nest-0001"

  Scenario: Dep cycle detects a cycle spanning nested folders
    Given a ticket exists with ID "nest-0001" and title "First ticket"
    And a ticket exists with ID "nest-0002" and title "Second ticket"
    And ticket "nest-0001" depends on "nest-0002"
    And ticket "nest-0002" depends on "nest-0001"
    And I move ticket "nest-0002" to subfolder "backend"
    When I run "ticket dep cycle"
    Then the command should succeed
    And the output should contain "Cycle 1:"
    And the output should contain "nest-0001"
    And the output should contain "nest-0002"

  Scenario: Add-note appends to a nested ticket
    Given a ticket exists with ID "nest-0001" and title "Nested ticket"
    And I move ticket "nest-0001" to subfolder "backend"
    When I run "ticket add-note nest-0001 \"A nested note\""
    Then the command should succeed
    And ticket "nest-0001" should contain "A nested note"

  Scenario: Link works across nesting levels
    Given a ticket exists with ID "nest-0001" and title "First ticket"
    And a ticket exists with ID "nest-0002" and title "Second ticket"
    And I move ticket "nest-0002" to subfolder "backend"
    When I run "ticket link nest-0001 nest-0002"
    Then the command should succeed
    And ticket "nest-0001" should have "nest-0002" in links

  Scenario: Commands handle a subfolder name containing spaces
    Given a ticket exists with ID "nest-0001" and title "Spaced folder ticket"
    And ticket "nest-0001" has status "closed"
    And I move ticket "nest-0001" to subfolder "my archive/old stuff"
    When I run "ticket closed"
    Then the command should succeed
    And the output should contain "nest-0001"

  Scenario: An empty subfolder does not break listing
    Given a ticket exists with ID "nest-0001" and title "Root ticket"
    And an empty subfolder "backend/api" exists under the tickets directory
    When I run "ticket ls"
    Then the command should succeed
    And the output should contain "nest-0001"

  Scenario: Listing with only empty subfolders produces no output
    Given an empty subfolder "backend/api" exists under the tickets directory
    When I run "ticket ls"
    Then the command should succeed
    And the output should be empty

  Scenario: Ready with only empty subfolders produces no output
    Given an empty subfolder "backend/api" exists under the tickets directory
    When I run "ticket ready"
    Then the command should succeed
    And the output should be empty

  Scenario: Closed with only empty subfolders produces no output
    Given an empty subfolder "backend/api" exists under the tickets directory
    When I run "ticket closed"
    Then the command should succeed
    And the output should be empty

  Scenario: Query with only empty subfolders produces no output
    Given an empty subfolder "backend/api" exists under the tickets directory
    When I run "ticket query"
    Then the command should succeed
    And the output should be empty

  Scenario: Listing works when the tickets directory itself is a symlink
    Given a ticket exists with ID "nest-0001" and title "Root ticket"
    And a ticket exists with ID "nest-0002" and title "Nested ticket"
    And I move ticket "nest-0002" to subfolder "backend"
    And the tickets directory is replaced by a symlink to "vault_tickets"
    When I run "ticket ls"
    Then the command should succeed
    And the output should contain "nest-0001"
    And the output should contain "nest-0002"

  Scenario: Show resolves a ticket through a symlinked tickets directory
    Given a ticket exists with ID "nest-0001" and title "Root ticket"
    And the tickets directory is replaced by a symlink to "vault_tickets"
    When I run "ticket show nest-0001"
    Then the command should succeed
    And the output should contain "id: nest-0001"

  Scenario: A ticket file that is a symlink is still listed
    Given a ticket exists with ID "nest-0001" and title "External ticket"
    And ticket "nest-0001" is moved out of the tickets directory and symlinked back
    When I run "ticket ls"
    Then the command should succeed
    And the output should contain "nest-0001"

  Scenario: Listing order is deterministic by path across root and nested tickets
    Given a ticket exists with ID "nest-0003" and title "Zebra ticket"
    And a ticket exists with ID "nest-0001" and title "Alpha ticket"
    And a ticket exists with ID "nest-0002" and title "Mango ticket"
    And I move ticket "nest-0003" to subfolder "backend"
    When I run "ticket ls"
    Then the command should succeed
    And the output should have "nest-0001" before "nest-0003"
    And the output should have "nest-0003" before "nest-0002"

  Scenario: Query order is deterministic by path across root and nested tickets
    Given a ticket exists with ID "nest-0003" and title "Zebra ticket"
    And a ticket exists with ID "nest-0001" and title "Alpha ticket"
    And a ticket exists with ID "nest-0002" and title "Mango ticket"
    And I move ticket "nest-0003" to subfolder "backend"
    When I run "ticket query"
    Then the command should succeed
    And the output should have "nest-0001" before "nest-0003"
    And the output should have "nest-0003" before "nest-0002"

  Scenario: Tickets inside hidden subfolders are ignored
    Given a ticket exists with ID "nest-0001" and title "Root ticket"
    And a ticket exists with ID "nest-0002" and title "Trashed ticket"
    And I move ticket "nest-0002" to subfolder ".trash"
    When I run "ticket ls"
    Then the command should succeed
    And the output should contain "nest-0001"
    And the output should not contain "nest-0002"

  Scenario: A hidden ticket file outside a hidden folder is still a ticket
    Given a ticket exists with ID "nest-0001" and title "Draft ticket"
    And I rename the file of ticket "nest-0001" to ".draft.md"
    When I run "ticket ls"
    Then the command should succeed
    And the output should contain "nest-0001"

  Scenario Outline: Listing commands never block on stdin when there are no tickets
    Given an empty subfolder "backend/api" exists under the tickets directory
    When I run "ticket <command>" with stdin left open
    Then the command should succeed
    And the output should be empty

    Examples: commands that enumerate ticket files
      | command |
      | ls      |
      | ready   |
      | blocked |
      | closed  |
      | query   |

  Scenario: Show never blocks on stdin when there are no tickets
    Given an empty subfolder "backend/api" exists under the tickets directory
    When I run "ticket show nest-0001" with stdin left open
    Then the command should fail
    And the output should contain "not found"
