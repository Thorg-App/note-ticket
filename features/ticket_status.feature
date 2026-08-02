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

  Scenario: Set status to punted
    When I run "ticket status test-0001 punted"
    Then the command should succeed
    And the output should be "Updated test-0001 -> punted"
    And ticket "test-0001" should have field "status" with value "punted"

  Scenario: Punting a closed ticket removes closed_iso
    When I run "ticket close test-0001"
    Then the command should succeed
    And ticket "test-0001" should have a valid "closed_iso" timestamp
    When I run "ticket status test-0001 punted"
    Then the command should succeed
    And ticket "test-0001" should have field "status" with value "punted"
    And ticket "test-0001" should not have field "closed_iso"

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
    And the output should contain "open in_progress closed punted"

  Scenario: Status command with no arguments prints usage and the valid statuses
    When I run "ticket status"
    Then the command should fail
    And stderr should contain "status <id> <status>"
    And stderr should contain "Valid statuses: open in_progress closed punted"

  Scenario: Status command with an id but no status prints usage
    When I run "ticket status test-0001"
    Then the command should fail
    And stderr should contain "status <id> <status>"
    And ticket "test-0001" should have field "status" with value "open"

  Scenario: Close command with no id prints usage
    When I run "ticket close"
    Then the command should fail
    And stderr should contain "close <id>"

  Scenario: An invalid status leaves the ticket untouched
    When I run "ticket status test-0001 invalid"
    Then the command should fail
    And ticket "test-0001" should have field "status" with value "open"

  Scenario: Status of non-existent ticket
    When I run "ticket status nonexistent open"
    Then the command should fail
    And the output should contain "Error: ticket 'nonexistent' not found"

  # The status is validated BEFORE the id is resolved, so the message names the mistake the
  # user can actually see in their command line.
  Scenario: An invalid status is reported even when the ticket does not exist
    When I run "ticket status nonexistent invalid"
    Then the command should fail
    And the output should contain "Error: invalid status 'invalid'"

  # The confirmation names the RESOLVED id, not the abbreviation typed: with an exact id the
  # two strings coincide, so only a partial id can pin it.
  Scenario: Status command with partial ID reports the full id
    When I run "ticket status 0001 in_progress"
    Then the command should succeed
    And the output should be "Updated test-0001 -> in_progress"
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

  Scenario: Status change updates status_updated_iso
    When I run "ticket status test-0001 in_progress"
    Then the command should succeed
    And ticket "test-0001" should have a valid "status_updated_iso" timestamp

  # An unwritable ticket is the user's environment, not a crash: it must read like every
  # other failure, naming the file to fix (ticket nid_xioefs6t2rcs1gyl2mpcb1oyf_e).
  Scenario: A ticket file that cannot be rewritten fails with a message, not a stack trace
    Given the tickets directory is not writable
    When I run "ticket close test-0001"
    Then the exit code should be 1
    And stderr should contain "Error: cannot write"
    And stderr should contain "_tickets/"
    And stderr should contain "permission denied (EACCES)"
    And the output should not contain "node:fs"

  Scenario: Reopening preserves status_updated_iso
    When I run "ticket close test-0001"
    Then the command should succeed
    And ticket "test-0001" should have a valid "status_updated_iso" timestamp
    When I run "ticket reopen test-0001"
    Then the command should succeed
    And ticket "test-0001" should have a valid "status_updated_iso" timestamp
