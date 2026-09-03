Feature: Ticket Profile
  As a user
  I want to set an optional processing profile on a ticket
  So that I can mark tickets that need heavier processing than the default

  Background:
    Given a clean tickets directory
    And a ticket exists with ID "test-0001" and title "Test ticket"

  Scenario: Set profile to standard
    When I run "ticket profile test-0001 standard"
    Then the command should succeed
    And the output should be "Updated test-0001 profile -> standard"
    And ticket "test-0001" should have field "profile" with value "standard"

  Scenario: Set profile to higher
    When I run "ticket profile test-0001 higher"
    Then the command should succeed
    And the output should be "Updated test-0001 profile -> higher"
    And ticket "test-0001" should have field "profile" with value "higher"

  Scenario: A new ticket has no profile until one is set
    Then ticket "test-0001" should not have field "profile"

  Scenario: Setting the profile again overwrites the previous value
    When I run "ticket profile test-0001 standard"
    Then the command should succeed
    When I run "ticket profile test-0001 higher"
    Then the command should succeed
    And ticket "test-0001" should have field "profile" with value "higher"

  Scenario: Invalid profile value
    When I run "ticket profile test-0001 invalid"
    Then the command should fail
    And the output should contain "Error: invalid profile 'invalid'"
    And the output should contain "standard higher"

  # The profile is validated BEFORE the ticket is touched, so an invalid value leaves it as-is.
  Scenario: An invalid profile leaves the ticket untouched
    When I run "ticket profile test-0001 invalid"
    Then the command should fail
    And ticket "test-0001" should not have field "profile"

  Scenario: Profile command with no arguments prints usage and the valid profiles
    When I run "ticket profile"
    Then the command should fail
    And stderr should contain "profile <id> <profile>"
    And stderr should contain "Valid profiles: standard higher"

  Scenario: Profile command with an id but no profile prints usage
    When I run "ticket profile test-0001"
    Then the command should fail
    And stderr should contain "profile <id> <profile>"
    And ticket "test-0001" should not have field "profile"

  Scenario: Profile of non-existent ticket
    When I run "ticket profile nonexistent standard"
    Then the command should fail
    And the output should contain "Error: ticket 'nonexistent' not found"

  # The profile is validated before the id is resolved, so the message names the mistake the
  # user can actually see in their command line.
  Scenario: An invalid profile is reported even when the ticket does not exist
    When I run "ticket profile nonexistent invalid"
    Then the command should fail
    And the output should contain "Error: invalid profile 'invalid'"

  # The confirmation names the RESOLVED id, not the abbreviation typed.
  Scenario: Profile command with partial ID reports the full id
    When I run "ticket profile 0001 higher"
    Then the command should succeed
    And the output should be "Updated test-0001 profile -> higher"
    And ticket "test-0001" should have field "profile" with value "higher"
