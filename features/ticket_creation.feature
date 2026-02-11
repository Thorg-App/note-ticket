Feature: Ticket Creation
  As a user
  I want to create tickets with various options
  So that I can track tasks in my project

  Background:
    Given a clean tickets directory

  Scenario: Create a basic ticket with title
    When I run "ticket create 'My first ticket'"
    Then the command should succeed
    And the output should be valid JSON with an id field
    And a ticket file should exist with title "My first ticket"

  Scenario: Create a ticket with default title
    When I run "ticket create"
    Then the command should succeed
    And the output should be valid JSON with an id field
    And a ticket file should exist with title "Untitled"

  Scenario: Create a ticket with description
    When I run "ticket create 'Test ticket' -d 'This is the description'"
    Then the command should succeed
    And the created ticket should contain "This is the description"

  Scenario: Create a ticket with type
    When I run "ticket create 'Bug ticket' -t bug"
    Then the command should succeed
    And the created ticket should have field "type" with value "bug"

  Scenario: Create a ticket with priority
    When I run "ticket create 'High priority' -p 0"
    Then the command should succeed
    And the created ticket should have field "priority" with value "0"

  Scenario: Create a ticket with assignee
    When I run "ticket create 'Assigned ticket' -a 'John Doe'"
    Then the command should succeed
    And the created ticket should have field "assignee" with value "John Doe"

  Scenario: Create a ticket with external reference
    When I run "ticket create 'External ticket' --external-ref 'JIRA-123'"
    Then the command should succeed
    And the created ticket should have field "external-ref" with value "JIRA-123"

  Scenario: Create a ticket with parent
    Given a ticket exists with ID "parent-001" and title "Parent ticket"
    When I run "ticket create 'Child ticket' --parent parent-001"
    Then the command should succeed
    And the created ticket should have field "parent" with value "parent-001"

  Scenario: Create a ticket with design notes
    When I run "ticket create 'Design ticket' --design 'Use microservices'"
    Then the command should succeed
    And the created ticket should contain "## Design"
    And the created ticket should contain "Use microservices"

  Scenario: Create a ticket with acceptance criteria
    When I run "ticket create 'Story ticket' --acceptance 'Should pass all tests'"
    Then the command should succeed
    And the created ticket should contain "## Acceptance Criteria"
    And the created ticket should contain "Should pass all tests"

  Scenario: Ticket has default status open
    When I run "ticket create 'New ticket'"
    Then the command should succeed
    And the created ticket should have field "status" with value "open"

  Scenario: Ticket has default priority 2
    When I run "ticket create 'Normal priority'"
    Then the command should succeed
    And the created ticket should have field "priority" with value "2"

  Scenario: Ticket has default type task
    When I run "ticket create 'Default type'"
    Then the command should succeed
    And the created ticket should have field "type" with value "task"

  Scenario: Ticket has empty deps by default
    When I run "ticket create 'No deps'"
    Then the command should succeed
    And the created ticket should have field "deps" with value "[]"

  Scenario: Ticket has empty links by default
    When I run "ticket create 'No links'"
    Then the command should succeed
    And the created ticket should have field "links" with value "[]"

  Scenario: Ticket has created timestamp
    When I run "ticket create 'Timestamped'"
    Then the command should succeed
    And the created ticket should have a valid created timestamp

  Scenario: Tickets directory created on demand
    Given the tickets directory does not exist
    When I run "ticket create 'First ticket'"
    Then the command should succeed
    And the tickets directory should exist

  Scenario: Title-based filename generation
    When I run "ticket create 'My Test Ticket'"
    Then the command should succeed
    And a file named "my-test-ticket.md" should exist in tickets directory

  Scenario: Duplicate title creates suffixed filename
    When I run "ticket create 'Duplicate'"
    And I run "ticket create 'Duplicate'"
    Then the command should succeed
    And a file named "duplicate.md" should exist in tickets directory
    And a file named "duplicate-1.md" should exist in tickets directory

  Scenario: Create outputs JSON with expected fields
    When I run "ticket create 'JSON output test'"
    Then the command should succeed
    And the output should be valid JSONL
    And the JSONL output should have field "id"
    And the JSONL output should have field "title"
    And the JSONL output should have field "status"
    And the JSONL output should have field "full_path"

  Scenario: Title is stored in frontmatter
    When I run "ticket create 'Frontmatter Title'"
    Then the command should succeed
    And the created ticket should have field "title" with value "Frontmatter Title"
