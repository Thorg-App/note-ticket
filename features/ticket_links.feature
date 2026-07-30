Feature: Ticket Links
  As a user
  I want to create symmetric links between tickets
  So that I can track related tickets

  Background:
    Given a clean tickets directory
    And a ticket exists with ID "link-0001" and title "First ticket"
    And a ticket exists with ID "link-0002" and title "Second ticket"
    And a ticket exists with ID "link-0003" and title "Third ticket"

  Scenario: Link two tickets
    When I run "ticket link link-0001 link-0002"
    Then the command should succeed
    And the output should contain "Added 2 link(s) between 2 tickets"
    And ticket "link-0001" should have "link-0002" in links
    And ticket "link-0002" should have "link-0001" in links

  Scenario: Link three tickets
    When I run "ticket link link-0001 link-0002 link-0003"
    Then the command should succeed
    And the output should contain "Added 6 link(s) between 3 tickets"
    And ticket "link-0001" should have "link-0002" in links
    And ticket "link-0001" should have "link-0003" in links
    And ticket "link-0002" should have "link-0001" in links
    And ticket "link-0002" should have "link-0003" in links
    And ticket "link-0003" should have "link-0001" in links
    And ticket "link-0003" should have "link-0002" in links

  Scenario: Link is idempotent
    Given ticket "link-0001" is linked to "link-0002"
    When I run "ticket link link-0001 link-0002"
    Then the command should succeed
    And the output should be "All links already exist"

  Scenario: Unlink two tickets
    Given ticket "link-0001" is linked to "link-0002"
    When I run "ticket unlink link-0001 link-0002"
    Then the command should succeed
    And the output should be "Removed link: link-0001 <-> link-0002"
    And ticket "link-0001" should not have "link-0002" in links
    And ticket "link-0002" should not have "link-0001" in links

  Scenario: Unlink non-existent link
    When I run "ticket unlink link-0001 link-0002"
    Then the command should fail
    And the output should be "Link not found"

  Scenario: Link with non-existent ticket
    When I run "ticket link link-0001 nonexistent"
    Then the command should fail
    And the output should contain "Error: ticket 'nonexistent' not found"

  Scenario: Partial linking adds only new links
    Given ticket "link-0001" is linked to "link-0002"
    When I run "ticket link link-0001 link-0002 link-0003"
    Then the command should succeed
    And the output should contain "Added 4 link(s) between 3 tickets"

  Scenario: Link appends ids in the order the tickets were named
    When I run "ticket link link-0001 link-0002 link-0003"
    Then the command should succeed
    And ticket "link-0001" should have field "links" with value "[link-0002, link-0003]"
    And ticket "link-0003" should have field "links" with value "[link-0001, link-0002]"

  Scenario: Linking a ticket with no links field creates the array on both sides
    Given a raw ticket file "bare.md" exists with content
      """
      ---
      id: bare-0001
      title: "Bare ticket"
      status: open
      ---

      Body.
      """
    When I run "ticket link bare-0001 link-0002"
    Then the command should succeed
    And the output should be "Added 2 link(s) between 2 tickets"
    And ticket "bare-0001" should have field "links" with value "[link-0002]"
    And ticket "link-0002" should have "bare-0001" in links

  # A ticket linked to itself is data no one can act on, so the whole command is refused
  # rather than half-applied. bash counted the repeated id as a second ticket and recorded it.
  Scenario: Linking a ticket to itself is refused
    When I run "ticket link link-0001 link-0001"
    Then the command should fail
    And stderr should contain "Error: nothing to link: every id resolves to ticket link-0001"
    And ticket "link-0001" should not have "link-0001" in links

  # A repeated id that does NOT collapse the whole set is dropped, so the reported counts are
  # those of the two distinct tickets. bash reported "Added 3 link(s) between 3 tickets".
  Scenario: A repeated id is counted once when other tickets remain
    When I run "ticket link link-0001 link-0001 link-0002"
    Then the command should succeed
    And the output should be "Added 2 link(s) between 2 tickets"
    And ticket "link-0001" should have field "links" with value "[link-0002]"
    And ticket "link-0002" should have field "links" with value "[link-0001]"

  # Edits are confined to the frontmatter block: a body line that merely LOOKS like a field is
  # neither counted nor rewritten. bash's awk matched /^links:/ anywhere in the file, so this
  # shape made "ticket link a b" report 3 added links and mangled the note.
  Scenario: A links line in the body is neither counted nor rewritten
    Given a raw ticket file "body-links.md" exists with content
      """
      ---
      id: body-0001
      title: "Ticket documenting the links field"
      status: open
      ---

      Example of what a linked ticket looks like on disk:

      links: [ghost]
      """
    When I run "ticket link body-0001 link-0002"
    Then the command should succeed
    And the output should be "Added 2 link(s) between 2 tickets"
    And ticket "body-0001" should have field "links" with value "[link-0002]"
    And ticket "body-0001" should contain "links: [ghost]"
    And ticket "link-0002" should have "body-0001" in links

  Scenario: Unlinking leaves a sibling id that contains it intact
    Given a ticket exists with ID "sub-1" and title "Sub one"
    And a ticket exists with ID "sub-11" and title "Sub eleven"
    And ticket "link-0001" is linked to "sub-1"
    And ticket "link-0001" is linked to "sub-11"
    When I run "ticket unlink link-0001 sub-1"
    Then the command should succeed
    And ticket "link-0001" should have field "links" with value "[sub-11]"
