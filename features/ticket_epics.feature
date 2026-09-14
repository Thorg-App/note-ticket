Feature: Epics
  As a user tracking a body of work with an epic
  I want the epic kept out of my ready list and closed only when I ask
  So that I work on tasks, and an epic closes exactly when its work is done

  Background:
    Given a clean tickets directory
    And a ticket exists with ID "task-0001" and title "A task"
    And a ticket exists with ID "epic-0001" and title "An epic"
    And ticket "epic-0001" has type "epic"
    And ticket "epic-0001" depends on "task-0001"

  # An epic is a container, not work: `ready` offers up things to pick up.
  Scenario: Ready never lists an epic whose dependencies are all closed
    Given ticket "task-0001" has status "closed"
    When I run "ticket ready"
    Then the command should succeed
    And the output should not contain "epic-0001"

  Scenario: Ready still lists the epic's own tasks
    When I run "ticket ready"
    Then the command should succeed
    And the output should contain "task-0001"

  # Unlike `ready`, `blocked` keeps the epic visible with what is holding it up.
  Scenario: Blocked lists an epic with an unresolved dependency
    When I run "ticket blocked"
    Then the command should succeed
    And the output should contain "epic-0001"

  Scenario: Auto-close closes an epic whose dependencies are all closed
    Given ticket "task-0001" has status "closed"
    When I run "ticket auto-close-epics"
    Then the command should succeed
    And the output should be "Updated epic-0001 -> closed"
    And ticket "epic-0001" should have field "status" with value "closed"

  Scenario: An auto-closed epic gets a closed_iso stamp
    Given ticket "task-0001" has status "closed"
    When I run "ticket auto-close-epics"
    Then the command should succeed
    And ticket "epic-0001" should have a valid "closed_iso" timestamp

  Scenario: Auto-close leaves an epic with an open dependency alone
    When I run "ticket auto-close-epics"
    Then the command should succeed
    And the output should be "No epics to auto-close"
    And ticket "epic-0001" should have field "status" with value "open"

  # Closing the last task must NOT cascade: the tool makes that statement only when asked.
  Scenario: Closing the last dependency does not close the epic
    When I run "ticket close task-0001"
    Then the command should succeed
    And ticket "epic-0001" should have field "status" with value "open"

  Scenario: Auto-close leaves a plain task alone
    Given ticket "task-0001" has status "closed"
    And a ticket exists with ID "task-0002" and title "Another task"
    And ticket "task-0002" depends on "task-0001"
    When I run "ticket auto-close-epics"
    Then the command should succeed
    And ticket "task-0002" should have field "status" with value "open"

  # An epic with no deps tracks nothing, so nothing about it is finished.
  Scenario: Auto-close leaves an epic with no dependencies alone
    Given a ticket exists with ID "epic-0002" and title "Empty epic"
    And ticket "epic-0002" has type "epic"
    And ticket "task-0001" has status "closed"
    When I run "ticket auto-close-epics"
    Then the command should succeed
    And ticket "epic-0002" should have field "status" with value "open"

  # Punting is a deliberate deferral; auto-close must not undo it.
  Scenario: Auto-close leaves a punted epic alone
    Given ticket "task-0001" has status "closed"
    And ticket "epic-0001" has status "punted"
    When I run "ticket auto-close-epics"
    Then the command should succeed
    And ticket "epic-0001" should have field "status" with value "punted"

  # One run settles nested epics, which is what makes a second run a no-op.
  Scenario: Auto-close closes an epic freed by another epic in the same run
    Given a ticket exists with ID "epic-0002" and title "Parent epic"
    And ticket "epic-0002" has type "epic"
    And ticket "epic-0002" depends on "epic-0001"
    And ticket "task-0001" has status "closed"
    When I run "ticket auto-close-epics"
    Then the command should succeed
    And ticket "epic-0002" should have field "status" with value "closed"

  Scenario: Running auto-close twice closes nothing the second time
    Given ticket "task-0001" has status "closed"
    When I run "ticket auto-close-epics"
    Then the command should succeed
    When I run "ticket auto-close-epics"
    Then the command should succeed
    And the output should be "No epics to auto-close"

  Scenario: An auto-closed epic can be reopened
    Given ticket "task-0001" has status "closed"
    When I run "ticket auto-close-epics"
    Then the command should succeed
    When I run "ticket reopen epic-0001"
    Then the command should succeed
    And ticket "epic-0001" should have field "status" with value "open"

  Scenario: Auto-close in an empty tickets directory reports nothing to do
    Given a clean tickets directory
    When I run "ticket auto-close-epics"
    Then the command should succeed
    And the output should be "No epics to auto-close"

  Scenario: The command is listed in help
    When I run "ticket help"
    Then the command should succeed
    And the output should contain "auto-close-epics"
