Feature: Ticket Directory Resolution
  As a user
  I want tk to anchor _tickets at the git repository root
  So that I can run commands from any subdirectory of my project

  Background:
    Given a clean tickets directory

  Scenario: Find tickets from repo root
    Given a ticket exists with ID "test-0001" and title "Test ticket"
    When I run "ticket ls"
    Then the command should succeed
    And the output should contain "test-0001"

  Scenario: Find tickets from a subdirectory
    Given a ticket exists with ID "test-0001" and title "Test ticket"
    And I am in subdirectory "src/components"
    When I run "ticket ls"
    Then the command should succeed
    And the output should contain "test-0001"

  Scenario: Find tickets from a deeply nested subdirectory
    Given a ticket exists with ID "test-0001" and title "Test ticket"
    And I am in subdirectory "src/components/ui"
    When I run "ticket ls"
    Then the command should succeed
    And the output should contain "test-0001"

  Scenario: Create initializes _tickets at the repo root from a subdirectory
    Given the tickets directory does not exist
    And I am in subdirectory "src/components"
    When I run "ticket create 'Repo root ticket'"
    Then the command should succeed
    And the output should be valid JSON with an id field
    And tickets directory should exist in test root

  Scenario: Error when no tickets directory for read command
    Given the tickets directory does not exist
    When I run "ticket ls"
    Then the command should fail
    And the output should contain "does not exist"

  # `create` is the ONLY command allowed to bring _tickets into being (bash WRITE_COMMANDS).
  # A mutation that let every write command mkdir it would turn a typo'd repo into a new,
  # empty ticket store instead of an error.
  Scenario: Error when no tickets directory for a write command
    Given the tickets directory does not exist
    When I run "ticket close some-id"
    Then the command should fail
    And the output should contain "does not exist"

  Scenario: Error when not inside a git repository
    Given the tickets directory does not exist
    And the test root is not a git repository
    When I run "ticket ls"
    Then the command should fail
    And the output should contain "not inside a git repository"

  Scenario: TICKETS_DIR env var takes priority over git root
    Given a ticket exists with ID "root-0001" and title "Root ticket"
    And a separate tickets directory exists at "other-tickets" with ticket "other-0001" titled "Other ticket"
    And I am in subdirectory "src"
    When I run "ticket ls" with TICKETS_DIR set to "other-tickets"
    Then the command should succeed
    And the output should contain "other-0001"
    And the output should not contain "root-0001"

  Scenario: Show command works from subdirectory
    Given a ticket exists with ID "test-0001" and title "Test ticket"
    And I am in subdirectory "src"
    When I run "ticket show test-0001"
    Then the command should succeed
    And the output should contain "id: test-0001"

  Scenario: Dep command works from subdirectory
    Given a ticket exists with ID "task-0001" and title "Main task"
    And a ticket exists with ID "task-0002" and title "Dependency"
    And I am in subdirectory "lib"
    When I run "ticket dep task-0001 task-0002"
    Then the command should succeed
    And the output should contain "Added dependency"

  Scenario: Help command works without a git repository
    Given the tickets directory does not exist
    And the test root is not a git repository
    When I run "ticket help"
    Then the command should succeed
    And the output should contain "minimal ticket system"

  Scenario: Help usage line names the invoked script
    When I run "ticket help"
    Then the command should succeed
    And the output should contain "Usage: ticket <command> [args]"

  # Nested repository (submodule) boundary scenarios

  Scenario: Nested repository does not use parent repo tickets
    Given a ticket exists with ID "outer-001" and title "Outer ticket"
    And a nested git repository exists in subdirectory "inner-repo"
    And I am in subdirectory "inner-repo/deep/path"
    When I run "ticket ls"
    Then the command should fail
    And the output should contain "does not exist"

  Scenario: Create in nested repository initializes there, not in the parent
    Given a ticket exists with ID "parent-001" and title "Parent ticket"
    And a nested git repository exists in subdirectory "my-submodule"
    And I am in subdirectory "my-submodule"
    When I run "ticket create 'Submodule ticket'"
    Then the command should succeed
    And the output should be valid JSON with an id field
    And tickets directory should exist in subdirectory "my-submodule"
