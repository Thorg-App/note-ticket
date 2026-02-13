Feature: Ticket Status Management
  As a user
  I want to change ticket statuses
  So that I can track progress on tasks

  Background:
    Given a clean tickets directory
    And a ticket exists with ID "test-0001" and title "Test ticket"

  Scenario: Set status to in_progress
    When I run "ticket status test-0001 in_progress"
    Then the command should succeed
    And the output should be "Updated test-0001 -> in_progress"
    And ticket "test-0001" should have field "status" with value "in_progress"

  Scenario: Set status to closed
    When I run "ticket status test-0001 closed"
    Then the command should succeed
    And the output should be "Updated test-0001 -> closed"
    And ticket "test-0001" should have field "status" with value "closed"

  Scenario: Set status to open
    Given ticket "test-0001" has status "closed"
    When I run "ticket status test-0001 open"
    Then the command should succeed
    And the output should be "Updated test-0001 -> open"
    And ticket "test-0001" should have field "status" with value "open"

  Scenario: Start command sets status to in_progress
    When I run "ticket start test-0001"
    Then the command should succeed
    And the output should be "Updated test-0001 -> in_progress"
    And ticket "test-0001" should have field "status" with value "in_progress"

  Scenario: Close command sets status to closed
    When I run "ticket close test-0001"
    Then the command should succeed
    And the output should be "Updated test-0001 -> closed"
    And ticket "test-0001" should have field "status" with value "closed"

  Scenario: Reopen command sets status to open
    Given ticket "test-0001" has status "closed"
    When I run "ticket reopen test-0001"
    Then the command should succeed
    And the output should be "Updated test-0001 -> open"
    And ticket "test-0001" should have field "status" with value "open"

  Scenario: Invalid status value
    When I run "ticket status test-0001 invalid"
    Then the command should fail
    And the output should contain "Error: invalid status 'invalid'"
    And the output should contain "open in_progress closed"

  Scenario: Status of non-existent ticket
    When I run "ticket status nonexistent open"
    Then the command should fail
    And the output should contain "Error: ticket 'nonexistent' not found"

  Scenario: Status command with partial ID
    When I run "ticket status 0001 in_progress"
    Then the command should succeed
    And ticket "test-0001" should have field "status" with value "in_progress"

  Scenario: Closing a ticket sets closed_iso timestamp
    When I run "ticket close test-0001"
    Then the command should succeed
    And ticket "test-0001" should have field "status" with value "closed"
    And ticket "test-0001" should have a valid "closed_iso" timestamp

  Scenario: Reopening a closed ticket removes closed_iso
    When I run "ticket close test-0001"
    Then the command should succeed
    And ticket "test-0001" should have a valid "closed_iso" timestamp
    When I run "ticket reopen test-0001"
    Then the command should succeed
    And ticket "test-0001" should have field "status" with value "open"
    And ticket "test-0001" should not have field "closed_iso"

  Scenario: Setting status to in_progress removes closed_iso
    When I run "ticket close test-0001"
    Then the command should succeed
    And ticket "test-0001" should have a valid "closed_iso" timestamp
    When I run "ticket status test-0001 in_progress"
    Then the command should succeed
    And ticket "test-0001" should have field "status" with value "in_progress"
    And ticket "test-0001" should not have field "closed_iso"

  Scenario: Ticket that was never closed has no closed_iso
    When I run "ticket start test-0001"
    Then the command should succeed
    And ticket "test-0001" should not have field "closed_iso"

  Scenario: Closing via status command sets closed_iso
    When I run "ticket status test-0001 closed"
    Then the command should succeed
    And ticket "test-0001" should have a valid "closed_iso" timestamp

  Scenario: Close-reopen-close cycle updates closed_iso
    When I run "ticket close test-0001"
    Then the command should succeed
    And ticket "test-0001" should have a valid "closed_iso" timestamp
    When I run "ticket reopen test-0001"
    Then the command should succeed
    And ticket "test-0001" should not have field "closed_iso"
    When I run "ticket close test-0001"
    Then the command should succeed
    And ticket "test-0001" should have a valid "closed_iso" timestamp
