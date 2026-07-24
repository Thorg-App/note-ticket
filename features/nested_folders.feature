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

  Scenario: Blocked reports a root ticket blocked by a nested dependency
    Given a ticket exists with ID "nest-0001" and title "Dependency ticket"
    And a ticket exists with ID "nest-0002" and title "Dependent ticket"
    And ticket "nest-0002" depends on "nest-0001"
    And I move ticket "nest-0001" to subfolder "backend"
    When I run "ticket blocked"
    Then the command should succeed
    And the output should contain "nest-0002"

  Scenario: Ready excludes a nested ticket blocked by a root dependency
    Given a ticket exists with ID "nest-0001" and title "Dependency ticket"
    And a ticket exists with ID "nest-0002" and title "Dependent ticket"
    And ticket "nest-0002" depends on "nest-0001"
    And I move ticket "nest-0002" to subfolder "backend"
    When I run "ticket ready"
    Then the command should succeed
    And the output should not contain "nest-0002"

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
    Then the command should fail
    And the output should contain "nest-0001"

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

  Scenario: Query with only empty subfolders produces no output
    Given an empty subfolder "backend/api" exists under the tickets directory
    When I run "ticket query"
    Then the command should succeed
    And the output should be empty
