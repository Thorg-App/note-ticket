Feature: Ticket Edit
  As a user
  I want to edit tickets in my editor
  So that I can make complex changes easily

  Background:
    Given a clean tickets directory
    And a ticket exists with ID "edit-0001" and title "Editable ticket"

  Scenario: Edit in non-TTY mode shows file path
    When I run "ticket edit edit-0001" in non-TTY mode
    Then the command should succeed
    And the output should contain "Edit ticket file:"
    And the output should contain "_tickets/editable-ticket.md"

  Scenario: Edit non-existent ticket
    When I run "ticket edit nonexistent"
    Then the command should fail
    And the output should contain "Error: ticket 'nonexistent' not found"

  Scenario: Edit with partial ID
    When I run "ticket edit 0001" in non-TTY mode
    Then the command should succeed
    And the output should contain "editable-ticket.md"

  Scenario: Edit with no id at all
    When I run "ticket edit"
    Then the command should fail
    And stderr should contain "Usage: ticket edit <id>"

  # NOTE: no scenario launches an editor and none can. Every BDD runner gives the child
  # neither a terminal on stdin nor one on stdout, which is exactly the condition bash tested
  # before launching $EDITOR. That arm -- the adopted editor exit code, the 127 when the
  # editor is not on PATH, the ticket path reaching the child as its argument, and a
  # multi-word $EDITOR being looked up UNSPLIT as one filename -- is pinned by
  # test/edit-command.test.ts, which can say "both streams are terminals" and which spawns
  # real binaries so the spawn site itself is covered.
